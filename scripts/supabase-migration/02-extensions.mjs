// Phase 02 — Enable Postgres extensions on target project
// Mirrors the installed extensions from the source project.

import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const log = makeLogger('02-extensions')

// Extensions confirmed installed on source (zaqzqcvsckripotuujep):
//   - pg_stat_statements (schema=extensions)
//   - index_advisor      (schema=extensions)
//   - hypopg             (schema=extensions)
//   - uuid-ossp          (schema=extensions)
//   - pgcrypto           (schema=extensions)
//   - pg_trgm            (schema=public)
//   - pg_net             (schema=public) — async HTTP from DB
//   - supabase_vault     (schema=vault)
//   - citext             (schema=public)
//   - pg_cron            (schema=pg_catalog) — scheduled jobs
//   - plpgsql            (built-in)
//
// Skipped (always present on Supabase): plpgsql, pg_stat_statements (Supabase enables by default)
const EXTENSIONS = [
  { name: 'uuid-ossp',    schema: 'extensions' },
  { name: 'pgcrypto',     schema: 'extensions' },
  { name: 'pg_trgm',      schema: 'public' },
  { name: 'citext',       schema: 'public' },
  { name: 'pg_net',       schema: 'public' },
  { name: 'pg_cron',      schema: 'pg_catalog' },
  { name: 'supabase_vault', schema: 'vault' },
  { name: 'hypopg',       schema: 'extensions' },
  { name: 'index_advisor', schema: 'extensions' },
]

async function main() {
  requireKeys(['SUPABASE_MGMT_TOKEN'])
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 (create-target) must complete first')

  const dry = isDryRun()
  log.step(`Enabling ${EXTENSIONS.length} extensions on target ${target.projectRef}`)

  const installed = []
  for (const ext of EXTENSIONS) {
    const sql = `CREATE EXTENSION IF NOT EXISTS "${ext.name}" WITH SCHEMA "${ext.schema}";`
    if (dry) {
      log.info(`DRY: ${sql}`)
      continue
    }
    try {
      await mgmtSql(target.projectRef, sql)
      log.ok(`${ext.name} (${ext.schema})`)
      installed.push(ext.name)
    } catch (e) {
      // Some extensions might already exist or have different default schema
      log.warn(`${ext.name}: ${e.message}`)
    }
  }

  if (!dry) {
    recordPhase('02-extensions', { installed })
    log.ok(`Installed ${installed.length}/${EXTENSIONS.length} extensions`)
  }
}

main().catch((e) => { log.err(e.message); process.exit(1) })
