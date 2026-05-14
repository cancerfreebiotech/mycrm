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

    // Use the multipart deploy endpoint — the JSON-body POST /functions
    // endpoint does NOT bundle source correctly and produces BOOT_ERROR at
    // runtime. The /functions/deploy multipart endpoint is what Supabase CLI
    // uses internally and is the only path that produces a working function.
    try {
      const fd = new FormData()
      fd.append('metadata', new Blob([JSON.stringify({
        name: fn.slug,
        entrypoint_path: 'index.ts',
        verify_jwt: fn.verify_jwt,
      })], { type: 'application/json' }))
      fd.append('file', new Blob([body], { type: 'application/typescript' }), 'index.ts')

      const url = `https://api.supabase.com/v1/projects/${target.projectRef}/functions/deploy?slug=${encodeURIComponent(fn.slug)}`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.SUPABASE_MGMT_TOKEN}` },
        body: fd,
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
      log.ok(`${fn.slug} deployed (multipart)`)
      deployed.push(fn.slug)
    } catch (e) {
      log.err(`${fn.slug}: ${e.message}`)
    }
  }

  if (!dry) recordPhase('07-edge-functions', { deployed })
}

main().catch((e) => { log.err(e.message); process.exit(1) })
