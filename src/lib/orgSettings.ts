import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ORG_ID } from '@/lib/orgContext'

// Organization settings & branding（v8.0 Phase 3 起 per-org）。
//
// 解析順序（讀取永不 throw）：
//   1. organizations.settings（jsonb，per-org——多租戶的正式家）
//   2. system_settings（扁平 key/value——單租戶時代的遺產，作 fallback 保留）
//   3. env override → 寫死預設（下表）
//
// /admin/org-settings 自 v7.9.4 起寫入 organizations.settings；system_settings
// 的舊值仍可讀（fallback 鏈），不搬移不刪除。
//
// Contract：reads NEVER throw。呼叫端傳 service-role client；orgId 未給時用
// default org（單租戶相容——既有呼叫端不改也正確，遷移期逐步補傳 ctx.orgId）。
//
// Cache：60s TTL、per (org, key)。admin 頁存檔後最長 60s 生效。

// Key table。每個 key 的值即 fallback（env override → 寫死預設）。
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
  // ── v7.9.4 新增（Task 185：原本散落各處的寫死值）──
  /** 寄件人顯示名（SendGrid from name）。 */
  sender_name: process.env.SENDGRID_FROM_NAME ?? 'CancerFree Biotech',
  /** 內部與會者網域（task-reminders / pre-meeting-briefings 判斷內外部，不含 @）。 */
  internal_email_domain: process.env.INTERNAL_EMAIL_DOMAIN ?? 'cancerfree.io',
  /** 組織信箱網域（inbound-parse 判斷 From/To 歸屬）。 */
  org_email_domain: process.env.ORG_EMAIL_DOMAIN ?? 'cancerfree.io',
  /** BCC 歸檔收件匣網域（inbound-parse）。 */
  bcc_inbox_domain: process.env.BCC_INBOX_DOMAIN ?? 'bcc.cancerfree.io',
  /** CAN-SPAM 實體地址（電子報 footer）。 */
  postal_address:
    process.env.ORG_POSTAL_ADDRESS ??
    '3F-2, No. 56, Lane 258, Ruiguang Road, Neihu District, Taipei City, Taiwan',
  /** org 擁有者信箱（告警收件、inbound 無主歸屬、系統信 Reply-To 的預設）。 */
  owner_email: process.env.ORG_OWNER_EMAIL ?? 'pohan.chen@cancerfree.io',
  /** 應用程式對外 base URL（信件/摘要中的連結）。 */
  app_url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io',
  // Module kill-switches。存字串 'true' / 'false'；非 'false'（含未設）即啟用。
  hunter_enabled: process.env.HUNTER_ENABLED ?? 'true',
  ai_assistant_enabled: process.env.AI_ASSISTANT_ENABLED ?? 'true',
} as const

export type OrgSettingKey = keyof typeof ORG_SETTING_KEYS

export const ORG_SETTING_KEY_LIST = Object.keys(ORG_SETTING_KEYS) as OrgSettingKey[]

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { value: string; expires: number }>()
const cacheKey = (orgId: string, key: OrgSettingKey) => `${orgId}:${key}`

/**
 * 讀多個 org 設定。回傳各 key 的有效值（org jsonb → system_settings → fallback）。
 * 永不 throw。orgId 未給時為 default org（單租戶相容）。
 */
export async function getOrgSettings<K extends OrgSettingKey>(
  service: SupabaseClient,
  keys: K[],
  orgId: string = DEFAULT_ORG_ID,
): Promise<Record<K, string>> {
  const now = Date.now()
  const result = {} as Record<K, string>
  const missing: K[] = []

  for (const key of keys) {
    const hit = cache.get(cacheKey(orgId, key))
    if (hit && hit.expires > now) {
      result[key] = hit.value
    } else {
      missing.push(key)
    }
  }

  if (missing.length === 0) return result

  try {
    const [{ data: org }, { data: sysRows }] = await Promise.all([
      service.from('organizations').select('settings').eq('id', orgId).maybeSingle(),
      service.from('system_settings').select('key, value').in('key', missing),
    ])
    const orgSettings = (org?.settings ?? {}) as Record<string, unknown>
    const sysStored = new Map<string, unknown>((sysRows ?? []).map((r) => [r.key as string, r.value]))

    const pick = (raw: unknown): string | null => {
      const trimmed = typeof raw === 'string' ? raw.trim() : ''
      return trimmed !== '' ? trimmed : null
    }

    for (const key of missing) {
      const value = pick(orgSettings[key]) ?? pick(sysStored.get(key)) ?? ORG_SETTING_KEYS[key]
      cache.set(cacheKey(orgId, key), { value, expires: now + CACHE_TTL_MS })
      result[key] = value
    }
  } catch {
    // DB unreachable — serve fallbacks without caching so the next call retries.
    for (const key of missing) result[key] = ORG_SETTING_KEYS[key]
  }

  return result
}

/**
 * 讀單一 org 設定。回傳有效值或 fallback。永不 throw。
 */
export async function getOrgSetting(
  service: SupabaseClient,
  key: OrgSettingKey,
  orgId: string = DEFAULT_ORG_ID,
): Promise<string | null> {
  const values = await getOrgSettings(service, [key], orgId)
  return values[key]
}
