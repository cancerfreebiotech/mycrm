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
    // Use vault.create_secret() which handles pgsodium encryption permissions correctly.
    // It returns the id. We update via vault.update_secret if it already exists.
    const escVal = s.value.replace(/'/g, "''")
    const sql = `
      DO $$
      DECLARE existing_id uuid;
      BEGIN
        SELECT id INTO existing_id FROM vault.secrets WHERE name = '${s.name}';
        IF existing_id IS NULL THEN
          PERFORM vault.create_secret('${escVal}', '${s.name}');
        ELSE
          PERFORM vault.update_secret(existing_id, '${escVal}', '${s.name}');
        END IF;
      END $$;
    `
    await mgmtSql(target.projectRef, sql)
    log.ok(`${s.name} written`)
  }

  if (!dry) {
    recordPhase('06-vault-secrets', { secrets: secrets.map((s) => s.name) })
  }
}

main().catch((e) => { log.err(e.message); process.exit(1) })
