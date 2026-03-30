const https = require('https')
const sharp = require('C:/Users/PoChen/mycrm/node_modules/sharp')

const SUPABASE_URL = 'https://zaqzqcvsckripotuujep.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpxY3ZzY2tyaXBvdHV1amVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwNTY1MSwiZXhwIjoyMDg4OTgxNjUxfQ._pcd99Sf2bJ426g_F8yyMzbZb97gKzBSznYmX83RPgU'
const DIR = 'C:/Users/PoChen/camcard'

const CARDS = JSON.parse(process.argv[2])

function makeFilename(name, serial, side) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth()+1).padStart(2,'0')
  const dd = String(now.getDate()).padStart(2,'0')
  const hh = String(now.getHours()).padStart(2,'0')
  const mi = String(now.getMinutes()).padStart(2,'0')
  const ss = String(now.getSeconds()).padStart(2,'0')
  const ser = String(serial).padStart(3,'0')
  let safe = name.replace(/[^\x00-\x7F]/g,'').replace(/[^a-zA-Z0-9]/g,'')
  if (!safe) safe = `card${ser}`
  return `${yy}${mm}${dd}_${hh}${mi}${ss}-${ser}-${safe}-${side}.jpg`
}

function upload(buf, storagePath) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/cards/${storagePath}`)
    const req = https.request({ method:'POST', hostname:url.hostname, path:url.pathname,
      headers:{ 'Authorization':`Bearer ${KEY}`, 'Content-Type':'image/jpeg', 'Content-Length':buf.length }
    }, res => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve({status:res.statusCode,body:b})) })
    req.on('error', reject); req.write(buf); req.end()
  })
}

function insertRecord(row) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(row)
    const url = new URL(`${SUPABASE_URL}/rest/v1/camcard_pending`)
    const req = https.request({ method:'POST', hostname:url.hostname, path:url.pathname,
      headers:{ 'Authorization':`Bearer ${KEY}`, 'apikey':KEY,
        'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body), 'Prefer':'return=minimal' }
    }, res => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve({status:res.statusCode,body:b})) })
    req.on('error', reject); req.write(body); req.end()
  })
}

async function run() {
  for (let i = 0; i < CARDS.length; i++) {
    const c = CARDS[i]
    const serial = (c.globalSerial || i+1)
    try {
      const frontBuf = await sharp(`${DIR}/${c.name}-Card Front.jpg`).rotate().resize(1024,1024,{fit:'inside'}).jpeg({quality:85}).toBuffer()
      const frontPath = `camcard/${makeFilename(c.name, serial, 'front')}`
      const fr = await upload(frontBuf, frontPath)
      if (fr.status !== 200 && fr.status !== 201) { console.log(`❌ ${c.name} 上傳失敗 ${fr.status}: ${fr.body}`); continue }
      const frontUrl = `${SUPABASE_URL}/storage/v1/object/public/cards/${frontPath}`

      let backUrl = null, backPath = null
      if (c.hasBack) {
        try {
          const backBuf = await sharp(`${DIR}/${c.name}-Card Back.jpg`).rotate().resize(1024,1024,{fit:'inside'}).jpeg({quality:85}).toBuffer()
          backPath = `camcard/${makeFilename(c.name, serial, 'back')}`
          const br = await upload(backBuf, backPath)
          if (br.status === 200 || br.status === 201) backUrl = `${SUPABASE_URL}/storage/v1/object/public/cards/${backPath}`
        } catch(e) { console.log(`  ⚠️ ${c.name} 背面略過`) }
      }

      const row = {
        image_filename: `${c.name}-Card Front.jpg`,
        card_img_url: frontUrl, storage_path: frontPath,
        back_img_url: backUrl, back_storage_path: backPath,
        ocr_data: c.ocr,
        status: 'pending', created_at: '2020-01-01T00:00:00.000Z',
        duplicate_contact_id: null, match_type: null
      }
      const ir = await insertRecord(row)
      if (ir.status === 201) console.log(`✅ ${c.name}`)
      else console.log(`❌ ${c.name} DB ${ir.status}: ${ir.body}`)
    } catch(e) { console.log(`❌ ${c.name} ${e.message}`) }
  }
}
run().catch(e => { console.error(e); process.exit(1) })
