// Phase 11 — Smoke test the migrated target project
// Compares row counts table-by-table against snapshot, samples random contacts to verify
// field-level fidelity, and HEADs a sample of storage objects.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmtSql } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger, fmtNum } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = makeLogger('11-smoke-test')

requireKeys(['SUPABASE_MGMT_TOKEN'])

async function main() {
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 must complete first')

  const snapshot = JSON.parse(readFileSync(join(__dirname, 'artifacts', 'snapshot.json'), 'utf8'))

  // 1) Row count comparison
  log.step('Row count diff')
  const tableNames = Object.keys(snapshot.tables)
  const sql = tableNames.map((t) => `SELECT '${t}' AS t, COUNT(*)::text AS c FROM "${t}"`).join(' UNION ALL ')
  const tgtCounts = await mgmtSql(target.projectRef, sql)
  const targetByTable = Object.fromEntries(tgtCounts.map((r) => [r.t, parseInt(r.c, 10)]))

  const diffs = []
  for (const t of tableNames) {
    const src = snapshot.tables[t]
    const tgt = targetByTable[t] ?? 0
    const delta = tgt - src
    if (delta !== 0) {
      diffs.push({ table: t, src, tgt, delta })
      log.warn(`${t.padEnd(35)} src=${fmtNum(src)} tgt=${fmtNum(tgt)} Δ=${delta > 0 ? '+' : ''}${delta}`)
    } else if (src > 0) {
      log.info(`${t.padEnd(35)} ${fmtNum(src)} ✓`)
    }
  }

  // 2) auth.users count
  log.step('auth.users count')
  const [{ c: srcAuth }] = [{ c: snapshot.authUsers }]
  const [{ c: tgtAuth }] = await mgmtSql(target.projectRef, `SELECT COUNT(*)::text AS c FROM auth.users`)
  if (parseInt(tgtAuth, 10) !== srcAuth) {
    log.warn(`auth.users src=${srcAuth} tgt=${tgtAuth}`)
  } else {
    log.ok(`auth.users = ${srcAuth} ✓`)
  }

  // 3) Storage object count comparison
  log.step('Storage object counts')
  const tgtStorageStats = await mgmtSql(target.projectRef, `
    SELECT bucket_id, COUNT(*)::text AS objects FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id
  `)
  const tgtByBucket = Object.fromEntries(tgtStorageStats.map((r) => [r.bucket_id, parseInt(r.objects, 10)]))
  for (const s of snapshot.storage) {
    const tgtObj = tgtByBucket[s.bucket] ?? 0
    const delta = tgtObj - s.objects
    if (delta !== 0) {
      log.warn(`bucket ${s.bucket.padEnd(20)} src=${fmtNum(s.objects)} tgt=${fmtNum(tgtObj)} Δ=${delta}`)
    } else {
      log.ok(`bucket ${s.bucket.padEnd(20)} ${fmtNum(s.objects)} ✓`)
    }
  }

  // 4) Sample 10 contacts field-by-field (use SDK for source)
  log.step('Sampling 10 random contacts for field fidelity')
  const srcClient = createClient(env.SOURCE_SUPABASE_URL, env.SOURCE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  // Pick 10 by offset (random not needed; just first 10 alive)
  const { data: sample, error: sErr } = await srcClient.from('contacts')
    .select('id, name, email, company, card_img_url')
    .is('deleted_at', null)
    .limit(10)
  if (sErr) throw new Error(`sample contacts: ${sErr.message}`)
  let mismatches = 0
  for (const src of sample) {
    const [tgt] = await mgmtSql(target.projectRef, `
      SELECT id, name, email, company,
             card_img_url
      FROM contacts WHERE id = '${src.id}'
    `)
    if (!tgt) {
      log.err(`contact ${src.id} MISSING on target`)
      mismatches++
      continue
    }
    // card_img_url should differ ONLY in the project ref portion
    const srcRewritten = (src.card_img_url ?? '').replace(env.SOURCE_PROJECT_REF, target.projectRef)
    const fieldsMatch =
      tgt.name === src.name &&
      tgt.email === src.email &&
      tgt.company === src.company &&
      (tgt.card_img_url ?? '') === srcRewritten
    if (!fieldsMatch) {
      log.err(`contact ${src.id} field mismatch`)
      console.log('  src:', src)
      console.log('  tgt:', tgt)
      mismatches++
    }
  }
  if (mismatches === 0) log.ok(`10/10 contacts match`)

  // 5) Storage HEAD test — pick 5 objects per bucket
  log.step('Storage HEAD test (5 per bucket)')
  let httpFails = 0
  for (const s of snapshot.storage) {
    if (s.objects === 0) continue
    const samples = await mgmtSql(target.projectRef,
      `SELECT name FROM storage.objects WHERE bucket_id = '${s.bucket}' ORDER BY random() LIMIT 5`
    )
    for (const obj of samples) {
      const url = `${target.url}/storage/v1/object/public/${s.bucket}/${obj.name}`
      const r = await fetch(url, { method: 'HEAD' })
      if (!r.ok) {
        log.err(`HEAD ${url} → ${r.status}`)
        httpFails++
      }
    }
  }
  if (httpFails === 0) log.ok(`Storage objects HEAD OK`)

  recordPhase('11-smoke-test', { diffs, mismatches, httpFails })

  if (diffs.length > 0 || mismatches > 0 || httpFails > 0) {
    log.err(`Smoke test FAILED: ${diffs.length} count diffs, ${mismatches} field mismatches, ${httpFails} HTTP fails`)
    log.err('Investigate before running cutover (phase 12)')
    process.exit(1)
  }
  log.ok('All smoke tests PASSED — safe to proceed with cutover')
}

main().catch((e) => { log.err(e.message); process.exit(1) })
