// Load env vars from .env.local + .env.local.tmp + process.env
// .env.local       : SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY (old project)
// .env.local.tmp   : VERCEL_TOKEN, VERCEL_ORG_ID, SUPABASE_MGMT_TOKEN
// Hardcoded        : SOURCE project ref (public info)

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..', '..')

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const envLocal = parseEnvFile(join(ROOT, '.env.local'))
const envLocalTmp = parseEnvFile(join(ROOT, '.env.local.tmp'))

// Merge order: .env.local < .env.local.tmp < process.env
const merged = { ...envLocal, ...envLocalTmp, ...process.env }

// Required keys
const required = {
  SOURCE_SUPABASE_URL:       merged.SOURCE_SUPABASE_URL ?? 'https://zaqzqcvsckripotuujep.supabase.co',
  SOURCE_PROJECT_REF:        merged.SOURCE_PROJECT_REF ?? 'zaqzqcvsckripotuujep',
  SOURCE_SERVICE_ROLE_KEY:   merged.SUPABASE_SERVICE_ROLE_KEY,
  SOURCE_ANON_KEY:           merged.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_MGMT_TOKEN:       merged.SUPABASE_MGMT_TOKEN,
  TARGET_ORG_ID:             merged.TARGET_ORG_ID ?? 'uwmykvffywizbxgkgkpk',
  TARGET_PROJECT_NAME:       merged.TARGET_PROJECT_NAME ?? 'mycrm',
  TARGET_REGION:             merged.TARGET_REGION ?? 'ap-northeast-1',
  VERCEL_TOKEN:              merged.VERCEL_TOKEN,
  VERCEL_TEAM_ID:            merged.VERCEL_TEAM_ID ?? 'team_2ROdEsQOs9WqAXrHwtIevCO9',
  VERCEL_PROJECT_NAME:       merged.VERCEL_PROJECT_NAME ?? 'mycrm',
}

// Optional (populated after Phase 01)
const optional = {
  TARGET_PROJECT_REF:        merged.TARGET_PROJECT_REF,
  TARGET_SUPABASE_URL:       merged.TARGET_SUPABASE_URL,
  TARGET_SERVICE_ROLE_KEY:   merged.TARGET_SERVICE_ROLE_KEY,
  TARGET_ANON_KEY:           merged.TARGET_ANON_KEY,
  TARGET_DB_PASSWORD:        merged.TARGET_DB_PASSWORD,
}

export const env = { ...required, ...optional, ROOT }

export function requireKeys(keys) {
  const missing = keys.filter((k) => !env[k])
  if (missing.length > 0) {
    console.error(`❌ Missing env vars: ${missing.join(', ')}`)
    console.error('   Check .env.local + .env.local.tmp')
    process.exit(1)
  }
}

export function maskSecret(s) {
  if (!s || s.length < 16) return '***'
  return `${s.slice(0, 8)}...${s.slice(-4)}`
}
