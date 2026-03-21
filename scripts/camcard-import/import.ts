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
import Anthropic from '@anthropic-ai/sdk'
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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('❌ 缺少環境變數：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']
const MAX_SIDE = 1024
const JPEG_QUALITY = 85
const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/camcard-import/progress.json')
const FAILED_FILE = path.resolve(process.cwd(), 'scripts/camcard-import/failed.txt')

// ── OCR Prompt (matches existing system prompt) ───────────────────────────

const OCR_PROMPT = `你是名片辨識 AI。請仔細辨識圖片中的名片，提取所有可見資訊並以 JSON 格式回傳。

回傳格式（所有欄位，無資料填 null）：
{
  "name": "中文姓名",
  "name_en": "英文姓名",
  "name_local": "當地語言姓名（非中英文時填入）",
  "company": "中文公司名",
  "company_en": "英文公司名",
  "company_local": "當地語言公司名",
  "job_title": "職稱",
  "email": "主要電子郵件",
  "second_email": "第二電子郵件",
  "phone": "主要電話",
  "second_phone": "第二電話",
  "address": "地址",
  "website": "網站",
  "linkedin_url": "LinkedIn URL",
  "facebook_url": "Facebook URL",
  "country_code": "2字母ISO國碼，如TW/JP/US"
}

只回傳 JSON，不要任何說明文字。`

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const result = { dir: '', dryRun: 0, resume: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') result.dir = args[++i]
    else if (args[i] === '--dry-run') result.dryRun = parseInt(args[++i]) || 10
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

// ── OCR via Claude API ────────────────────────────────────────────────────────

async function ocrImage(imageBuffer: Buffer): Promise<Record<string, string | null>> {
  const base64 = imageBuffer.toString('base64')
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: OCR_PROMPT },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('OCR 回傳格式錯誤')
  return JSON.parse(jsonMatch[0])
}

// ── Upload to Supabase Storage ────────────────────────────────────────────────

async function uploadCard(buffer: Buffer, filename: string): Promise<{ url: string; storagePath: string }> {
  const storagePath = `camcard/${Date.now()}_${path.basename(filename)}.jpg`
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
  ocrData: Record<string, string | null>
  dryRun: boolean
}) {
  if (opts.dryRun) {
    console.log('  [dry-run] OCR:', JSON.stringify(opts.ocrData, null, 2).slice(0, 200))
    return
  }
  const { error } = await supabase.from('camcard_pending').insert({
    image_filename: opts.imageFilename,
    card_img_url: opts.cardImgUrl,
    storage_path: opts.storagePath,
    ocr_data: opts.ocrData,
    status: 'pending',
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
  const { dir, dryRun, resume } = parseArgs()
  const isDryRun = dryRun > 0

  if (!fs.existsSync(dir)) {
    console.error(`❌ 目錄不存在：${dir}`)
    process.exit(1)
  }

  // Collect image files
  const allFiles = fs.readdirSync(dir)
    .filter((f) => SUPPORTED_EXTS.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f))

  if (allFiles.length === 0) {
    console.log('⚠️  目錄中沒有支援的圖檔（jpg/jpeg/png/webp/heic）')
    return
  }

  // Load or reset progress
  const progress = resume ? loadProgress() : { processed: [], failed: [] }
  const processedSet = new Set(progress.processed)

  // Filter out already processed
  const toProcess = isDryRun
    ? allFiles.slice(0, dryRun)
    : allFiles.filter((f) => !processedSet.has(path.basename(f)))

  const total = isDryRun ? toProcess.length : allFiles.length
  let successCount = progress.processed.length
  let failCount = progress.failed.length
  const startTime = Date.now()

  console.log(`\n🚀 名片王匯入${isDryRun ? ` [dry-run: ${dryRun} 張]` : ''}${resume ? ' [resume]' : ''}`)
  console.log(`📁 目錄：${dir}`)
  console.log(`📊 總計：${total} 張 | 待處理：${toProcess.length} 張\n`)

  for (let i = 0; i < toProcess.length; i++) {
    const filePath = toProcess[i]
    const filename = path.basename(filePath)
    const current = isDryRun ? i + 1 : successCount + failCount + 1

    // Progress display
    const elapsed = (Date.now() - startTime) / 1000
    const rate = (i + 1) / Math.max(elapsed, 1)
    const remaining = Math.round((toProcess.length - i - 1) / Math.max(rate, 0.01))
    const eta = remaining > 60 ? `${Math.round(remaining / 60)} 分鐘` : `${remaining} 秒`
    process.stdout.write(
      `\r[進度] ${current} / ${total} 張 | ✅ ${successCount} 成功 | ⚠️  ${failCount} 失敗 | 預計剩餘 ${eta}   `
    )

    try {
      // 1. Compress
      const buffer = await compressImage(filePath)

      // 2. Upload (skip in dry-run)
      let cardImgUrl = '[dry-run]'
      let storagePath = '[dry-run]'
      if (!isDryRun) {
        const uploaded = await uploadCard(buffer, filename)
        cardImgUrl = uploaded.url
        storagePath = uploaded.storagePath
      }

      // 3. OCR
      const ocrData = await ocrImage(buffer)

      // 4. Duplicate detection (skip in dry-run)
      let duplicateContactId: string | null = null
      let matchType: string | null = null
      if (!isDryRun) {
        const dup = await detectDuplicate(ocrData)
        if (dup) { duplicateContactId = dup.contactId; matchType = dup.matchType }
      }

      // 5. Write to DB
      await writePending({ imageFilename: filename, cardImgUrl, storagePath, ocrData, dryRun: isDryRun })

      // 6. Update duplicate info if found
      if (!isDryRun && duplicateContactId) {
        await supabase.from('camcard_pending')
          .update({ duplicate_contact_id: duplicateContactId, match_type: matchType })
          .eq('storage_path', storagePath)
      }

      // 7. Update progress
      successCount++
      if (!isDryRun) {
        progress.processed.push(filename)
        if ((i + 1) % 10 === 0) saveProgress(progress)
      }
    } catch (e) {
      failCount++
      const reason = e instanceof Error ? e.message : String(e)
      progress.failed.push(filename)
      appendFailed(filename, reason)
      if (!isDryRun) saveProgress(progress)
    }
  }

  // Final save
  if (!isDryRun) saveProgress(progress)

  console.log(`\n\n✅ 完成！成功：${successCount} 張 | 失敗：${failCount} 張`)
  if (failCount > 0) console.log(`📋 失敗清單：${FAILED_FILE}`)
  if (!isDryRun) console.log(`\n前往 /admin/camcard 審查匯入結果`)
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
