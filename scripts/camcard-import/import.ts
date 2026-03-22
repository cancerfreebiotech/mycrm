/**
 * CamCard Batch Import Script
 *
 * Usage:
 *   npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos
 *   npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos --dry-run 10
 *   npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos --resume
 *
 * Env (can use .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import sharp from 'sharp'


// ── Config ──────────────────────────────────────────────────────────────────

// Load .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
  console.error('❌ 缺少環境變數：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、GEMINI_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']
const MAX_SIDE = 1024
const JPEG_QUALITY = 85
const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/camcard-import/progress.json')
const FAILED_FILE = path.resolve(process.cwd(), 'scripts/camcard-import/failed.txt')

// ── OCR Prompt (matches existing system prompt) ───────────────────────────

const OCR_PROMPT = `你是一個專業名片辨識助手。名片可能同時包含中文、英文、日文等多種語言的姓名，請分別辨識並填入對應欄位。可能有正面和背面兩張圖，請合併提取所有可見資訊。
從圖中提取以下資訊，回傳純 JSON，不要有任何其他文字：
{"name":"","name_en":"","name_local":"","company":"","company_en":"","company_local":"","job_title":"","department":"","email":"","second_email":"","phone":"","second_phone":"","fax":"","address":"","address_en":"","website":"","linkedin_url":"","facebook_url":"","country_code":null}

姓名欄位規則（重要）：
- name：中文姓名（漢字中文名，如「王大明」）
- name_en：英文姓名（羅馬字母拼寫，如「David Wang」）
- name_local：日文姓名（日文漢字或假名，如「田中太郎」「タナカ タロウ」）
- 若名片同時有中文、日文、英文姓名，請分別填入對應欄位，不要只填一個
- 若只有一種姓名，依「中文 → 日文 → 英文 → 其他」優先順序填入最適當的欄位
- 若純漢字姓名無法判斷中日文，以中文優先放 name 欄位

地址規則：若有多個地址，中文/日文地址放 address，英文地址放 address_en。

country_code 規則：回傳 ISO 2 碼（如 "TW"、"JP"、"US"），依據以下優先順序判斷：
1. 電話號碼國碼（+886→TW、+81→JP、+1→US、+82→KR、+65→SG、+91→IN）
2. 地址內容（含國名、城市、郵遞區號格式）
3. 公司名稱語言特徵（日文假名→JP、韓文→KR）
找不到則回傳 null

若有辨識到上述欄位以外的額外資訊（如 QR code 內容、第三電話等），以額外 JSON key 附加在同一物件中。
無資料的欄位填 null，只回傳 JSON，不要任何說明文字。`

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const result = { dir: '', dryRun: 0, resume: false, limit: 0 }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') result.dir = args[++i]
    else if (args[i] === '--dry-run') result.dryRun = parseInt(args[++i]) || 10
    else if (args[i] === '--limit') result.limit = parseInt(args[++i]) || 0
    else if (args[i] === '--resume') result.resume = true
  }
  if (!result.dir) {
    console.error('❌ 必須提供 --dir 參數')
    process.exit(1)
  }
  return result
}

// ── Progress ─────────────────────────────────────────────────────────────────

interface Progress {
  processed: string[]
  failed: string[]
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')) } catch { /* ignore */ }
  }
  return { processed: [], failed: [] }
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2))
}

function appendFailed(filename: string, reason: string) {
  fs.appendFileSync(FAILED_FILE, `${filename}\t${reason}\n`)
}

// ── Image helpers ─────────────────────────────────────────────────────────────

async function compressImage(filePath: string): Promise<Buffer> {
  const img = sharp(filePath)
  const meta = await img.metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  let pipeline = img.rotate() // auto-rotate from EXIF
  if (w > MAX_SIDE || h > MAX_SIDE) {
    pipeline = pipeline.resize(MAX_SIDE, MAX_SIDE, { fit: 'inside' })
  }
  return pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer()
}

// ── OCR via Gemini API ────────────────────────────────────────────────────────

async function ocrImages(buffers: Buffer[]): Promise<Record<string, string | null>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const imageParts = buffers.map((buf) => ({
    inlineData: { mimeType: 'image/jpeg' as const, data: buf.toString('base64') },
  }))
  const result = await model.generateContent([OCR_PROMPT, ...imageParts])
  const text = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('OCR 回傳格式錯誤')
  return JSON.parse(jsonMatch[0])
}

