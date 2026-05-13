// Migration orchestrator — runs all phases in order.
// Skips phases that are already marked completed in migration-state.json.
//
// Usage:
//   node scripts/supabase-migration/run-all.mjs              # full run
//   node scripts/supabase-migration/run-all.mjs --dry-run    # all phases dry-run
//   node scripts/supabase-migration/run-all.mjs --from=05    # resume from phase 05
//   node scripts/supabase-migration/run-all.mjs --to=11      # stop before cutover

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadState } from './lib/state.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PHASES = [
  { id: '00-snapshot',       file: '00-snapshot.mjs',       safe: true },
  { id: '01-create-target',  file: '01-create-target.mjs',  safe: false },
  { id: '02-extensions',     file: '02-extensions.mjs',     safe: false },
  { id: '03-schema',         file: '03-schema.mjs',         safe: false },
  { id: '04-auth-users',     file: '04-auth-users.mjs',     safe: false },
  { id: '05-data',           file: '05-data.mjs',           safe: false },
  { id: '06-vault-secrets',  file: '06-vault-secrets.mjs',  safe: false },
  { id: '07-edge-functions', file: '07-edge-functions.mjs', safe: false },
  { id: '08-cron-jobs',      file: '08-cron-jobs.mjs',      safe: false },
  { id: '09-storage',        file: '09-storage.mjs',        safe: false },
  { id: '10-rewrite-urls',   file: '10-rewrite-urls.mjs',   safe: false },
  { id: '11-smoke-test',     file: '11-smoke-test.mjs',     safe: true },
  // Phase 12 (cutover) is NOT included in run-all — must be invoked manually with --confirm
]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const fromArg = args.find((a) => a.startsWith('--from='))?.split('=')[1]
const toArg = args.find((a) => a.startsWith('--to='))?.split('=')[1]

const fromIdx = fromArg ? PHASES.findIndex((p) => p.id.startsWith(fromArg)) : 0
const toIdx = toArg ? PHASES.findIndex((p) => p.id.startsWith(toArg)) : PHASES.length - 1
if (fromIdx === -1 || toIdx === -1) {
  console.error('Invalid --from / --to. Valid phase ids:', PHASES.map((p) => p.id))
  process.exit(1)
}

const state = loadState()

function runPhase(file) {
  return new Promise((resolve, reject) => {
    const phaseArgs = dryRun ? ['--dry-run'] : []
    const child = spawn(process.execPath, [join(__dirname, file), ...phaseArgs], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Phase ${file} exited ${code}`)))
  })
}

(async () => {
  console.log(`\n▶ Running phases ${PHASES[fromIdx].id} → ${PHASES[toIdx].id}${dryRun ? ' (DRY RUN)' : ''}\n`)
  for (let i = fromIdx; i <= toIdx; i++) {
    const phase = PHASES[i]
    if (!dryRun && state.phases[phase.id]?.completedAt) {
      console.log(`⏭  ${phase.id} already completed — skipping`)
      continue
    }
    console.log(`\n========== ${phase.id} ==========\n`)
    try {
      await runPhase(phase.file)
    } catch (e) {
      console.error(`\n❌ ${phase.id} failed: ${e.message}\n`)
      process.exit(1)
    }
  }
  console.log(`\n✅ All phases ${PHASES[fromIdx].id} → ${PHASES[toIdx].id} complete\n`)
  console.log('Next: review smoke test output, then manually run:')
  console.log('  node scripts/supabase-migration/12-cutover.mjs --confirm')
})()
