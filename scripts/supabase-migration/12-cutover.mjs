// Phase 12 — Cutover: switch Vercel env vars + redeploy + wait for ready
//
// Requires explicit --confirm flag (no dry-run by accident).
//
// Steps:
//   1. Backup current Vercel env values for the 3 Supabase keys → artifacts/vercel-env-backup.json
//   2. Update NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//      across all targets (development / preview / production)
//   3. Trigger a production deployment from the current HEAD commit
//   4. Poll until status = READY (or ERROR)
//
// Rollback: see artifacts/vercel-env-backup.json — re-apply old values and redeploy.

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vercel } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKUP_PATH = join(__dirname, 'artifacts', 'vercel-env-backup.json')
const log = makeLogger('12-cutover')

requireKeys(['VERCEL_TOKEN', 'VERCEL_PROJECT_NAME'])

const KEYS_TO_UPDATE = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

async function main() {
  const dry = !process.argv.includes('--confirm')

  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 must complete first')
  if (!state.phases['11-smoke-test']) throw new Error('Phase 11 (smoke-test) must pass first')

  const valuesByKey = {
    NEXT_PUBLIC_SUPABASE_URL: target.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: target.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: target.serviceRoleKey,
  }

  // 1) Backup current env (decrypted) so we can rollback
  log.step('Backing up current Vercel env values')
  const projectInfo = await vercel('GET', `/v9/projects/${env.VERCEL_PROJECT_NAME}/env?decrypt=true`)
  const envs = projectInfo.envs ?? []
  const backup = envs.filter((e) => KEYS_TO_UPDATE.includes(e.key))
    .map((e) => ({ id: e.id, key: e.key, value: e.value, target: e.target, type: e.type }))
  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2))
  log.ok(`Backup: ${backup.length} env entries → ${BACKUP_PATH}`)

  if (dry) {
    log.warn('DRY RUN — pass --confirm to actually update env + redeploy')
    log.info('Would update:')
    for (const key of KEYS_TO_UPDATE) {
      const existing = backup.filter((e) => e.key === key)
      const v = valuesByKey[key]
      const masked = key.includes('URL') ? v : `${v.slice(0, 12)}...${v.slice(-4)}`
      log.info(`  ${key} → ${masked}`)
      log.info(`    (${existing.length} existing entries across targets)`)
    }
    return
  }

  // 2) Update each entry (Vercel requires DELETE + POST for env changes, or PATCH by id)
  log.step('Updating Vercel env entries')
  for (const oldEnv of backup) {
    const newValue = valuesByKey[oldEnv.key]
    if (!newValue) continue
    await vercel('PATCH', `/v9/projects/${env.VERCEL_PROJECT_NAME}/env/${oldEnv.id}`, {
      value: newValue,
      target: oldEnv.target,
      type: oldEnv.type,
    })
    log.ok(`patched ${oldEnv.key} for target=${oldEnv.target.join(',')}`)
  }

  // 3) Trigger production deployment
  log.step('Triggering production redeploy')
  // Use Vercel API to redeploy. We trigger a new deployment by promoting last production
  // OR creating a new deployment from current git commit.
  // Simplest: redeploy the latest READY production deployment with new env.
  const deployList = await vercel('GET', `/v6/deployments?app=${env.VERCEL_PROJECT_NAME}&target=production&limit=5`)
  const latest = (deployList.deployments ?? []).find((d) => d.readyState === 'READY')
  if (!latest) throw new Error('No READY production deployment found to redeploy from')
  log.info(`Latest READY production deployment: ${latest.uid} (${new Date(latest.created).toISOString()})`)

  const deploy = await vercel('POST', `/v13/deployments?forceNew=1`, {
    name: env.VERCEL_PROJECT_NAME,
    target: 'production',
    deploymentId: latest.uid,
  })
  log.info(`New deployment: ${deploy.id ?? deploy.uid}, url=${deploy.url}`)

  // 4) Poll until READY
  log.step('Polling deployment until READY')
  const deployId = deploy.id ?? deploy.uid
  const t0 = Date.now()
  while (Date.now() - t0 < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 8000))
    const status = await vercel('GET', `/v13/deployments/${deployId}`)
    log.info(`status = ${status.readyState ?? status.status}`)
    if (status.readyState === 'READY' || status.status === 'READY') {
      log.ok(`Deployment READY: https://${status.url}`)
      recordPhase('12-cutover', {
        deploymentId: deployId,
        deploymentUrl: status.url,
        backupPath: BACKUP_PATH,
      })
      return
    }
    if (status.readyState === 'ERROR' || status.status === 'ERROR') {
      throw new Error(`Deployment failed: ${JSON.stringify(status)}`)
    }
  }
  throw new Error('Deployment did not become READY in 10 minutes')
}

main().catch((e) => { log.err(e.message); process.exit(1) })
