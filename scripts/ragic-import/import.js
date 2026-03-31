/**
 * Ragic Excel Import Script
 * Imports contacts and visit records from 醫院端客戶資料表及拜訪紀錄.xlsx
 */

const XLSX = require('../../node_modules/xlsx');
const { createClient } = require('../../node_modules/@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CREATED_BY_UUID = '8e1e46de-fa60-4f12-ba05-c19abdb85332'; // pohan.chen@cancerfree.io

const SKIP_NAMES = new Set(['吳宗翰', '徐千富', '蔡明宏']);

// Secondary ID → canonical ID (merge duplicates)
const ID_MERGE = {
  '202410-569': '202410-568', // 周少鈞
  '202410-105': '202410-104', // 李日清
  '202410-106': '202410-104', // 李日清
  '202410-294': '202410-288', // 梁恩馨
  '202502-302': '202410-637', // 吳嘉芸
};

// 許瑋真's existing DB id
const WEIZHENN_DB_ID = null; // will be fetched

function excelSerialToDate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function excelFractionToTime(fraction) {
  if (!fraction || typeof fraction !== 'number') return null;
  const totalSeconds = Math.round(fraction * 86400);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatContent(visitor, content) {
  const parts = [];
  if (visitor && visitor.trim()) parts.push(`【拜訪人】${visitor.trim()}`);
  if (content && content.trim()) parts.push(`【內容】${content.trim()}`);
  return parts.join('\n') || null;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Read Excel
  const wb = XLSX.readFile('C:/Users/PoChen/Documents/醫院端客戶資料表及拜訪紀錄.xlsx');
  const ws = wb.Sheets['客戶拜訪整合表'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1);

  // Filter skipped names
  const filteredRows = rows.filter(r => {
    const name = (r[1] ?? '').trim();
    return name && !SKIP_NAMES.has(name);
  });

  console.log(`Total rows after filter: ${filteredRows.length}`);

  // Build canonical contact map: canonicalId → { name, hospital, department, job_title }
  // Use LAST occurrence for contact info (most recent data)
  const contactMap = new Map();
  filteredRows.forEach(r => {
    const rawId = (r[0] ?? '').trim();
    const name = (r[1] ?? '').trim();
    if (!rawId || !name) return;
    const canonicalId = ID_MERGE[rawId] || rawId;
    // Always overwrite — last row wins (most recent visit has latest info)
    contactMap.set(canonicalId, {
      name,
      hospital: r[2] || null,
      department: r[3] || null,
      job_title: r[4] || null,
    });
  });

  console.log(`Unique contacts (canonical): ${contactMap.size}`);

  // ── Step 1: Update 許瑋真 ──────────────────────────────────────────────────
  console.log('\n[Step 1] Updating 許瑋真...');
  const { data: wzData } = await supabase
    .from('contacts')
    .select('id, job_title')
    .eq('name', '許瑋真')
    .is('deleted_at', null)
    .single();

  if (!wzData) {
    console.error('  許瑋真 not found in DB!');
    process.exit(1);
  }

  const wzOldTitle = wzData.job_title;
  await supabase
    .from('contacts')
    .update({ hospital: '仁愛醫院', department: '檢驗科', job_title: '醫檢師' })
    .eq('id', wzData.id);

  // Add note about old job_title
  await supabase.from('interaction_logs').insert({
    contact_id: wzData.id,
    type: 'note',
    content: `【備註】原職稱：${wzOldTitle ?? '秘書長'}`,
    created_by: CREATED_BY_UUID,
    created_at: new Date().toISOString(),
  });

  console.log(`  Updated 許瑋真 (${wzOldTitle} → 醫檢師) ✓`);

  // ── Step 2: Insert new contacts ───────────────────────────────────────────
  console.log('\n[Step 2] Inserting new contacts...');

  // canonicalId → db_id mapping
  const canonicalToDbId = new Map();

  // Map 許瑋真's canonical IDs
  filteredRows.forEach(r => {
    if ((r[1] ?? '').trim() === '許瑋真') {
      const rawId = (r[0] ?? '').trim();
      const canonicalId = ID_MERGE[rawId] || rawId;
      canonicalToDbId.set(canonicalId, wzData.id);
    }
  });

  // Build list of contacts to insert (skip 許瑋真)
  const toInsert = [];
  contactMap.forEach((contact, canonicalId) => {
    if (contact.name === '許瑋真') return;
    toInsert.push({ canonicalId, ...contact });
  });

  console.log(`  Contacts to insert: ${toInsert.length}`);

  const BATCH = 100;
  let insertedContacts = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const payload = batch.map(c => ({
      name: c.name,
      hospital: c.hospital,
      department: c.department,
      job_title: c.job_title,
      source: 'Ragic',
      created_by: CREATED_BY_UUID,
    }));

    const { data, error } = await supabase
      .from('contacts')
      .insert(payload)
      .select('id, name');

    if (error) {
      console.error(`  Batch ${i}-${i+BATCH} error:`, error.message);
      continue;
    }

    // Map name back to canonicalId → db_id
    // Build a name→canonicalId map for this batch
    const batchNameToCanonical = new Map();
    batch.forEach(c => batchNameToCanonical.set(c.name, c.canonicalId));

    data.forEach(row => {
      const canonicalId = batchNameToCanonical.get(row.name);
      if (canonicalId) canonicalToDbId.set(canonicalId, row.id);
    });

    insertedContacts += data.length;
    process.stdout.write(`\r  Progress: ${insertedContacts}/${toInsert.length}`);
  }
  console.log(`\n  Done ✓`);

  // ── Step 3: Insert interaction_logs ───────────────────────────────────────
  console.log('\n[Step 3] Inserting interaction_logs...');

  const logs = [];
  let skippedLogs = 0;

  filteredRows.forEach(r => {
    const rawId = (r[0] ?? '').trim();
    if (!rawId) return;
    const canonicalId = ID_MERGE[rawId] || rawId;
    const dbId = canonicalToDbId.get(canonicalId);

    if (!dbId) {
      skippedLogs++;
      return;
    }

    const meetingDate = excelSerialToDate(r[5]);
    const meetingTime = excelFractionToTime(r[6]);
    const location = r[7] || null;
    const visitor = r[8] ?? '';
    const rawContent = r[9] ?? '';
    const content = formatContent(visitor, rawContent);

    if (!content && !meetingDate) return;

    logs.push({
      contact_id: dbId,
      type: 'meeting',
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      meeting_location: location,
      content: content,
      created_by: CREATED_BY_UUID,
    });
  });

  console.log(`  Logs to insert: ${logs.length} (skipped ${skippedLogs} unmatched)`);

  let insertedLogs = 0;
  for (let i = 0; i < logs.length; i += BATCH) {
    const batch = logs.slice(i, i + BATCH);
    const { error } = await supabase.from('interaction_logs').insert(batch);
    if (error) {
      console.error(`  Log batch ${i} error:`, error.message);
      continue;
    }
    insertedLogs += batch.length;
    process.stdout.write(`\r  Progress: ${insertedLogs}/${logs.length}`);
  }
  console.log(`\n  Done ✓`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════');
  console.log('IMPORT COMPLETE');
  console.log(`  Updated:           1 (許瑋真)`);
  console.log(`  Contacts inserted: ${insertedContacts}`);
  console.log(`  Logs inserted:     ${insertedLogs}`);
  console.log(`  Skipped (no match):${skippedLogs}`);
  console.log('════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
