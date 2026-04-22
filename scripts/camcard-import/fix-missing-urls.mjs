/**
 * fix-missing-urls.mjs
 * 為 camcard_pending 中 card_img_url = null 的 pending 卡片補上傳 Storage
 * 支援中文/日文/任意非 ASCII 檔名
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sharp = require('C:/Users/PoChen/mycrm/node_modules/sharp')

const SUPABASE_URL = 'https://zaqzqcvsckripotuujep.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpxY3ZzY2tyaXBvdHV1amVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwNTY1MSwiZXhwIjoyMDg4OTgxNjUxfQ._pcd99Sf2bJ426g_F8yyMzbZb97gKzBSznYmX83RPgU'
const CAMCARD_DIR = 'C:/Users/PoChen/camcard'
const TMP = path.join('C:/Users/PoChen/mycrm/scripts/camcard-import', 'tmp_fix.jpg')
const BUCKET = 'cards'

function makeSafeName(filename, seq) {
  // Strip "-Card Front.jpg" suffix
  const base = filename
    .replace(/-Card Front\.jpg$/i, '')
    .replace(/-Card Front\(\d+\)\.jpg$/i, '')
  const safe = base
    .replace(/[^\x00-\x7F]/g, '')   // remove non-ASCII (Chinese, Japanese, etc.)
    .replace(/[^a-zA-Z0-9]/g, '')   // remove remaining special chars
  return safe.length > 0 ? safe : `card${String(seq).padStart(3, '0')}`
}

function makeTimestamp() {
  const now = new Date()
  const YY = String(now.getFullYear()).slice(-2)
  const MM = String(now.getMonth() + 1).padStart(2, '0')
  const DD = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${YY}${MM}${DD}_${hh}${mm}${ss}`
}

async function fetchPendingBrokenUrl() {
  // Fetch: null URLs, local C:\ paths, and local:// prefix paths
  const [nullRes, localCRes, localPrefixRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/camcard_pending?status=eq.pending&card_img_url=is.null&select=id,image_filename&order=id`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/camcard_pending?status=eq.pending&card_img_url=like.C%3A%25&select=id,image_filename&order=id`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/camcard_pending?status=eq.pending&card_img_url=like.local%3A%2F%2F%25&select=id,image_filename&order=id`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    ),
  ])
  const nullCards = await nullRes.json()
  const localCCards = await localCRes.json()
  const localPrefixCards = await localPrefixRes.json()
  // Deduplicate by id
  const seen = new Set()
  return [...nullCards, ...localCCards, ...localPrefixCards].filter(c => seen.has(c.id) ? false : seen.add(c.id))
}

async function updateRecord(id, cardImgUrl, storagePath) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/camcard_pending?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ card_img_url: cardImgUrl, storage_path: storagePath })
  })
  return res.ok
}

async function compressImage(srcPath, destPath) {
  await sharp(srcPath)
    .rotate()
    .resize(1024, 1024, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile(destPath)
}

async function uploadFile(filePath, storagePath) {
  const buf = fs.readFileSync(filePath)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'image/jpeg',
    },
    body: buf,
  })
  return res
}

async function main() {
  const cards = await fetchPendingBrokenUrl()
  console.log(`找到 ${cards.length} 張需補上傳的卡片\n`)

  let success = 0
  let failed = 0
  const failLog = []
  const ts = makeTimestamp()

  for (let i = 0; i < cards.length; i++) {
    const { id, image_filename } = cards[i]
    const seq = i + 1
    const seqStr = String(seq).padStart(3, '0')
    const sn = makeSafeName(image_filename, seq)
    const storagePath = `pending/${ts}-${seqStr}-${sn}-front.jpg`
    const localPath = path.join(CAMCARD_DIR, image_filename)

    if (!fs.existsSync(localPath)) {
      console.log(`[${seq}/${cards.length}] ⚠ 找不到: ${image_filename}`)
      failed++
      failLog.push(`NOT_FOUND: ${image_filename}`)
      continue
    }

    // Compress
    try {
      await compressImage(localPath, TMP)
    } catch (e) {
      console.log(`[${seq}/${cards.length}] ✗ 壓縮失敗: ${image_filename} — ${e.message}`)
      failed++
      failLog.push(`COMPRESS_FAIL: ${image_filename}`)
      continue
    }

    // Upload
    let uploadRes
    try {
      uploadRes = await uploadFile(TMP, storagePath)
    } catch (e) {
      console.log(`[${seq}/${cards.length}] ✗ 上傳錯誤: ${image_filename} — ${e.message}`)
      failed++
      failLog.push(`UPLOAD_ERROR: ${image_filename}`)
      continue
    }

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      console.log(`[${seq}/${cards.length}] ✗ 上傳失敗(${uploadRes.status}): ${image_filename} — ${err.slice(0,80)}`)
      failed++
      failLog.push(`UPLOAD_FAIL(${uploadRes.status}): ${image_filename}`)
      continue
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
    const ok = await updateRecord(id, publicUrl, storagePath)

    if (ok) {
      console.log(`[${seq}/${cards.length}] ✓ ${image_filename}`)
      success++
    } else {
      console.log(`[${seq}/${cards.length}] ✗ DB更新失敗: ${image_filename}`)
      failed++
      failLog.push(`DB_FAIL: ${image_filename}`)
    }

    // Throttle every 20 uploads
    if (seq % 20 === 0) {
      console.log(`  ── 已處理 ${seq}/${cards.length}，暫停 2 秒...`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  // Cleanup
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP)

  console.log(`\n完成！✓ 成功 ${success}  ✗ 失敗 ${failed}`)
  if (failLog.length > 0) {
    fs.writeFileSync(
      'C:/Users/PoChen/mycrm/scripts/camcard-import/fix-failed.txt',
      failLog.join('\n')
    )
    console.log('失敗清單：scripts/camcard-import/fix-failed.txt')
  }
}

main().catch(console.error)
