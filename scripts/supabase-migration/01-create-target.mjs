// Phase 01 — Create target Supabase project
// Creates a new project in the target Pro org and waits until ACTIVE_HEALTHY.
// Saves project ref + keys to state for later phases.
//
// --dry-run : prints the request body but does not create.
// Idempotent: skip if state already has target project ref.

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmt, isDryRun } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { recordPhase, loadState } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = makeLogger('01-create-target')

requireKeys(['SUPABASE_MGMT_TOKEN', 'TARGET_ORG_ID', 'TARGET_PROJECT_NAME', 'TARGET_REGION'])

function genDbPassword() {
  // 32-char alphanumeric — meets all Supabase requirements
  return randomBytes(24).toString('base64url').slice(0, 32)
}

async function waitForActive(ref, timeoutMs = 5 * 60 * 1000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const p = await mgmt('GET', `/v1/projects/${ref}`)
    log.info(`status = ${p.status}`)
    if (p.status === 'ACTIVE_HEALTHY') return p
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(`Project ${ref} not active after ${timeoutMs / 1000}s`)
}

async function main() {
  const dry = isDryRun()
  const state = loadState()

  if (state.phases['01-create-target']?.projectRef) {
    log.ok(`Already created: ${state.phases['01-create-target'].projectRef} — skipping`)
    return
  }

  // Check if a project with the same name already exists in the org
  log.step('Checking for existing project with same name in target org')
  const projects = await mgmt('GET', '/v1/projects')
  const existing = projects.find(
    (p) => p.organization_id === env.TARGET_ORG_ID && p.name === env.TARGET_PROJECT_NAME
  )
  if (existing) {
    log.warn(`Project "${env.TARGET_PROJECT_NAME}" already exists in org: ${existing.ref}`)
    log.warn('Re-using it. If you want a fresh project, delete it first via Supabase dashboard.')
    if (existing.status !== 'ACTIVE_HEALTHY') {
      log.info('Waiting for ACTIVE_HEALTHY...')
      await waitForActive(existing.ref)
    }
    await saveTargetInfo(existing.ref)
    return
  }

  const dbPassword = genDbPassword()
  const body = {
    name: env.TARGET_PROJECT_NAME,
    organization_id: env.TARGET_ORG_ID,
    region: env.TARGET_REGION,
    plan: 'free',                // org is Pro; project compute defaults to micro
    db_pass: dbPassword,
    desired_instance_size: 'micro',
  }
  log.step(`Creating project name="${body.name}" org=${body.organization_id} region=${body.region}`)

  if (dry) {
    log.warn('DRY RUN — would POST /v1/projects with:')
    console.log(JSON.stringify({ ...body, db_pass: '<32-char random>' }, null, 2))
    return
  }

  const created = await mgmt('POST', '/v1/projects', body)
  log.ok(`Project created: ref=${created.ref || created.id}`)
  const ref = created.ref || created.id

  // Save DB password immediately so it's not lost if next steps fail
  const dbPwPath = join(__dirname, 'artifacts', 'target-db-password.txt')
  writeFileSync(dbPwPath, dbPassword)
  log.info(`DB password saved → ${dbPwPath} (DO NOT commit; .gitignore covers artifacts/)`)

  log.step('Waiting for project to become ACTIVE_HEALTHY (up to 5 min)')
  await waitForActive(ref)
  log.ok('Project is healthy')

  await saveTargetInfo(ref, dbPassword)
}

async function saveTargetInfo(ref, dbPassword) {
  log.step('Fetching project info + API keys')
  const project = await mgmt('GET', `/v1/projects/${ref}`)
  const apiKeys = await mgmt('GET', `/v1/projects/${ref}/api-keys`)
  const anon = apiKeys.find((k) => k.name === 'anon')?.api_key
  const service = apiKeys.find((k) => k.name === 'service_role')?.api_key
  if (!anon || !service) throw new Error(`Could not get anon/service keys: ${JSON.stringify(apiKeys)}`)

  const url = `https://${ref}.supabase.co`
  recordPhase('01-create-target', {
    projectRef: ref,
    url,
    region: project.region,
    organizationId: project.organization_id,
    status: project.status,
    anonKey: anon,
    serviceRoleKey: service,
    dbPassword: dbPassword || null,  // only set on first creation
  })

  log.ok('Target project info saved to migration-state.json')
  log.info(`  URL  : ${url}`)
  log.info(`  ref  : ${ref}`)
  log.info(`  anon : ${anon.slice(0, 12)}...${anon.slice(-4)}`)
  log.info(`  srv  : ${service.slice(0, 12)}...${service.slice(-4)}`)
}

main().catch((e) => { log.err(e.message); process.exit(1) })
