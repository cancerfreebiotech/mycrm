/**
 * batch-import-kevin.js
 * Imports Kevin_01 business card photos into camcard_pending with Gemini OCR.
 *
 * Usage: node batch-import-kevin.js [--dry-run]
 *
 * - Scans each subfolder of Kevin_01
 * - Extracts met_date from folder name prefix (YYYYMMDD / YYYYMM / YYYY)
 * - Sets met_at = full folder name, assignee_label = 'Kevin'
 * - Compresses each JPG/HEIC, uploads to Supabase storage camcard/
 * - Calls Gemini OCR on each card, inserts camcard_pending with full ocr_data
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
const fs = require('fs')
const path = require('path')
const sharp = require('../../node_modules/sharp')
const { createClient } = require('../../node_modules/@supabase/supabase-js')
const { GoogleGenerativeAI } = require('../../node_modules/@google/generative-ai')

const SRC_ROOT = 'C:/Users/PoChen/Downloads/Kevin_01/Kevin_01'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zaqzqcvsckripotuujep.supabase.co'
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

const OCR_PROMPT = `你是一個專業名片辨識助手。名片可能同時包含中文、英文、日文等多種語言的姓名，請分別辨識並填入對應欄位。
從圖中提取以下資訊，回傳純 JSON，不要有任何其他文字：
{"name":"","name_en":"","name_local":"","company":"","company_en":"","company_local":"","job_title":"","department":"","email":"","second_email":"","phone":"","second_phone":"","fax":"","address":"","address_en":"","website":"","linkedin_url":"","facebook_url":"","country_code":null,"rotation":0}

rotation 欄位規則：
- 判斷名片目前的方向，回傳需要順時針旋轉幾度才能讓文字正常閱讀
- 可選值：0（已正確）、90（需順時針轉 90°）、180（上下顛倒）、270（需順時針轉 270°，即逆時針 90°）
- 大多數名片拍攝時是橫向（寬>高），若圖片是直向（高>寬）且文字是橫排，通常需要旋轉

姓名欄位規則（重要）：
- name：中文姓名（漢字中文名，如「王大明」）
- name_en：英文姓名（羅馬字母拼寫，如「David Wang」）
- name_local：日文姓名（日文漢字或假名，如「田中太郎」「タナカ タロウ」）
- 若名片同時有中文、日文、英文姓名，請分別填入對應欄位，不要只填一個
- 若只有一種姓名，依「中文 → 日文 → 英文 → 其他」優先順序填入最適當的欄位
- 若純漢字姓名無法判斷中日文，以中文優先放 name 欄位

country_code 規則：回傳 ISO 2 碼（如 "TW"、"JP"、"US"），依據以下優先順序判斷：
1. 電話號碼國碼（+886→TW、+81→JP、+1→US、+82→KR、+65→SG、+91→IN）
2. 地址內容（含國名、城市、郵遞區號格式）
3. 公司名稱語言特徵（日文假名→JP、韓文→KR）
找不到則回傳 null`

// Extract ISO date from folder name prefix
function extractMetDate(folderName) {
  const m = folderName.match(/^(\d+)/)
  if (!m) return null
  const d = m[1]
  if (d.length >= 8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`
  if (d.length >= 6) return `${d.slice(0,4)}-${d.slice(4,6)}-01`
  if (d.length >= 4) return `${d.slice(0,4)}-01-01`
  return null
}

function pad(n, w) { return String(n).padStart(w, '0') }
function stripJsonFence(text) { return text.replace(/^```json\s*/,'').replace(/\s*```$/,'') }

async function ocrCard(buf) {
  const result = await geminiModel.generateContent([
    OCR_PROMPT,
    { inlineData: { data: buf.toString('base64'), mimeType: 'image/jpeg' } },
  ])
  return JSON.parse(stripJsonFence(result.response.text()))
}

async function processFile(filePath, seq, metAt, metDate) {
  const filename = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const safe = filename.replace(/[^\x00-\x7F]/g,'').replace(/[^a-zA-Z0-9]/g,'').slice(0,20) || `card${pad(seq,4)}`

  const now = new Date()
  const ts = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth()+1,2)}${pad(now.getDate(),2)}_${pad(now.getHours(),2)}${pad(now.getMinutes(),2)}${pad(now.getSeconds(),2)}`
  const storagePath = `camcard/${ts}-${pad(seq,4)}-${safe}-front.jpg`

  try {
    let input = fs.readFileSync(filePath)
    if (ext === '.heic') {
      const heicConvert = require('heic-convert')
      input = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 }))
    }
    const buf = await sharp(input)
      .rotate()
      .resize(1024, 1024, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer()

    if (DRY_RUN) {
      console.log(`[DRY] ${pad(seq,4)} | ${filename}`)
      return
    }

    // Upload
    const { error: uploadErr } = await supabase.storage
      .from('cards')
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (uploadErr) throw new Error('upload: ' + uploadErr.message)

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/cards/${storagePath}`

    // OCR
    let ocrResult = {}
    try {
      ocrResult = await ocrCard(buf)
    } catch (ocrErr) {
      console.log(`  ⚠️  OCR failed: ${ocrErr.message}`)
    }

    const ocr_data = { ...ocrResult, met_at: metAt, met_date: metDate }

    const { error: insertErr } = await supabase.from('camcard_pending').insert({
      image_filename: filename,
      card_img_url: publicUrl,
      storage_path: storagePath,
      ocr_data,
      status: 'pending',
      assignee_label: 'Kevin',
    })
    if (insertErr) throw new Error('insert: ' + insertErr.message)

    const name = ocrResult.name || ocrResult.name_en || ocrResult.name_local || '(blank)'
    console.log(`✅ ${pad(seq,4)} | ${name} | ${filename}`)
  } catch (e) {
    console.log(`❌ ${pad(seq,4)} | ${filename} — ${e.message}`)
  }
}

async function run() {
  const subfolders = fs.readdirSync(SRC_ROOT)
    .filter(name => fs.statSync(path.join(SRC_ROOT, name)).isDirectory())
    .sort()

  console.log(`Found ${subfolders.length} subfolders. DRY_RUN=${DRY_RUN}\n`)

  let seq = 1
  for (const folder of subfolders) {
    const metAt = folder
    const metDate = extractMetDate(folder)
    if (!metDate) { console.log(`⚠️  No date prefix, skipping: ${folder}`); continue }

    const folderPath = path.join(SRC_ROOT, folder)
    const files = fs.readdirSync(folderPath)
      .filter(f => /\.(jpg|jpeg|heic)$/i.test(f))
      .sort()

    console.log(`\n📁 ${folder} → met_date=${metDate} (${files.length} files)`)
    for (const file of files) {
      await processFile(path.join(folderPath, file), seq++, metAt, metDate)
    }
  }
  console.log(`\nDone. Total: ${seq - 1}`)
}

run().catch(e => { console.error(e); process.exit(1) })
