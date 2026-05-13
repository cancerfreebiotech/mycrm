// Phase 03 — Schema migration
// Replays every migration from artifacts/source-migrations.json (pre-dumped via MCP)
// in version order. This reproduces the exact schema evolution including:
//   - Tables, columns, indexes, FKs, constraints
//   - Functions, triggers, RLS policies, enums
//   - Storage bucket inserts (from migration 20260313142854)
//
// Output:
//   artifacts/schema-apply.log — per-migration apply result
//
// --dry-run : list migrations without applying

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE_DUMP = join(__dirname, 'artifacts', 'source-migrations.json')
const LOG_PATH = join(__dirname, 'artifacts', 'schema-apply.log')
const log = makeLogger('03-schema')

requireKeys(['SUPABASE_MGMT_TOKEN'])

function loadMigrations() {
  if (!existsSync(SOURCE_DUMP)) {
    throw new Error(`Source migrations dump not found: ${SOURCE_DUMP}\nRun Phase 00 first, or re-dump via MCP.`)
  }
  return JSON.parse(readFileSync(SOURCE_DUMP, 'utf8'))
}

async function apply(migrations, targetRef) {
  log.step(`Applying ${migrations.length} migrations to target ${targetRef}`)
  const results = []
  let appliedSql = 0
  let skipped = 0
  const logLines = []

  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    const idx = `[${i + 1}/${migrations.length}]`
    const stmts = m.statements || []
    log.info(`${idx} ${m.version} ${m.name} (${stmts.length} stmts)`)
    logLines.push(`\n=== ${m.version} ${m.name} ===`)

    // Concatenate all statements of this migration into one SQL block.
    // Supabase Mgmt API SQL endpoint accepts multi-statement SQL.
    const blob = stmts.join(';\n') + (stmts.length > 0 ? ';' : '')

    try {
      await mgmtSql(targetRef, blob)
      // Record migration as applied in target.supabase_migrations.schema_migrations
      // so future `supabase db push` operations align.
      await mgmtSql(targetRef, `
        INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
        VALUES ('${m.version}', ${m.name ? `'${m.name.replace(/'/g, "''")}'` : 'NULL'},
                ${JSON.stringify(stmts).replace(/'/g, "''").replace(/^/, "'").replace(/$/, "'")}::text[])
        ON CONFLICT (version) DO NOTHING;
      `)
      appliedSql += stmts.length
      results.push({ version: m.version, name: m.name, status: 'applied' })
      logLines.push(`✅ applied (${stmts.length} statements)`)
    } catch (e) {
      results.push({ version: m.version, name: m.name, status: 'error', error: e.message })
      logLines.push(`❌ ERROR: ${e.message}`)
      log.err(`${m.version} failed: ${e.message.slice(0, 200)}`)
      // Continue, but mark phase as not-complete
    }
  }

  writeFileSync(LOG_PATH, logLines.join('\n'))
  const errors = results.filter((r) => r.status === 'error')
  if (errors.length > 0) {
    log.warn(`${errors.length} migrations failed — see ${LOG_PATH}`)
  } else {
    log.ok(`All ${migrations.length} migrations applied (${appliedSql} statements)`)
  }
  return { results, errors, appliedSql, skipped }
}

async function main() {
  const dry = isDryRun()
  const migrations = loadMigrations()
  log.info(`Loaded ${migrations.length} migrations from ${SOURCE_DUMP}`)

  if (dry) {
    log.warn('DRY RUN — schema dumped, apply skipped')
    log.info(`Migrations dumped: ${migrations.length}`)
    log.info(`First migration: ${migrations[0]?.version} ${migrations[0]?.name}`)
    log.info(`Last migration:  ${migrations[migrations.length - 1]?.version} ${migrations[migrations.length - 1]?.name}`)
    const totalStmts = migrations.reduce((a, m) => a + (m.statements?.length ?? 0), 0)
    log.info(`Total statements: ${totalStmts}`)
    return
  }

  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 must complete first')

  // Ensure supabase_migrations schema exists on target before applying
  await mgmtSql(target.projectRef, `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text,
      created_by text,
      idempotency_key text,
      rollback text[]
    );
  `)

  const { results, errors, appliedSql } = await apply(migrations, target.projectRef)

  recordPhase('03-schema', {
    migrationCount: migrations.length,
    statementsApplied: appliedSql,
    errorCount: errors.length,
    errors: errors.slice(0, 20),  // truncate for state file
  })

  if (errors.length > 0) {
    log.err(`Schema apply had ${errors.length} errors. Review ${LOG_PATH} and re-run with fixes.`)
    process.exit(1)
  }
  log.ok('Schema migration complete')
}

main().catch((e) => { log.err(e.message); process.exit(1) })
