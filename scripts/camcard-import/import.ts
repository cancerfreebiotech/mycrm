#!/usr/bin/env ts-node
/**
 * CamCard Import Script
 *
 * Reads remaining.json, processes each card:
 * 1. Compress image via sharp
 * 2. Upload to Supabase Storage (cards/ bucket, camcard/ prefix)
 * 3. OCR via analyzeBusinessCard() — uses DB-configured AI model, same as bot
 * 4. Duplicate check vs contacts table
 * 5. Insert into camcard_pending
 * 6. Update progress.json
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/camcard-import/import.ts
 *   npx ts-node --project tsconfig.json scripts/camcard-import/import.ts --limit 50
 *   npx ts-node --project tsconfig.json scripts/camcard-import/import.ts --start 100 --limit 50
 *   npx ts-node --project tsconfig.json scripts/camcard-import/import.ts --dry-run --limit 5
 */

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

// ─── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://zaqzqcvsckripotuujep.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpxY3ZzY2tyaXBvdHV1amVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwNTY1MSwiZXhwIjoyMDg4OTgxNjUxfQ._pcd99Sf2bJ426g_F8yyMzbZb97gKzBSznYmX83RPgU'

// Sleep between each card (ms) — avoid rate limit
const SLEEP_BETWEEN = 2000
// Sleep after error (ms)
const SLEEP_ON_ERROR = 8000
// Max retries for OCR
const OCR_MAX_RETRIES = 2

// ─── Args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const startIdx = args.indexOf('--start')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity
const START = startIdx >= 0 ? parseInt(args[startIdx + 1]) : 0
const DRY_RUN = args.includes('--dry-run')

// ─── Paths ──────────────────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(process.argv[1])
const REMAINING_PATH = path.join(SCRIPT_DIR, 'remaining.json')
const PROGRESS_PATH = path.join(SCRIPT_DIR, 'progress.json')
const FAILED_PATH = path.join(SCRIPT_DIR, 'failed.txt')

// ─── Types ──────────────────────────────────────────────────────────────────
interface CardEntry {
  filename: string
  name: string
  frontPath: string
  backPath: string | null
}

interface CardData {
  name?: string | null
  name_en?: string | null
  name_local?: string | null
  company?: string | null
  company_en?: string | null
  company_local?: string | null
  job_title?: string | null
  department?: string | null
  email?: string | null
  second_email?: string | null
  phone?: string | null
  second_phone?: string | null
  fax?: string | null
  address?: string | null
  address_en?: string | null
  website?: string | null
  linkedin_url?: string | null
  facebook_url?: string | null
  country_code?: string | null
  rotation?: number
  [key: string]: string | number | null | undefined
}

// ─── Supabase client ────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── OCR: use Claude (Anthropic) API ─────────────────────────────────────────
const CLAUDE_MODEL = 'claude-opus-4-6'

function getAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY env var not set')
  return key
}

