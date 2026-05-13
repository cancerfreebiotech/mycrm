// Phase 05 — Bulk data migration
// Reads from source via Supabase SDK (paginated), inserts into target via upsert.
// Preserves all row IDs and uses ON CONFLICT DO NOTHING (idempotent / resumable).
//
// Table order is dependency-aware: parents before children.
// Pages of 1000 rows each. Per-table progress is checkpointed in state.

import { createClient } from '@supabase/supabase-js'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, saveState, recordPhase } from './lib/state.mjs'
import { makeLogger, fmtNum } from './lib/log.mjs'
import { isDryRun } from './lib/clients.mjs'

const log = makeLogger('05-data')

// FK dependency order (parents first). Run in this exact order.
const TABLE_ORDER = [
  // Level 0 — no FKs to other public tables
  'countries',
  'medical_departments',
  'docs_content',
  'prompts',
  'system_settings',
  'gemini_models',
  'ai_endpoints',
  'ai_models',
  'tags',
  'users',
  'newsletter_lists',
  'email_templates',
  // Level 1 — depend on users / tags / lists / templates
  'user_assistants',
  'user_prompts',
  'contacts',
  'newsletter_subscribers',
  'newsletter_blacklist',
  'newsletter_tone_samples',
  'newsletter_campaigns',
  'template_attachments',
  'email_campaigns',
  // Level 2 — depend on contacts
  'contact_cards',
  'contact_photos',
  'contact_tags',
  'failed_scans',
  'pending_contacts',
  'camcard_pending',
  'duplicate_pairs',
  'newsletter_subscriber_lists',
  'newsletter_unsubscribes',
  'newsletter_recipients',
  'email_events',
  // Level 3 — depend on multiple
  'interaction_logs',
  'meeting_drafts',
  'tasks',
  // Level 4
  'task_assignees',
  // Level 5 — leaf
  'bot_sessions',
  'telegram_dedup',
  'gmail_oauth',
  'report_schedules',
  'feedback',
]

const PAGE_SIZE = 1000

async function migrateTable(table, srcClient, tgtClient, dry) {
  log.step(`Migrating ${table}`)
  // Get row count for progress
  const { count: srcCount, error: cntErr } = await srcClient
    .from(table).select('*', { count: 'exact', head: true })
  if (cntErr) {
    log.warn(`${table}: count failed — ${cntErr.message}`)
    return { table, copied: 0, error: cntErr.message }
  }
  if (srcCount === 0) {
    log.info(`${table}: 0 rows — skip`)
    return { table, copied: 0, total: 0 }
  }

  // PK column for ORDER BY + onConflict. Composite-PK tables use first column for
  // sort, and ON CONFLICT lists all columns. system_settings uses 'key', not 'id'.
  const PK_CONFIG = {
    contact_tags:                 { order: 'contact_id', conflict: 'contact_id,tag_id' },
    newsletter_subscriber_lists:  { order: 'subscriber_id', conflict: 'subscriber_id,list_id' },
    telegram_dedup:               { order: 'update_id', conflict: 'update_id' },
    system_settings:              { order: 'key', conflict: 'key' },
  }
  const pk = PK_CONFIG[table] ?? { order: 'id', conflict: 'id' }
  const orderCol = pk.order
  const conflictCol = pk.conflict

  let copied = 0
  let from = 0
  while (from < srcCount) {
    const to = Math.min(from + PAGE_SIZE, srcCount) - 1
    const { data, error } = await srcClient.from(table).select('*').order(orderCol).range(from, to)
    if (error) {
      log.err(`${table}: read page [${from}..${to}] failed — ${error.message}`)
      return { table, copied, total: srcCount, error: error.message }
    }
    if (!data || data.length === 0) break

    if (dry) {
      log.info(`  DRY: would upsert ${data.length} rows (${from + data.length}/${srcCount})`)
    } else {
      const { error: insErr } = await tgtClient.from(table).upsert(data, {
        onConflict: conflictCol,
        ignoreDuplicates: true,
      })
      if (insErr) {
        log.err(`${table}: insert page [${from}..${to}] failed — ${insErr.message}`)
        return { table, copied, total: srcCount, error: insErr.message }
      }
    }

    copied += data.length
    from += data.length
    log.info(`  ${table}: ${fmtNum(copied)}/${fmtNum(srcCount)}`)
    if (data.length < PAGE_SIZE) break
  }
  log.ok(`${table}: ${fmtNum(copied)} rows`)
  return { table, copied, total: srcCount }
}

async function main() {
  const dry = isDryRun()
  requireKeys(['SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY'])

  const state = loadState()
  const target = state.phases['01-create-target']
  if (!dry && !target?.projectRef) throw new Error('Phase 01 must complete first')

  const srcClient = createClient(env.SOURCE_SUPABASE_URL, env.SOURCE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }, db: { schema: 'public' },
  })
  const tgtClient = dry ? null : createClient(target.url, target.serviceRoleKey, {
    auth: { persistSession: false }, db: { schema: 'public' },
  })

  const results = []
  let totalCopied = 0
  for (const table of TABLE_ORDER) {
    const r = await migrateTable(table, srcClient, tgtClient, dry)
    results.push(r)
    totalCopied += r.copied ?? 0
    // Checkpoint after each table
    if (!dry) {
      state.phases['05-data'] = { results: results.slice(), totalCopied, inProgress: true }
      saveState(state)
    }
  }

  if (!dry) {
    recordPhase('05-data', { results, totalCopied, inProgress: false })
  }

  const errors = results.filter((r) => r.error)
  log.ok(`Total rows copied: ${fmtNum(totalCopied)}`)
  if (errors.length > 0) {
    log.err(`${errors.length} tables had errors:`)
    for (const e of errors) log.err(`  ${e.table}: ${e.error}`)
    process.exit(1)
  }
}

main().catch((e) => { log.err(e.message); process.exit(1) })
