import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchApiKey } from './hunter'
import { isEmailErased } from './erasureTombstone'

const FREE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.jp', 'yahoo.co.tw', 'yahoo.com.tw',
  'outlook.com', 'hotmail.com', 'hotmail.co.jp', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'qq.com', '163.com', '126.com', 'sina.com', 'sina.cn',
])

interface HunterEmail {
  value: string
  first_name?: string | null
  last_name?: string | null
  position?: string | null
  linkedin?: string | null
  phone_number?: string | null
}

interface HunterDomainSearchResponse {
  data?: {
    organization?: string | null
    emails?: HunterEmail[]
  }
}

// Call Hunter.io domain-search for the email's domain and backfill empty
// fields on the contact. Runs after the HTTP response is sent (via after())
// so it never delays the inbound-parse webhook.
// API key is read from system_settings (key = 'hunter_api_key') via fetchApiKey().
// Silently no-ops if key is unset or the domain is a free provider.
export async function hunterEnrich(
  supabase: SupabaseClient,
  contactId: string,
  email: string,
  userId: string | null,
): Promise<void> {
  const apiKey = await fetchApiKey()
  if (!apiKey) return

  const norm = email.trim().toLowerCase()
  // 防復活：曾被永久刪除（erasure）的 email 不再補全
  if (await isEmailErased(supabase, norm)) return
  const domain = norm.split('@')[1]
  if (!domain || FREE_DOMAINS.has(domain)) return

  let json: HunterDomainSearchResponse
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=100&api_key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return
    json = (await res.json()) as HunterDomainSearchResponse
  } catch {
    return
  }

  const org = json.data?.organization ?? null
  const found = (json.data?.emails ?? []).find((e) => e.value.toLowerCase() === norm)

  if (!found && !org) return

  const { data: contact } = await supabase
    .from('contacts')
    .select('name, email, company, job_title, linkedin_url, phone')
    .eq('id', contactId)
    .single()
  if (!contact) return

  const updates: Record<string, string> = {}
  const enriched: string[] = []

  if (found) {
    const fullName = [found.first_name, found.last_name].filter(Boolean).join(' ').trim()
    // Only replace name if it's still the email address (our creation-time fallback)
    if (fullName && (!contact.name || contact.name === contact.email)) {
      updates.name = fullName
      enriched.push(`姓名：${fullName}`)
    }
    if (found.position && !contact.job_title) {
      updates.job_title = found.position
      enriched.push(`職稱：${found.position}`)
    }
    if (found.linkedin && !contact.linkedin_url) {
      updates.linkedin_url = found.linkedin
      enriched.push('LinkedIn')
    }
    if (found.phone_number && !contact.phone) {
      updates.phone = found.phone_number
      enriched.push(`電話：${found.phone_number}`)
    }
  }

  if (org && !contact.company) {
    updates.company = org
    enriched.push(`公司：${org}`)
  }

  if (Object.keys(updates).length === 0) return

  await supabase.from('contacts').update(updates).eq('id', contactId)
  await supabase.from('interaction_logs').insert({
    contact_id: contactId,
    type: 'system',
    content: `Hunter.io 自動補全：${enriched.join('、')}`,
    created_by: userId,
  })
}
