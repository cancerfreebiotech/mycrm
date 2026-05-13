// Supabase + Mgmt API + Vercel API clients.
// Uses @supabase/supabase-js for source/target SDK access,
// and direct fetch for Management/Vercel APIs.

import { createClient } from '@supabase/supabase-js'
import { env, requireKeys } from './env.mjs'

// ── Source (old) Supabase ──────────────────────────────────────────────────
export function sourceClient() {
  requireKeys(['SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY'])
  return createClient(env.SOURCE_SUPABASE_URL, env.SOURCE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
}

// ── Target (new) Supabase ──────────────────────────────────────────────────
export function targetClient() {
  requireKeys(['TARGET_SUPABASE_URL', 'TARGET_SERVICE_ROLE_KEY'])
  return createClient(env.TARGET_SUPABASE_URL, env.TARGET_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
}

// ── Supabase Management API ────────────────────────────────────────────────
// docs: https://supabase.com/docs/reference/api/introduction
export async function mgmt(method, path, body) {
  requireKeys(['SUPABASE_MGMT_TOKEN'])
  const url = `https://api.supabase.com${path}`
  const r = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${env.SUPABASE_MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!r.ok) {
    const detail = typeof data === 'object' ? JSON.stringify(data) : data
    throw new Error(`Mgmt API ${method} ${path} → ${r.status}: ${detail}`)
  }
  return data
}

// Execute SQL on any project via Mgmt API (works for both source and target)
export async function mgmtSql(projectRef, query) {
  return mgmt('POST', `/v1/projects/${projectRef}/database/query`, { query })
}

// ── Vercel API ─────────────────────────────────────────────────────────────
export async function vercel(method, path, body) {
  requireKeys(['VERCEL_TOKEN'])
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://api.vercel.com${path}${sep}teamId=${env.VERCEL_TEAM_ID}`
  const r = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!r.ok) {
    const detail = typeof data === 'object' ? JSON.stringify(data) : data
    throw new Error(`Vercel ${method} ${path} → ${r.status}: ${detail}`)
  }
  return data
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function isDryRun() {
  return process.argv.includes('--dry-run') || process.env.DRY_RUN === '1'
}
