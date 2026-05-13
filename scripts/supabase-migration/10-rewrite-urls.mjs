// Phase 10 — Rewrite hardcoded Supabase URLs in target DB
// After data migration, rows still contain the OLD project ref in storage URLs.
// We REPLACE all occurrences with the new project ref.
//
// Verified columns with old ref (counts from source on 2026-05-13):
//   contacts.card_img_url             4,104
//   contacts.card_img_back_url          453
//   contact_cards.card_img_url          840
//   contact_photos.photo_url             44
//   camcard_pending.card_img_url      5,385
//   camcard_pending.back_img_url        457
//   failed_scans.card_img_url            49
//   email_templates.body_content          3 (inline <img>)
//   newsletter_campaigns.content_html     5 (inline <img>)

import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const log = makeLogger('10-rewrite-urls')

requireKeys(['SUPABASE_MGMT_TOKEN', 'SOURCE_PROJECT_REF'])

const REWRITES = [
  { table: 'contacts',             column: 'card_img_url',       cast: '' },
  { table: 'contacts',             column: 'card_img_back_url',  cast: '' },
  { table: 'contact_cards',        column: 'card_img_url',       cast: '' },
  { table: 'contact_cards',        column: 'card_img_back_url',  cast: '' },
  { table: 'contact_photos',       column: 'photo_url',          cast: '' },
  { table: 'camcard_pending',      column: 'card_img_url',       cast: '' },
  { table: 'camcard_pending',      column: 'back_img_url',       cast: '' },
  { table: 'failed_scans',         column: 'card_img_url',       cast: '' },
  { table: 'email_templates',      column: 'body_content',       cast: '' },
  { table: 'newsletter_campaigns', column: 'content_html',       cast: '' },
]

async function main() {
  const dry = isDryRun()
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 must complete first')

  const oldRef = env.SOURCE_PROJECT_REF
  const newRef = target.projectRef

  log.step(`Rewriting URL refs: ${oldRef} → ${newRef}`)

  const results = []
  for (const r of REWRITES) {
    const sql = `UPDATE "${r.table}" SET "${r.column}" = REPLACE("${r.column}"${r.cast}, '${oldRef}', '${newRef}') WHERE "${r.column}" LIKE '%${oldRef}%'`
    if (dry) {
      const [row] = await mgmtSql(target.projectRef,
        `SELECT COUNT(*)::text AS c FROM "${r.table}" WHERE "${r.column}" LIKE '%${oldRef}%'`
      )
      log.info(`DRY: ${r.table}.${r.column}: ${row.c} rows would be updated`)
      results.push({ table: r.table, column: r.column, wouldUpdate: parseInt(row.c, 10) })
      continue
    }
    const _exec = await mgmtSql(target.projectRef, sql)
    // verify
    const [row] = await mgmtSql(target.projectRef,
      `SELECT COUNT(*)::text AS c FROM "${r.table}" WHERE "${r.column}" LIKE '%${oldRef}%'`
    )
    const remaining = parseInt(row.c, 10)
    if (remaining > 0) {
      log.warn(`${r.table}.${r.column}: ${remaining} rows still contain old ref`)
    } else {
      log.ok(`${r.table}.${r.column}`)
    }
    results.push({ table: r.table, column: r.column, remaining })
  }

  if (!dry) recordPhase('10-rewrite-urls', { results })
}

main().catch((e) => { log.err(e.message); process.exit(1) })
