/**
 * batch-import-kevin.js
 * Imports Kevin_01 business card photos into camcard_pending (upload only, no OCR).
 * Outputs scripts/camcard-import/kevin-ocr-queue.json for Claude Read tool OCR pass.
 *
 * Usage: node batch-import-kevin.js [--dry-run]
 */
require('dotenv').config({ path: 'C:/Users/PoChen/mycrm/.env.local' })
const fs = require('fs')
const path = require('path')
const sharp = require('C:/Users/PoChen/mycrm/node_modules/sharp')
const { createClient } = require('C:/Users/PoChen/mycrm/node_modules/@supabase/supabase-js')

const SRC_ROOT = 'C:/Users/PoChen/Downloads/Kevin_01/Kevin_01'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zaqzqcvsckripotuujep.supabase.co'
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const QUEUE_FILE = 'C:/Users/PoChen/mycrm/scripts/camcard-import/kevin-ocr-queue.json'

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
      console.log(`[DRY] ${pad(seq,4)} | ${metAt} | ${filename}`)
      return null
    }

    const { error: uploadErr } = await supabase.storage
      .from('cards')
      .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
    if (uploadErr) throw new Error('upload: ' + uploadErr.message)

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/cards/${storagePath}`

    const { data: inserted, error: insertErr } = await supabase.from('camcard_pending').insert({
      image_filename: filename,
      card_img_url: publicUrl,
      storage_path: storagePath,
      ocr_data: { met_at: metAt, met_date: metDate },
      status: 'pending',
      assignee_label: 'Kevin',
    }).select('id').single()
    if (insertErr) throw new Error('insert: ' + insertErr.message)

    console.log(`✅ ${pad(seq,4)} | ${filename}`)
    return { id: inserted.id, file_path: filePath, met_at: metAt, met_date: metDate }
  } catch (e) {
    console.log(`❌ ${pad(seq,4)} | ${filename} — ${e.message}`)
    return null
  }
}

async function run() {
  const subfolders = fs.readdirSync(SRC_ROOT)
    .filter(name => fs.statSync(path.join(SRC_ROOT, name)).isDirectory())
    .sort()

  console.log(`Found ${subfolders.length} subfolders. DRY_RUN=${DRY_RUN}\n`)

  const queue = []
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
      const result = await processFile(path.join(folderPath, file), seq++, metAt, metDate)
      if (result) queue.push(result)
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2))
    console.log(`\n✅ Done. ${queue.length} records created.`)
    console.log(`📝 OCR queue saved to: ${QUEUE_FILE}`)
  } else {
    console.log(`\nDry run done. Total: ${seq - 1}`)
  }
}

run().catch(e => { console.error(e); process.exit(1) })