async function getOcrPrompt(): Promise<string> {
  // Try DB-stored prompt (same priority as getPrompt('ocr_card'))
  const { data } = await supabase
    .from('prompts')
    .select('content')
    .eq('key', 'ocr_card')
    .single()
  if (data?.content) return data.content

  // Fallback: same hardcoded prompt as prompt-constants.ts
  return `你是一個專業名片辨識助手。名片可能同時包含中文、英文、日文等多種語言的姓名，請分別辨識並填入對應欄位。
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
}

async function ocrCard(buffers: Buffer[], prompt: string): Promise<CardData> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: getAnthropicKey() })

  const imageBlocks = buffers.map((buf) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: buf.toString('base64'),
    },
  }))

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        { type: 'text', text: prompt },
      ],
    }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text in Claude response')
  const text = textBlock.text.trim()
  const json = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(json) as CardData
}

async function ocrWithRetry(buffers: Buffer[], prompt: string): Promise<CardData> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= OCR_MAX_RETRIES; attempt++) {
    try {
      return await ocrCard(buffers, prompt)
    } catch (e) {
      lastErr = e
      if (attempt < OCR_MAX_RETRIES) {
        process.stdout.write(` (retry ${attempt})`)
        await sleep(4000)
      }
    }
  }
  throw lastErr
}

// ─── Filename: follow project convention yymmdd_hhmmss-{serial}-{name}-{side}.jpg ──
async function generateCamcardFilename(name: string | undefined, side: 'front' | 'back'): Promise<string> {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const datePrefix = `${yy}${mm}${dd}`

  // Count today's contacts (for serial)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  const { count } = await supabase
    .from('camcard_pending')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay)
  const serial = String((count ?? 0) + 1).padStart(3, '0')

  // Strip non-ASCII (CJK, accented) then strip remaining special chars
  const safeName = name
    ? name.replace(/[^\x00-\x7F]/g, '').replace(/[^a-zA-Z0-9]/g, '')
    : ''
  const namePart = safeName ? `-${safeName}` : (name ? '-card' : '')

  return `${datePrefix}_${hh}${min}${ss}-${serial}${namePart}-${side}.jpg`
}

// ─── Storage upload ─────────────────────────────────────────────────────────
async function uploadToStorage(buf: Buffer, storagePath: string): Promise<string> {
  const { error } = await supabase.storage
    .from('cards')
    .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = supabase.storage.from('cards').getPublicUrl(storagePath)
  return data.publicUrl
}

// ─── Compress ───────────────────────────────────────────────────────────────
async function compressImage(srcPath: string): Promise<Buffer> {
  const normalizedPath = srcPath.replace(/\//g, path.sep)
  return sharp(normalizedPath)
    .rotate()
    .resize(1024, 1024, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer()
}

// ─── Duplicate check ────────────────────────────────────────────────────────
async function checkDuplicate(email: string | null | undefined, name: string | null | undefined): Promise<{ dupId: string | null; matchType: string | null }> {
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .is('deleted_at', null)
      .eq('email', email)
      .maybeSingle()
    if (data) return { dupId: data.id, matchType: 'exact_email' }
  }
  if (name) {
    const { data } = await supabase.rpc('find_similar_contacts', { input_name: name, threshold: 0.7 })
    if (data && data.length > 0) return { dupId: data[0].id, matchType: 'similar_name' }
  }
  return { dupId: null, matchType: null }
}

// ─── Progress ───────────────────────────────────────────────────────────────
function loadProgress(): { processed: string[] } {
  try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) }
  catch { return { processed: [] } }
}
function saveProgress(p: { processed: string[] }) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2))
}
function appendFailed(name: string, reason: string) {
  fs.appendFileSync(FAILED_PATH, `${new Date().toISOString()}\t${name}\t${reason}\n`)
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const remaining: CardEntry[] = JSON.parse(fs.readFileSync(REMAINING_PATH, 'utf8'))
  const progress = loadProgress()
  const processedSet = new Set(progress.processed)

  const toProcess = remaining
    .filter((e) => !processedSet.has(e.name))
    .slice(START, START + (LIMIT === Infinity ? undefined as unknown as number : LIMIT))

  console.log(`📋 Total in remaining.json: ${remaining.length}`)
  console.log(`✅ Already processed: ${progress.processed.length}`)
  console.log(`🔄 Will process: ${toProcess.length} (start=${START}, limit=${LIMIT === Infinity ? 'all' : LIMIT})`)
  if (DRY_RUN) console.log('🧪 DRY RUN — no writes\n')
  else console.log()

  // Pre-load prompt once; verify API key exists early
  getAnthropicKey()
  const ocrPrompt = await getOcrPrompt()
  console.log(`🤖 AI model: ${CLAUDE_MODEL}`)
  console.log(`💬 Prompt source: ${ocrPrompt.startsWith('你是') ? 'DB/default' : 'custom'}\n`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i]
    const label = `[${i + 1}/${toProcess.length}] ${entry.name}`
    process.stdout.write(`${label} ... `)

    try {
      // 1. Compress
      const frontBuf = await compressImage(entry.frontPath)
      let backBuf: Buffer | null = null
      if (entry.backPath) {
        try { backBuf = await compressImage(entry.backPath) }
        catch { process.stdout.write('(back compress failed, front only) ') }
      }

      if (DRY_RUN) {
        console.log(`✓ dry-run [front${backBuf ? '+back' : ''}]`)
        progress.processed.push(entry.name)
        successCount++
        continue
      }

      // 2. Generate filenames following project convention
      const frontFilename = await generateCamcardFilename(entry.name, 'front')
      const frontStoragePath = `camcard/${frontFilename}`
      const frontUrl = await uploadToStorage(frontBuf, frontStoragePath)

      let backUrl: string | null = null
      let backStoragePath: string | null = null
      if (backBuf) {
        const backFilename = await generateCamcardFilename(entry.name, 'back')
        backStoragePath = `camcard/${backFilename}`
        backUrl = await uploadToStorage(backBuf, backStoragePath)
      }

      // 3. OCR (with retry)
      const bufs = backBuf ? [frontBuf, backBuf] : [frontBuf]
      const ocrData = await ocrWithRetry(bufs, ocrPrompt)

      // Name fallback: if OCR couldn't extract name, use filename hint
      if (!ocrData.name && !ocrData.name_en && !ocrData.name_local) {
        if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(entry.name)) {
          ocrData.name = entry.name       // CJK → name field
        } else {
          ocrData.name_en = entry.name    // ASCII → name_en field
        }
      }

      // 4. Duplicate check
      const { dupId, matchType } = await checkDuplicate(ocrData.email, ocrData.name || ocrData.name_en)

      // 5. Insert into camcard_pending
      const { error: insertErr } = await supabase.from('camcard_pending').insert({
        image_filename: entry.filename,
        card_img_url: frontUrl,
        back_img_url: backUrl,
        storage_path: frontStoragePath,
        back_storage_path: backStoragePath,
        ocr_data: ocrData,
        status: 'pending',
        duplicate_contact_id: dupId,
        match_type: matchType,
      })
      if (insertErr) throw new Error(`DB insert: ${insertErr.message}`)

      // 6. Update progress
      progress.processed.push(entry.name)
      saveProgress(progress)
      successCount++

      const dupNote = dupId ? ` ⚠️ dup(${matchType})` : ''
      const sideNote = backBuf ? '+back' : ''
      console.log(`✓ [${sideNote || 'front'}]${dupNote}`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`✗ ${msg}`)
      appendFailed(entry.name, msg)
      failCount++
      await sleep(SLEEP_ON_ERROR)
      continue
    }

    // Rate limit sleep between successful calls
    await sleep(SLEEP_BETWEEN)
  }

  console.log('')
  console.log('─────────────────────────────────────────────')
  console.log(`✅ Success: ${successCount}`)
  console.log(`❌ Failed:  ${failCount}`)
  console.log(`📁 Total processed so far: ${progress.processed.length} / ${remaining.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
