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

// Split a `name` string into (first_name, last_name) for the Hunter API.
// Name may be Chinese (no space, last = whole string) or Western (space-sep).
function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? '').trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: '', lastName: parts[0] ?? '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

// Try one Hunter email-finder lookup. Returns email if found, null otherwise.
// Writes contacts.hunter_searched_at regardless (so we don't re-query).
// If `email` found, also writes contacts.email.
export async function enrichContactEmail(
  contactId: string,
  nameEn: string | null | undefined,
  name: string | null | undefined,
  company: string | null | undefined,
): Promise<string | null> {
  const apiKey = await fetchApiKey()
  if (!apiKey) return null

  // Prefer English name for Hunter (Western-style first/last)
  const { firstName, lastName } = splitName(nameEn || name)
  if (!lastName && !firstName) return null

  const params = new URLSearchParams({ api_key: apiKey, last_name: lastName })
  if (firstName) params.set('first_name', firstName)
  if (company) params.set('company', company)

  const supabase = createServiceClient()
  try {
    const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`)
    if (!res.ok) {
      await supabase.from('contacts').update({ hunter_searched_at: new Date().toISOString() }).eq('id', contactId)
      return null
    }
    const data = await res.json()
    const email: string | null = data?.data?.email ?? null

    if (email && email.includes('@')) {
      await supabase
        .from('contacts')
        .update({ email, hunter_searched_at: new Date().toISOString() })
        .eq('id', contactId)
      return email
    }

    await supabase.from('contacts').update({ hunter_searched_at: new Date().toISOString() }).eq('id', contactId)
    return null
  } catch {
    return null
  }
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
    const email = await enrichContactEmail(c.id, c.name_en, c.name, c.company)
    if (email) found++
    results.push({ id: c.id, name: c.name, company: c.company, email })
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
