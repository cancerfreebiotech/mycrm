// Phase 06 — Write vault secrets on target project
// The hourly send-newsletter cron reads SUPABASE_URL + SUPABASE_ANON_KEY from vault.

import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const log = makeLogger('06-vault-secrets')

requireKeys(['SUPABASE_MGMT_TOKEN'])

async function main() {
  const dry = isDryRun()
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!target?.projectRef) throw new Error('Phase 01 must complete first')

  const secrets = [
    { name: 'SUPABASE_URL', value: target.url },
    { name: 'SUPABASE_ANON_KEY', value: target.anonKey },
  ]

  for (const s of secrets) {
    log.info(`secret: ${s.name} = ${s.value.slice(0, 20)}...`)
    if (dry) continue
    // vault.create_secret signature: (secret text, name text default null, description text default '')
    const sql = `
      INSERT INTO vault.secrets (name, secret)
      VALUES ('${s.name}', '${s.value.replace(/'/g, "''")}')
      ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret
    `
    await mgmtSql(target.projectRef, sql)
    log.ok(`${s.name} written`)
  }

  if (!dry) {
    recordPhase('06-vault-secrets', { secrets: secrets.map((s) => s.name) })
  }
}

main().catch((e) => { log.err(e.message); process.exit(1) })
