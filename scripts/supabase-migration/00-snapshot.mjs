// Phase 00 — Snapshot
// Read-only. Records the current state of the OLD project so later phases
// can verify nothing was lost.
//
// Uses Supabase JS SDK (service_role) for table counts / auth.users / storage.
// Schema-level pg_catalog data (migrations, cron) was pre-dumped via MCP:
//   artifacts/source-migrations.json  (98 migrations)
//   artifacts/source-cron.json        (3 cron jobs)
// Phase 03 / 08 will read those files.
//
// Output:
//   artifacts/snapshot.json — row counts + storage counts/sizes + auth user count

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env, requireKeys } from './lib/env.mjs'
import { recordPhase } from './lib/state.mjs'
import { makeLogger, fmtNum, fmtBytes } from './lib/log.mjs'
import { listAllRecursive } from './lib/storage.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ART = join(__dirname, 'artifacts', 'snapshot.json')
const log = makeLogger('00-snapshot')

requireKeys(['SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY'])

const TABLES = [
  'users', 'tags', 'countries', 'medical_departments', 'docs_content',
  'prompts', 'user_prompts', 'system_settings', 'gemini_models',
  'ai_endpoints', 'ai_models', 'user_assistants',
  'contacts', 'contact_cards', 'contact_photos', 'contact_tags',
  'pending_contacts', 'camcard_pending', 'failed_scans',
  'duplicate_pairs',
  'interaction_logs', 'meeting_drafts',
  'tasks', 'task_assignees',
  'bot_sessions', 'telegram_dedup',
  'gmail_oauth', 'report_schedules',
  'email_templates', 'template_attachments', 'email_campaigns', 'email_events',
  'newsletter_lists', 'newsletter_subscribers', 'newsletter_subscriber_lists',
  'newsletter_unsubscribes', 'newsletter_blacklist', 'newsletter_campaigns',
  'newsletter_recipients', 'newsletter_tone_samples',
  'feedback',
]

const BUCKETS = ['cards', 'camcard', 'newsletter-assets', 'feedback', 'template-attachments']

async function countRows(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`count ${table}: ${error.message}`)
  return count ?? 0
}

// Recursive listing handled by lib/storage.mjs
async function listBucketObjects(client, bucket) {
  return listAllRecursive(client, bucket, '')
}

async function main() {
  const client = createClient(env.SOURCE_SUPABASE_URL, env.SOURCE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }, db: { schema: 'public' },
  })

  log.step('Counting public table rows via SDK')
  const tableRows = {}
  for (const t of TABLES) {
    try {
      tableRows[t] = await countRows(client, t)
      log.info(`  ${t}: ${fmtNum(tableRows[t])}`)
    } catch (e) {
      log.warn(`  ${t}: ${e.message}`)
      tableRows[t] = null
    }
  }
  const totalRows = Object.values(tableRows).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0)
  log.ok(`Total rows = ${fmtNum(totalRows)}`)

  log.step('Counting auth.users via Admin API')
  const { data: usersList, error: uErr } = await client.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (uErr) throw new Error(`listUsers: ${uErr.message}`)
  const authUsers = usersList.users.length
  log.ok(`auth.users = ${authUsers}`)

  log.step('Storage buckets + object stats')
  const storage = []
  for (const bucket of BUCKETS) {
    const objs = await listBucketObjects(client, bucket)
    if (objs === null) {
      log.warn(`  bucket ${bucket} not found — skip`)
      continue
    }
    const totalSize = objs.reduce((a, o) => a + (o.size ?? 0), 0)
    storage.push({
      bucket,
      objects: objs.length,
      bytes: totalSize,
    })
    log.info(`  ${bucket}: ${fmtNum(objs.length)} objects, ${fmtBytes(totalSize)}`)
  }
  const totalObjects = storage.reduce((a, s) => a + s.objects, 0)
  const totalBytes = storage.reduce((a, s) => a + s.bytes, 0)
  log.ok(`${storage.length} buckets, ${fmtNum(totalObjects)} objects, ${fmtBytes(totalBytes)}`)

  log.step('Pre-dumped artifacts')
  const migrationsPath = join(__dirname, 'artifacts', 'source-migrations.json')
  const cronPath = join(__dirname, 'artifacts', 'source-cron.json')
  const migrations = existsSync(migrationsPath) ? JSON.parse(readFileSync(migrationsPath, 'utf8')) : []
  const cronJobs = existsSync(cronPath) ? JSON.parse(readFileSync(cronPath, 'utf8')) : []
  log.info(`  migrations: ${migrations.length} (from ${migrationsPath})`)
  log.info(`  cron jobs: ${cronJobs.length} (from ${cronPath})`)

  // Per-table max(updated_at|created_at) for delta sync at cutover.
  log.step('Per-table timestamp markers (for delta sync at cutover)')
  const deltaMarkers = {}
  for (const t of TABLES) {
    // Try updated_at first, fall back to created_at
    for (const col of ['updated_at', 'created_at']) {
      const { data, error } = await client.from(t).select(col).order(col, { ascending: false }).limit(1).maybeSingle()
      if (error && !error.message?.includes('column')) continue
      if (data?.[col]) { deltaMarkers[t] = { column: col, maxValue: data[col] }; break }
    }
    if (!deltaMarkers[t]) deltaMarkers[t] = null
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    source: {
      projectRef: env.SOURCE_PROJECT_REF,
      url: env.SOURCE_SUPABASE_URL,
    },
    tables: tableRows,
    totalRows,
    authUsers,
    storage,
    totalStorageObjects: totalObjects,
    totalStorageBytes: totalBytes,
    migrationCount: migrations.length,
    cronJobCount: cronJobs.length,
    deltaMarkers,
  }

  writeFileSync(ART, JSON.stringify(snapshot, null, 2))
  recordPhase('00-snapshot', {
    artifact: ART,
    totalRows,
    totalStorageObjects: totalObjects,
    totalStorageBytes: totalBytes,
    authUsers,
    migrationCount: migrations.length,
  })

  log.ok(`Snapshot written → ${ART}`)
  log.info('Summary:')
  log.info(`  tables       : ${Object.keys(tableRows).length} (${fmtNum(totalRows)} rows)`)
  log.info(`  auth.users   : ${authUsers}`)
  log.info(`  storage      : ${fmtNum(totalObjects)} objects, ${fmtBytes(totalBytes)}`)
  log.info(`  migrations   : ${migrations.length}`)
  log.info(`  cron jobs    : ${cronJobs.length}`)
}

main().catch((e) => { log.err(e.message); process.exit(1) })
