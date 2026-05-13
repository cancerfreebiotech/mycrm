// Phase 08 — Recreate pg_cron jobs on target project
// Reads source cron jobs from artifacts/source-cron.json (pre-dumped via MCP),
// rewrites hardcoded URLs/keys, schedules on target.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CRON_DUMP = join(__dirname, 'artifacts', 'source-cron.json')
const log = makeLogger('08-cron-jobs')

requireKeys(['SUPABASE_MGMT_TOKEN', 'SOURCE_PROJECT_REF'])

async function main() {
  const dry = isDryRun()
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!dry && !target?.projectRef) throw new Error('Phase 01 must complete first')

  if (!existsSync(CRON_DUMP)) throw new Error(`Cron dump not found: ${CRON_DUMP}`)
  const jobs = JSON.parse(readFileSync(CRON_DUMP, 'utf8'))
  log.ok(`${jobs.length} cron jobs loaded from dump`)

  const sourceRef = env.SOURCE_PROJECT_REF
  const targetRef = target?.projectRef
  const sourceAnon = env.SOURCE_ANON_KEY
  const targetAnon = target?.anonKey

  const rewritten = jobs.map((j) => {
    let cmd = j.command
    if (sourceRef && targetRef) cmd = cmd.split(sourceRef).join(targetRef)
    if (sourceAnon && targetAnon) cmd = cmd.split(sourceAnon).join(targetAnon)
    return { ...j, command: cmd }
  })

  for (const j of rewritten) {
    const name = j.jobname ?? `job_${j.schedule.replace(/\s+/g, '_')}`
    log.info(`schedule="${j.schedule}" name=${name}`)
    if (dry) {
      console.log('  ' + j.command.trim().slice(0, 200) + (j.command.length > 200 ? '...' : ''))
      continue
    }
    try {
      await mgmtSql(targetRef, `SELECT cron.unschedule('${name}') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '${name}')`)
      await mgmtSql(targetRef, `SELECT cron.schedule('${name}', '${j.schedule}', $$${j.command}$$)`)
      log.ok(`scheduled ${name}`)
    } catch (e) {
      log.err(`${name}: ${e.message}`)
    }
  }

  if (!dry) recordPhase('08-cron-jobs', { count: rewritten.length, jobs: rewritten.map((j) => ({ name: j.jobname, schedule: j.schedule })) })
}

main().catch((e) => { log.err(e.message); process.exit(1) })