// ── Group front/back pairs ────────────────────────────────────────────────────

interface CardGroup {
  baseName: string
  frontPath: string
  backPath: string | null
}

function groupFrontBack(files: string[]): CardGroup[] {
  const fronts = new Map<string, string>()
  const backs = new Map<string, string>()

  for (const f of files) {
    const filename = path.basename(f)
    if (filename.includes('-Card Front')) {
      const base = filename.replace(/-Card Front\.jpg$/i, '')
      fronts.set(base, f)
    } else if (filename.includes('-Card Back')) {
      // Strip "(2)" duplicates — keep first occurrence
      const base = filename.replace(/-Card Back(\(\d+\))?\.jpg$/i, '')
      if (!backs.has(base)) backs.set(base, f)
    }
  }

  const groups: CardGroup[] = []
  for (const [base, frontPath] of fronts) {
    groups.push({ baseName: base, frontPath, backPath: backs.get(base) ?? null })
  }
  return groups
}

// ── Upload to Supabase Storage ────────────────────────────────────────────────

function stagingFilename(baseName: string, side: 'front' | 'back', index: number): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const serial = String(index + 1).padStart(3, '0')
  const safeName = baseName.replace(/[\s,./\\<>:"|?*]/g, '')
  return `${yy}${mm}${dd}_${hh}${min}${ss}-${serial}-${safeName}-${side}.jpg`
}

async function uploadCard(buffer: Buffer, baseName: string, side: 'front' | 'back', index: number): Promise<{ url: string; storagePath: string }> {
  const filename = stagingFilename(baseName, side, index)
  const storagePath = `camcard/${filename}`
  const { error } = await supabase.storage.from('cards').upload(storagePath, buffer, { contentType: 'image/jpeg' })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = supabase.storage.from('cards').getPublicUrl(storagePath)
  return { url: data.publicUrl, storagePath }
}

// ── Write to camcard_pending ──────────────────────────────────────────────────

async function writePending(opts: {
  imageFilename: string
  cardImgUrl: string
  storagePath: string
  backImgUrl?: string
  backStoragePath?: string
  ocrData: Record<string, string | null>
  dryRun: boolean
  fileMtime?: string
}) {
  if (opts.dryRun) {
    console.log('  [dry-run] OCR:', JSON.stringify(opts.ocrData, null, 2).slice(0, 200))
    return
  }
  const { error } = await supabase.from('camcard_pending').insert({
    image_filename: opts.imageFilename,
    card_img_url: opts.cardImgUrl,
    storage_path: opts.storagePath,
    back_img_url: opts.backImgUrl ?? null,
    back_storage_path: opts.backStoragePath ?? null,
    ocr_data: opts.ocrData,
    status: 'pending',
    created_at: opts.fileMtime ?? new Date().toISOString(),
  })
  if (error) throw new Error(`DB insert failed: ${error.message}`)
}

// ── Duplicate detection ───────────────────────────────────────────────────────

async function detectDuplicate(ocrData: Record<string, string | null>): Promise<{ contactId: string; matchType: string } | null> {
  if (ocrData.email) {
    const { data } = await supabase.from('contacts').select('id').eq('email', ocrData.email).maybeSingle()
    if (data) return { contactId: data.id, matchType: 'exact_email' }
  }
  const name = ocrData.name || ocrData.name_en
  if (name) {
    const { data } = await supabase.rpc('find_similar_contact_by_name', { search_name: name }).maybeSingle() as { data: { id: string } | null }
    if (data) return { contactId: data.id, matchType: 'similar_name' }
  }
  return null
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { dir, dryRun, resume, limit } = parseArgs()
  const isDryRun = dryRun > 0

  if (!fs.existsSync(dir)) {
    console.error(`❌ 目錄不存在：${dir}`)
    process.exit(1)
  }

  // Collect image files and group front/back pairs
  const allFiles = fs.readdirSync(dir)
    .filter((f) => SUPPORTED_EXTS.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f))

  if (allFiles.length === 0) {
    console.log('⚠️  目錄中沒有支援的圖檔（jpg/jpeg/png/webp/heic）')
    return
  }

  const allGroups = groupFrontBack(allFiles)
  const backCount = allGroups.filter((g) => g.backPath).length

  // Load or reset progress
  const progress = resume ? loadProgress() : { processed: [], failed: [] }
  const processedSet = new Set(progress.processed)

  // Filter out already processed groups (keyed by base name)
  let toProcess = isDryRun
    ? allGroups.slice(0, dryRun)
    : allGroups.filter((g) => !processedSet.has(g.baseName))
  if (!isDryRun && limit > 0) toProcess = toProcess.slice(0, limit)

  const total = isDryRun ? toProcess.length : allGroups.length
  let successCount = progress.processed.length
  let failCount = progress.failed.length
  const startTime = Date.now()

  console.log(`\n🚀 名片王匯入${isDryRun ? ` [dry-run: ${dryRun} 筆]` : ''}${resume ? ' [resume]' : ''}`)
  console.log(`📁 目錄：${dir}`)
  console.log(`📊 總計：${total} 筆（含正反面配對 ${backCount} 組） | 待處理：${toProcess.length} 筆\n`)

  for (let i = 0; i < toProcess.length; i++) {
    const group = toProcess[i]
    const current = isDryRun ? i + 1 : successCount + failCount + 1
    const hasBack = !!group.backPath
    const label = group.baseName + (hasBack ? ' [正+背]' : '')

    // Progress display
    const elapsed = (Date.now() - startTime) / 1000
    const rate = (i + 1) / Math.max(elapsed, 1)
    const remaining = Math.round((toProcess.length - i - 1) / Math.max(rate, 0.01))
    const eta = remaining > 60 ? `${Math.round(remaining / 60)} 分鐘` : `${remaining} 秒`
    process.stdout.write(
      `\r[進度] ${current} / ${total} 筆 | ✅ ${successCount} 成功 | ⚠️  ${failCount} 失敗 | 預計剩餘 ${eta}   `
    )

    try {
      // 1. Compress front (+ back if exists)
      const frontBuffer = await compressImage(group.frontPath)
      const backBuffer = group.backPath ? await compressImage(group.backPath) : null

      // 2. Upload (skip in dry-run)
      let cardImgUrl = '[dry-run]'
      let storagePath = '[dry-run]'
      let backImgUrl: string | undefined
      let backStoragePath: string | undefined
      if (!isDryRun) {
        const uploaded = await uploadCard(frontBuffer, group.baseName, 'front', i)
        cardImgUrl = uploaded.url
        storagePath = uploaded.storagePath
        if (backBuffer && group.backPath) {
          const uploadedBack = await uploadCard(backBuffer, group.baseName, 'back', i)
          backImgUrl = uploadedBack.url
          backStoragePath = uploadedBack.storagePath
        }
      }

      // 3. OCR (send both images if back exists)
      const buffers = backBuffer ? [frontBuffer, backBuffer] : [frontBuffer]
      const ocrData = await ocrImages(buffers)

      // 4. Duplicate detection (skip in dry-run)
      let duplicateContactId: string | null = null
      let matchType: string | null = null
      if (!isDryRun) {
        const dup = await detectDuplicate(ocrData)
        if (dup) { duplicateContactId = dup.contactId; matchType = dup.matchType }
      }

      // 5. Write to DB (use fixed early date so camcard contacts sort before manual imports)
      await writePending({
        imageFilename: path.basename(group.frontPath),
        cardImgUrl, storagePath,
        backImgUrl, backStoragePath,
        ocrData, dryRun: isDryRun,
        fileMtime: '2020-01-01T00:00:00.000Z',
      })

      // 6. Update duplicate info if found
      if (!isDryRun && duplicateContactId) {
        await supabase.from('camcard_pending')
          .update({ duplicate_contact_id: duplicateContactId, match_type: matchType })
          .eq('storage_path', storagePath)
      }

      // 7. Update progress
      successCount++
      if (!isDryRun) {
        progress.processed.push(group.baseName)
        if ((i + 1) % 10 === 0) saveProgress(progress)
      }

      if (isDryRun) console.log(`\n  ↳ ${label}`)
    } catch (e) {
      failCount++
      const reason = e instanceof Error ? e.message : String(e)
      progress.failed.push(group.baseName)
      appendFailed(path.basename(group.frontPath), reason)
      if (!isDryRun) saveProgress(progress)
    }
  }

  // Final save
  if (!isDryRun) saveProgress(progress)

  console.log(`\n\n✅ 完成！成功：${successCount} 筆 | 失敗：${failCount} 筆`)
  if (failCount > 0) console.log(`📋 失敗清單：${FAILED_FILE}`)
  if (!isDryRun) console.log(`\n前往 /admin/camcard 審查匯入結果`)
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
