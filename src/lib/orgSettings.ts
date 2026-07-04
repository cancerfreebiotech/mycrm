import type { SupabaseClient } from '@supabase/supabase-js'

// Organization settings & branding.
//
// Company-wide values (name, allowed login domains, newsletter branding, social
// links) are stored in `system_settings` (flat key/value) and editable via
// /admin/org-settings (super_admin only). This module reads them with a short
// in-memory cache — same shape as hunter.ts fetchApiKey() (system_settings read
// + memory cache), but batched and with a per-key env fallback.
//
// Contract: reads NEVER throw. If system_settings is unreachable, the row is
// missing, or the value is blank, the built-in fallback is returned. Callers
// pass their own service-role client (matches lib/adminAudit.ts convention).
//
// Cache: 60s TTL. After saving in the admin page, changes take up to 60s to
// take effect across warm serverless instances.

// Key table. Each key's value is its fallback (env override → hardcoded default).
// The hardcoded defaults mirror the values previously inlined at the migrated
// call sites, so behavior is unchanged when nothing is configured.
export const ORG_SETTING_KEYS = {
  org_name: process.env.ORG_NAME ?? 'CancerFree Biotech',
  allowed_email_domains: process.env.ALLOWED_EMAIL_DOMAIN ?? 'cancerfree.io',
  newsletter_logo_url:
    process.env.NEWSLETTER_LOGO_URL ??
    'https://gaxjgcztzfxokesiraai.supabase.co/storage/v1/object/public/newsletter-assets/branding/cancerfree-logo.png',
  newsletter_reply_to: process.env.NEWSLETTER_REPLY_TO ?? 'pohan.chen@cancerfree.io',
  company_website: process.env.COMPANY_WEBSITE ?? 'https://www.cancerfree.io',
  company_facebook: process.env.COMPANY_FACEBOOK ?? 'https://www.facebook.com/cancerfreebio',
  company_linkedin: process.env.COMPANY_LINKEDIN ?? 'https://www.linkedin.com/company/cancerfree-biotech',
  feedback_recipient: process.env.FEEDBACK_RECIPIENT ?? 'pohan.chen@cancerfree.io',
  // Module kill-switches. Stored as the strings 'true' / 'false'; anything other
  // than 'false' (including the blank/unset fallback) means enabled.
  hunter_enabled: process.env.HUNTER_ENABLED ?? 'true',
  ai_assistant_enabled: process.env.AI_ASSISTANT_ENABLED ?? 'true',
} as const

export type OrgSettingKey = keyof typeof ORG_SETTING_KEYS

export const ORG_SETTING_KEY_LIST = Object.keys(ORG_SETTING_KEYS) as OrgSettingKey[]

const CACHE_TTL_MS = 60_000
const cache = new Map<OrgSettingKey, { value: string; expires: number }>()

/**
 * Read multiple org settings at once. Returns the stored value for each key, or
 * its built-in fallback when unset/blank/unreachable. Never throws.
 */
export async function getOrgSettings<K extends OrgSettingKey>(
  service: SupabaseClient,
  keys: K[],
): Promise<Record<K, string>> {
  const now = Date.now()
  const result = {} as Record<K, string>
  const missing: K[] = []

  for (const key of keys) {
    const hit = cache.get(key)
    if (hit && hit.expires > now) {
      result[key] = hit.value
    } else {
      missing.push(key)
    }
  }

  if (missing.length === 0) return result

  try {
    const { data } = await service
      .from('system_settings')
      .select('key, value')
      .in('key', missing)
    const stored = new Map<string, unknown>((data ?? []).map((r) => [r.key as string, r.value]))
    for (const key of missing) {
      const raw = stored.get(key)
      const trimmed = typeof raw === 'string' ? raw.trim() : ''
      const value = trimmed !== '' ? trimmed : ORG_SETTING_KEYS[key]
      cache.set(key, { value, expires: now + CACHE_TTL_MS })
      result[key] = value
    }
  } catch {
    // DB unreachable — serve fallbacks without caching so the next call retries.
    for (const key of missing) result[key] = ORG_SETTING_KEYS[key]
  }

  return result
}

/**
 * Read a single org setting. Returns the stored value or its fallback. Never
 * throws. (Typed `string | null` per the public contract; in practice the
 * fallback is always a non-empty string.)
 */
export async function getOrgSetting(
  service: SupabaseClient,
  key: OrgSettingKey,
): Promise<string | null> {
  const values = await getOrgSettings(service, [key])
  return values[key]
}
