const sharp = require('C:/Users/PoChen/mycrm/node_modules/sharp')
const fs = require('fs')
const path = require('path')
const https = require('https')

const SUPABASE_URL = 'https://zaqzqcvsckripotuujep.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpxY3ZzY2tyaXBvdHV1amVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwNTY1MSwiZXhwIjoyMDg4OTgxNjUxfQ._pcd99Sf2bJ426g_F8yyMzbZb97gKzBSznYmX83RPgU'
const CAMCARD_DIR = 'C:/Users/PoChen/camcard'
const TMP = 'C:/Users/PoChen/mycrm/scripts/camcard-import/tmp_upload.jpg'

const cards = [
  { name: '李克中', id: '88aa3b60-6f54-48e3-852d-c72c02b30788', hasBack: true },
  { name: '李典忠', id: '8fd8d265-7fe0-4fac-8371-898e81890743', hasBack: true },
  { name: '李冠志', id: 'b1e36008-b926-4571-a008-d3420b8e6fcc', hasBack: false },
  { name: '李冬陽', id: 'f009a2d1-ebd1-4819-91e6-3db9a0033c85', hasBack: false },
  { name: '李千慧', id: 'c48f453d-d9a4-4ddc-ab78-36e745193bc8', hasBack: true },
  { name: '李博榮', id: 'e154a76e-87b0-4ac4-ae46-be319434a5c0', hasBack: false },
  { name: '李厚穎', id: 'ac932b59-02e9-46a5-aa9f-726604d7503a', hasBack: true },
  { name: '李厚諒', id: '6a69d95f-e130-4bb2-acca-bb3e7746252d', hasBack: false },
  { name: '李台威', id: 'c6e579ae-65a4-4ae3-9086-f9eb607eb77f', hasBack: false },
  { name: '李君曜', id: '81bad42d-4260-4499-8cab-8d8b0a0aa9d6', hasBack: false },
]

function uploadBuffer(buf, storagePath) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/cards/${storagePath}`)
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': buf.length,
      }
    }
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function patchRecord(id, fields) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(fields)
    const url = new URL(`${SUPABASE_URL}/rest/v1/camcard_pending?id=eq.${id}`)
    const options = {
      method: 'PATCH',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }
    const req = https.request(options, (res) => {
      let b = ''
      res.on('data', d => b += d)
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function makeFilename(name, serial, side) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const ser = String(serial).padStart(3, '0')
  // 移除非 ASCII，再移除非字母數字
  let safeName = name.replace(/[^\x00-\x7F]/g, '').replace(/[^a-zA-Z0-9]/g, '')
  if (!safeName) safeName = `card${ser}`
  return `${yy}${mm}${dd}_${hh}${min}${ss}-${ser}-${safeName}-${side}.jpg`
}

async function processCard(card, serial) {
  const frontPath = `${CAMCARD_DIR}/${card.name}-Card Front.jpg`
  const backPath = card.hasBack ? `${CAMCARD_DIR}/${card.name}-Card Back.jpg` : null

  // 壓縮正面
  const frontBuf = await sharp(frontPath).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()
  const frontStoragePath = `camcard/${makeFilename(card.name, serial, 'front')}`
  const frontRes = await uploadBuffer(frontBuf, frontStoragePath)
  if (frontRes.status !== 200 && frontRes.status !== 201) {
    console.log(`❌ ${card.name} 正面上傳失敗 HTTP ${frontRes.status}: ${frontRes.body}`)
    return
  }
  const frontUrl = `${SUPABASE_URL}/storage/v1/object/public/cards/${frontStoragePath}`

  const updateFields = { card_img_url: frontUrl, storage_path: frontStoragePath }

  // 壓縮背面（若有）
  if (backPath) {
    try {
      const backBuf = await sharp(backPath).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()
      const backStoragePath = `camcard/${makeFilename(card.name, serial, 'back')}`
      const backRes = await uploadBuffer(backBuf, backStoragePath)
      if (backRes.status === 200 || backRes.status === 201) {
        updateFields.back_img_url = `${SUPABASE_URL}/storage/v1/object/public/cards/${backStoragePath}`
        updateFields.back_storage_path = backStoragePath
      }
    } catch (e) {
      console.log(`  ⚠️ ${card.name} 背面壓縮失敗，略過`)
    }
  }

  await patchRecord(card.id, updateFields)
  console.log(`✅ ${card.name} → ${frontUrl}`)
}

async function main() {
  for (let i = 0; i < cards.length; i++) {
    await processCard(cards[i], i + 1)
  }
  console.log('\n完成！')
}

main().catch(e => { console.error(e); process.exit(1) })
