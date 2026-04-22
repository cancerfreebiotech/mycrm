import { createServiceClient } from '@/lib/supabase'

// Hunter.io Email Finder integration
//
// Billing note (per Po's understanding, verified 2026-04-22): Hunter Free tier
// 50 searches/month, but credits only decrement when an email IS found. So it's
// safe to run wide scans on contacts that likely won't be found.
//
// Public surface:
//   - fetchApiKey()       load from system_settings
//   - getHunterAccount()  remaining credits
//   - enrichContactEmail(contactId, name, company) — single lookup, used on
//     contact-create flows (/a, /li, /p 姓名 new, web forms)
//   - runHunterBatch({ maxContacts, cooldownDays }) — backfill batch, used by
//     /api/admin/hunter POST and /api/hunter/cron

const HUNTER_BASE = 'https://api.hunter.io/v2'

export interface HunterAccount {
  searchesUsed: number
  searchesAvailable: number
  remaining: number
  plan: string
}

export async function fetchApiKey(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'hunter_api_key')
    .single()
  return data?.value ? (data.value as string) : null
}

export async function getHunterAccount(apiKey: string): Promise<HunterAccount | null> {
  try {
    const res = await fetch(`${HUNTER_BASE}/account?api_key=${apiKey}`)
    if (!res.ok) return null
    const data = await res.json()
    const s = data?.data?.requests?.searches
    const plan = data?.data?.plan_name ?? 'unknown'
    if (!s) return null
    const used = s.used ?? 0
    const available = s.available ?? 0
    return { searchesUsed: used, searchesAvailable: available, remaining: available - used, plan }
  } catch {
    return null
  }
}

// Split a name into (first_name, last_name) Western-style (space-separated).
// Returns both empty strings if the name is non-ASCII (CJK) — Hunter's
// email-finder requires first_name and doesn't understand CJK names at all.
function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  // Hunter needs Latin-script first+last. Bail out on CJK-only names.
  if (!/[A-Za-z]/.test(trimmed)) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length <= 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

export type EnrichStatus =
  | 'found'              // email found and written
  | 'not_found'          // Hunter queried, no email returned
  | 'skipped_no_key'     // Hunter API key not configured
  | 'skipped_cjk_name'   // Name is CJK-only (no Latin). Hunter needs first+last
  | 'skipped_no_company' // Company required for Hunter Email Finder
  | 'error'              // Network / API error

export interface EnrichResult {
  status: EnrichStatus
  email: string | null
}

