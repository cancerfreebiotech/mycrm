// Phase 07 — Deploy Edge Functions to target project
// Reads local source from supabase/functions/{slug}/index.ts and deploys via Mgmt API.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmt, isDryRun } from './lib/clients.mjs'
import { requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FUNCTIONS_DIR = join(__dirname, '..', '..', 'supabase', 'functions')
const log = makeLogger('07-edge-functions')

requireKeys(['SUPABASE_MGMT_TOKEN'])

// Slug, verify_jwt — must match source project config
const FUNCTIONS = [
  { slug: 'send-reminder',  verify_jwt: false },
  { slug: 'send-report',    verify_jwt: true },
  { slug: 'send-newsletter', verify_jwt: false },
]

async function main() {
  const dry = isDryRun()
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 must complete first')

  const deployed = []
  for (const fn of FUNCTIONS) {
    const indexPath = join(FUNCTIONS_DIR, fn.slug, 'index.ts')
    if (!existsSync(indexPath)) {
      log.warn(`${fn.slug}: source not found at ${indexPath} — skip`)
      continue
    }
    const body = readFileSync(indexPath, 'utf8')
    log.info(`${fn.slug}: ${body.length} bytes, verify_jwt=${fn.verify_jwt}`)
    if (dry) continue

    // Mgmt API: POST /v1/projects/{ref}/functions
    // The body is the function source as a string; metadata is in query params.
    // For multi-file functions we'd use a different endpoint, but ours are single-file.
    try {
      const params = new URLSearchParams({
        slug: fn.slug,
        name: fn.slug,
        verify_jwt: String(fn.verify_jwt),
      })
      await mgmt('POST', `/v1/projects/${target.projectRef}/functions?${params}`, {
        slug: fn.slug,
        name: fn.slug,
        body,
        verify_jwt: fn.verify_jwt,
      })
      log.ok(`${fn.slug} deployed`)
      deployed.push(fn.slug)
    } catch (e) {
      log.err(`${fn.slug}: ${e.message}`)
    }
  }

  if (!dry) recordPhase('07-edge-functions', { deployed })
}

main().catch((e) => { log.err(e.message); process.exit(1) })
