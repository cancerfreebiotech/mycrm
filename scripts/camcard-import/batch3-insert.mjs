/**
 * batch3-insert.mjs — 批次上傳並寫入 camcard_pending
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const sharp = require('C:/Users/PoChen/mycrm/node_modules/sharp')

const SUPABASE_URL = 'https://zaqzqcvsckripotuujep.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphcXpxY3ZzY2tyaXBvdHV1amVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQwNTY1MSwiZXhwIjoyMDg4OTgxNjUxfQ._pcd99Sf2bJ426g_F8yyMzbZb97gKzBSznYmX83RPgU'
const CAMCARD_DIR = 'C:/Users/PoChen/camcard'
const TMP_F = 'C:/Users/PoChen/mycrm/scripts/camcard-import/tmp_front.jpg'
const TMP_B = 'C:/Users/PoChen/mycrm/scripts/camcard-import/tmp_back.jpg'
const BUCKET = 'cards'
const PROGRESS_FILE = 'C:/Users/PoChen/mycrm/scripts/camcard-import/progress.json'

function makeTimestamp() {
  const now = new Date()
  const YY = String(now.getFullYear()).slice(-2)
  const MM = String(now.getMonth()+1).padStart(2,'0')
  const DD = String(now.getDate()).padStart(2,'0')
  const hh = String(now.getHours()).padStart(2,'0')
  const mm = String(now.getMinutes()).padStart(2,'0')
  const ss = String(now.getSeconds()).padStart(2,'0')
  return `${YY}${MM}${DD}_${hh}${mm}${ss}`
}

function makeSafeName(name) {
  const safe = name.replace(/[^\x00-\x7F]/g,'').replace(/[^a-zA-Z0-9]/g,'')
  return safe.length > 0 ? safe : null
}

async function compress(src, dest) {
  await sharp(src).rotate().resize(1024,1024,{fit:'inside'}).jpeg({quality:85}).toFile(dest)
}

async function upload(filePath, storagePath) {
  const buf = fs.readFileSync(filePath)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'image/jpeg' },
    body: buf,
  })
  return res
}

async function checkDuplicate(email, name) {
  if (email) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(email)}&select=id&limit=1`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    })
    const d = await r.json()
    if (d && d.length > 0) return { id: d[0].id, type: 'email' }
  }
  if (name) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/find_similar_contact_by_name`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const d = await r.json()
    if (d && d.length > 0) return { id: d[0].id, type: 'name' }
  }
  return null
}

async function insertPending(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/camcard_pending`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    },
    body: JSON.stringify(row)
  })
  return res.ok
}

const CARDS = [
  {
    name: '許絲茵', frontFile: '許絲茵-Card Front.jpg', backFile: null,
    ocr: {"name":"許絲茵","name_en":"Szuyin Hsu","name_local":"許絲茵","company":"独立行政法人 日本貿易振興機構","company_en":"JETRO","company_local":"","job_title":"","department":"イノベーション部 ビジネスデベロップメント課","email":"Szuyin_Hsu@jetro.go.jp","second_email":"","phone":"03-3582-8347","second_phone":"","fax":"03-3505-6579","address":"〒107-6006 東京都港区赤坂1-12-32 アーク森ビル6階","address_en":"","website":"https://www.jetro.go.jp","linkedin_url":"","facebook_url":"","country_code":"JP"}
  },
  {
    name: '許綺珍', frontFile: '許綺珍-Card Front.jpg', backFile: null,
    ocr: {"name":"許綺珍","name_en":"Serena Hsu","name_local":"","company":"和鼎資產管理股份有限公司","company_en":"","company_local":"","job_title":"副總","department":"","email":"serena.hsu@hyiasset.com","second_email":"","phone":"02 2314 6699#2754","second_phone":"0975 207 806","fax":"02 2314 7999","address":"104台北市中山區中山北路二段42號10樓","address_en":"","website":"","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許能竣', frontFile: '許能竣-Card Front.jpg', backFile: null,
    ocr: {"name":"許能竣","name_en":"Deya","name_local":"","company":"品卓企業股份有限公司","company_en":"UNI-PARAGON ENTERPRISE CO., LTD","company_local":"","job_title":"董事長","department":"","email":"deya@deya.tw","second_email":"","phone":"+886-2-87515757#200","second_phone":"","fax":"+886-2-87515116","address":"台北市114內湖區瑞光路583巷21號5F-6","address_en":"5F-6, No.21, Lane 583, Ruiguang rd., Neihu District, Taipei City, Taiwan 114","website":"www.deya.tw","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許良源', frontFile: '許良源-Card Front.jpg', backFile: null,
    ocr: {"name":"許良源","name_en":"David","name_local":"","company":"弗利思特文化事業股份有限公司","company_en":"","company_local":"","job_title":"董事長","department":"","email":"david@flst-media.com","second_email":"","phone":"02-2889-1313","second_phone":"0909 013 133","fax":"02-2889-1353","address":"台北市111士林區後港街98號4樓","address_en":"4F., No. 98, Hougang St., Shilin Dist., Taipei City 111, Taiwan","website":"","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許萌芳', frontFile: '許萌芳-Card Front.jpg', backFile: null,
    ocr: {"name":"許萌芳","name_en":"","name_local":"","company":"行政院農業委員會","company_en":"","company_local":"","job_title":"技正","department":"科技盛 研究發展科","email":"mengfang@mail.coa.gov.tw","second_email":"","phone":"02-2312-4058","second_phone":"","fax":"02-2312-5818","address":"10014台北市南海路37號","address_en":"","website":"","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許賀雅', frontFile: '許賀雅-Card Front.jpg', backFile: null,
    ocr: {"name":"許賀雅","name_en":"Nora Hsu","name_local":"","company":"Pagoda Projects","company_en":"Pagoda Projects","company_local":"","job_title":"Programme Support Manager","department":"","email":"NORA.HSU@PAGODAPROJECTS.COM","second_email":"","phone":"+886 0956 155 118","second_phone":"","fax":"","address":"B1, 343 Changchun road, Songshan district, Taipei, Taiwan","address_en":"","website":"www.pagodaprojects.com","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許金榮', frontFile: '許金榮-Card Front.jpg', backFile: null,
    ocr: {"name":"許金榮","name_en":"","name_local":"","company":"漢民科技股份有限公司","company_en":"Hermes Epitek","company_local":"","job_title":"副董事長","department":"董事長暨總經理室","email":"CYShu@hermes.com.tw","second_email":"","phone":"886-3-5790022 ext.6500","second_phone":"","fax":"886-3-6686334","address":"30077 新竹市科學園區研新一路18號","address_en":"","website":"","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許銘芬', frontFile: '許銘芬-Card Front.jpg', backFile: null,
    ocr: {"name":"許銘芬","name_en":"Ming-Fen Hsu","name_local":"","company":"美商安美睿生技有限公司","company_en":"Amarex Taiwan, LLC","company_local":"","job_title":"Clinical Development Manager","department":"","email":"mingfenh@amarextw.com","second_email":"","phone":"+886-2-2655-3391","second_phone":"","fax":"","address":"台北115南港區三重路19-10號2樓","address_en":"2F., No.19-10, Sanchong Rd., Nangang District, Taipei 115, Taiwan","website":"www.amarextw.com","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '許雅涵', frontFile: '許雅涵-Card Front.jpg', backFile: null,
    ocr: {"name":"許雅涵","name_en":"Jill Hsu","name_local":"","company":"沛爾生技醫藥股份有限公司","company_en":"Pell BMT","company_local":"","job_title":"業務","department":"事業發展處 業務部","email":"jillhsu@pellbmt.com","second_email":"","phone":"+886(0)7-3492298 ext.2105","second_phone":"+886(0)937-560369","fax":"+886(0)7-3492295","address":"台北市內湖區新湖二路87號4樓","address_en":"4F, No. 87, Xinhu 2nd Rd., Neihu Dist., Taipei City 114, Taiwan (R.O.C.)","website":"www.pellbmt.com","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
  {
    name: '詹佳穎', frontFile: '詹佳穎-Card Front.jpg', backFile: null,
    ocr: {"name":"詹佳穎","name_en":"Mandy Chan","name_local":"","company":"方略電子股份有限公司","company_en":"PANEL SEMI","company_local":"","job_title":"數位行銷","department":"","email":"mandy.chan@panelsemi.com","second_email":"","phone":"06-5899866","second_phone":"0932080405","fax":"06-5892188","address":"23143新北市新店區復興里北新路三段207號15樓","address_en":"","website":"","linkedin_url":"","facebook_url":"","country_code":"TW"}
  },
]

async function main() {
  const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE))
  const ts = makeTimestamp()
  let seq = 145 // starting sequence for this batch
  let success = 0, failed = 0

  for (const card of CARDS) {
    const seqStr = String(seq).padStart(3,'0')
    const safeName = makeSafeName(card.name) || `card${seqStr}`
    const frontStoragePath = `pending/${ts}-${seqStr}-${safeName}-front.jpg`
    const frontLocalPath = path.join(CAMCARD_DIR, card.frontFile)

    // Compress & upload front
    try {
      await compress(frontLocalPath, TMP_F)
    } catch(e) {
      console.log(`[${seq}] ✗ 壓縮失敗 ${card.name}: ${e.message}`)
      failed++; seq++; continue
    }
    const upRes = await upload(TMP_F, frontStoragePath)
    if (!upRes.ok) {
      const err = await upRes.text()
      console.log(`[${seq}] ✗ 上傳失敗 ${card.name}: ${err.slice(0,80)}`)
      failed++; seq++; continue
    }
    const frontUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${frontStoragePath}`

    // Back side
    let backUrl = null, backStoragePath = null
    if (card.backFile) {
      const backLocalPath = path.join(CAMCARD_DIR, card.backFile)
      const backSP = `pending/${ts}-${seqStr}-${safeName}-back.jpg`
      try {
        await compress(backLocalPath, TMP_B)
        const bRes = await upload(TMP_B, backSP)
        if (bRes.ok) {
          backStoragePath = backSP
          backUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${backSP}`
        }
      } catch(e) { /* skip back */ }
    }

    // Duplicate check
    const dup = await checkDuplicate(card.ocr.email, card.name)

    // Insert
    const ok = await insertPending({
      image_filename: card.frontFile,
      card_img_url: frontUrl,
      storage_path: frontStoragePath,
      back_img_url: backUrl,
      back_storage_path: backStoragePath,
      ocr_data: card.ocr,
      status: 'pending',
      created_at: '2020-01-01T00:00:00.000Z',
      duplicate_contact_id: dup ? dup.id : null,
      match_type: dup ? dup.type : null,
    })

    if (ok) {
      console.log(`[${seq}] ✓ ${card.name}${dup ? ` (dup:${dup.type})` : ''}`)
      if (!progress.processed.includes(card.name)) progress.processed.push(card.name)
      success++
    } else {
      console.log(`[${seq}] ✗ DB失敗 ${card.name}`)
      failed++
    }
    seq++
    await new Promise(r => setTimeout(r, 300))
  }

  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
  console.log(`\n完成 ✓${success} ✗${failed}  進度: ${progress.processed.length}`)
}
main().catch(console.error)