// Try one Hunter email-finder lookup. Returns { status, email }.
// Writes contacts.hunter_searched_at ONLY when Hunter was actually queried
// (status = 'found' | 'not_found' | 'error') so skipped lookups can be
// retried by the cron once the contact gains missing data.
export async function enrichContactEmail(
  contactId: string,
  nameEn: string | null | undefined,
  name: string | null | undefined,
  company: string | null | undefined,
): Promise<EnrichResult> {
  const apiKey = await fetchApiKey()
  if (!apiKey) return { status: 'skipped_no_key', email: null }

  const { firstName, lastName } = splitName(nameEn || name)
  if (!firstName || !lastName) return { status: 'skipped_cjk_name', email: null }
  if (!company) return { status: 'skipped_no_company', email: null }

  const params = new URLSearchParams({
    api_key: apiKey,
    first_name: firstName,
    last_name: lastName,
    company,
  })

  const supabase = createServiceClient()
  try {
    const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`)
    if (!res.ok) {
      await supabase.from('contacts').update({ hunter_searched_at: new Date().toISOString() }).eq('id', contactId)
      return { status: 'error', email: null }
    }
    const data = await res.json()
    const email: string | null = data?.data?.email ?? null

    if (email && email.includes('@')) {
      await supabase
        .from('contacts')
        .update({ email, hunter_searched_at: new Date().toISOString() })
        .eq('id', contactId)
      return { status: 'found', email }
    }

    await supabase.from('contacts').update({ hunter_searched_at: new Date().toISOString() }).eq('id', contactId)
    return { status: 'not_found', email: null }
  } catch {
    return { status: 'error', email: null }
  }
}

// Localized user-facing message for each enrich status.
// Used by both bot replies and client toast notifications.
export function enrichStatusMessage(r: EnrichResult, lang: 'zh-TW' | 'en' | 'ja' = 'zh-TW'): string {
  const M: Record<'zh-TW' | 'en' | 'ja', Record<EnrichStatus, string>> = {
    'zh-TW': {
      found: `📧 Hunter 已自動查到 email：${r.email ?? ''}`,
      not_found: '🔍 Hunter 查過了，目前沒找到 email（cron 30 天後會再試一次）',
      skipped_no_key: 'ℹ Hunter API key 未設定，跳過自動查詢',
      skipped_cjk_name: 'ℹ 中文/日文名無法使用 Hunter 查詢；若補上英文姓名並填公司，cron 會自動重試',
      skipped_no_company: 'ℹ Hunter 需要公司名才能查 email；補上公司後 cron 會自動重試',
      error: '⚠ Hunter 查詢失敗（網路或 API 錯誤），30 天後會自動重試',
    },
    'en': {
      found: `📧 Hunter auto-found email: ${r.email ?? ''}`,
      not_found: '🔍 Hunter queried, no email found (will retry in 30 days via cron)',
      skipped_no_key: 'ℹ Hunter API key not configured; skipped',
      skipped_cjk_name: 'ℹ Hunter cannot query CJK-only names; add an English name + company and cron will retry',
      skipped_no_company: 'ℹ Hunter needs a company name to find the email; add a company and cron will retry',
      error: '⚠ Hunter lookup failed (network/API error); will retry in 30 days',
    },
    'ja': {
      found: `📧 Hunter が email を自動検出：${r.email ?? ''}`,
      not_found: '🔍 Hunter で照会済み、email は見つかりませんでした（30 日後に cron が再試行）',
      skipped_no_key: 'ℹ Hunter API キー未設定のためスキップ',
      skipped_cjk_name: 'ℹ CJK（中日韓）のみの名前は Hunter で照会できません。英語名＋会社名を追加すれば cron が再試行',
      skipped_no_company: 'ℹ Hunter は会社名が必須です。会社名を追加すれば cron が再試行',
      error: '⚠ Hunter 照会に失敗しました（ネットワーク/API エラー）、30 日後に再試行',
    },
  }
  return M[lang][r.status]
}

export interface BatchOptions {
  maxContacts?: number       // default 100
  cooldownDays?: number      // default 30
  remainingBuffer?: number   // skip if remaining < this many credits (default 5)
}

export interface BatchResult {
  total: number
  found: number
  skipped: boolean
  skipReason?: string
  creditsLeft: number | null
  results: Array<{ id: string; name: string | null; company: string | null; email: string | null }>
}

export async function runHunterBatch(opts: BatchOptions = {}): Promise<BatchResult> {
  const maxContacts = opts.maxContacts ?? 100
  const cooldownDays = opts.cooldownDays ?? 30
  const remainingBuffer = opts.remainingBuffer ?? 5

  const apiKey = await fetchApiKey()
  if (!apiKey) {
    return { total: 0, found: 0, skipped: true, skipReason: 'no_api_key', creditsLeft: null, results: [] }
  }

  // Credit check: don't start if monthly budget almost depleted
  const account = await getHunterAccount(apiKey)
  if (account && account.remaining < remainingBuffer) {
    return {
      total: 0,
      found: 0,
      skipped: true,
      skipReason: `low_credits (${account.remaining} remaining)`,
      creditsLeft: account.remaining,
      results: [],
    }
  }

  const cooldownCutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString()
  const supabase = createServiceClient()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, name_en, company')
    .is('email', null)
    .is('deleted_at', null)
    .or(`hunter_searched_at.is.null,hunter_searched_at.lt.${cooldownCutoff}`)
    .order('hunter_searched_at', { ascending: true, nullsFirst: true })
    .limit(maxContacts)

  if (!contacts?.length) {
    return { total: 0, found: 0, skipped: false, creditsLeft: account?.remaining ?? null, results: [] }
  }

  let found = 0
  const results: BatchResult['results'] = []

  for (const c of contacts) {
    const r = await enrichContactEmail(c.id, c.name_en, c.name, c.company)
    if (r.status === 'found') found++
    results.push({ id: c.id, name: c.name, company: c.company, email: r.email })
  }

  const postAccount = await getHunterAccount(apiKey)
  return {
    total: contacts.length,
    found,
    skipped: false,
    creditsLeft: postAccount?.remaining ?? null,
    results,
  }
}
