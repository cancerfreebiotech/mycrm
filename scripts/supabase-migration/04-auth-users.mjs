// Phase 04 — Migrate auth.users
// Supabase does NOT expose password hashes via Mgmt API, so we cannot copy them.
// Approach: read source auth.users via Admin API, then INSERT each into target
// auth.users via Mgmt SQL with the SAME id and email. Email is marked confirmed
// so users can use password reset on first login. TOTP factors are not migrated.

import { createClient } from '@supabase/supabase-js'
import { mgmtSql, isDryRun } from './lib/clients.mjs'
import { env, requireKeys } from './lib/env.mjs'
import { loadState, recordPhase } from './lib/state.mjs'
import { makeLogger, fmtNum } from './lib/log.mjs'

const log = makeLogger('04-auth-users')

requireKeys(['SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY', 'SUPABASE_MGMT_TOKEN'])

async function main() {
  const dry = isDryRun()
  const state = loadState()
  const target = state.phases['01-create-target']
  if (!dry && !target?.projectRef) throw new Error('Phase 01 must complete first')

  const srcAdmin = createClient(env.SOURCE_SUPABASE_URL, env.SOURCE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  log.step('Reading source auth.users via Admin API')
  const { data: page, error } = await srcAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  const sourceUsers = page.users
  log.ok(`${sourceUsers.length} source users`)

  if (dry) {
    log.warn('DRY RUN — would insert into target auth.users:')
    for (const u of sourceUsers) {
      log.info(`  ${u.email}  (id=${u.id.slice(0, 8)}...)`)
    }
    return
  }

  log.step('Inserting into target auth.users (preserves id, no password)')
  let inserted = 0
  let skipped = 0
  for (const u of sourceUsers) {
    const meta = JSON.stringify(u.user_metadata ?? {}).replace(/'/g, "''")
    const appMeta = JSON.stringify(u.app_metadata ?? {}).replace(/'/g, "''")
    const email = (u.email ?? '').replace(/'/g, "''")
    const role = u.role ?? 'authenticated'
    const aud = u.aud ?? 'authenticated'
    try {
      const sql = `
        INSERT INTO auth.users (
          id, email, role, aud, instance_id,
          email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
          created_at, updated_at, is_super_admin
        )
        VALUES (
          '${u.id}', '${email}', '${role}', '${aud}', '00000000-0000-0000-0000-000000000000',
          NOW(), '${meta}'::jsonb, '${appMeta}'::jsonb,
          '${u.created_at}', '${u.updated_at}', false
        )
        ON CONFLICT (id) DO NOTHING
      `
      await mgmtSql(target.projectRef, sql)
      inserted++
      log.info(`✓ ${email}`)
    } catch (e) {
      log.err(`✗ ${email}: ${e.message.slice(0, 200)}`)
      skipped++
    }
  }

  recordPhase('04-auth-users', {
    sourceCount: sourceUsers.length,
    inserted,
    skipped,
    note: 'Passwords NOT migrated — each user must reset on first login. TOTP secrets also not migrated.',
  })
  log.ok(`${fmtNum(inserted)} users inserted, ${skipped} skipped`)
  log.warn('Users have NO password — they must reset via "Forgot password" on first login.')
  log.warn('All TOTP users will be prompted to re-bind their authenticator app.')
}

main().catch((e) => { log.err(e.message); process.exit(1) })
