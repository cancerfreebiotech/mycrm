import type { OrgDb } from './orgContext'
import { tldToCountryCode, countryCodeToLanguage } from './emailDomainToCountry'
import { isEmailErased } from './erasureTombstone'
import { escapeLikePattern } from './likeEscape'

export interface FindOrCreateContactInput {
  email: string
  name?: string | null
  createdBy: string | null
}

export interface FindOrCreateContactResult {
  id: string
  created: boolean
}

// Find an existing contact by lowercase email, or create a minimal new one.
// Used by inbound email capture (workers/inbound-email) to attach interactions
// to a contact even when the sender/recipient isn't in the CRM yet.
// Returns null when the email carries a GDPR erasure tombstone — the caller must
// skip it so an erased contact is never recreated from the same address.
export async function findOrCreateContactByEmail(
  supabase: OrgDb,
  { email, name, createdBy }: FindOrCreateContactInput
): Promise<FindOrCreateContactResult | null> {
  const norm = email.trim().toLowerCase()
  if (!norm) throw new Error('email required')

  const { data: existing, error: selErr } = await supabase
    .from('contacts')
    .select('id')
    // escape LIKE wildcards so a local-part '_' / '%' matches literally
    // (still case-insensitive), not as a pattern that hits the wrong contact
    .ilike('email', escapeLikePattern(norm))
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (selErr) throw selErr
  if (existing?.id) return { id: existing.id, created: false }

  // 防復活：曾被永久刪除（erasure）的 email 不得重建
  if (await isEmailErased(supabase, norm)) return null

  const countryCode = tldToCountryCode(norm)
  const language = countryCodeToLanguage(countryCode)

  const { data: inserted, error: insErr } = await supabase
    .from('contacts')
    .insert({
      name: name?.trim() || norm,
      email: norm,
      source: 'inbound_email',
      importance: 'medium',
      language,
      created_by: createdBy,
      ...(countryCode ? { country_code: countryCode } : {}),
    })
    .select('id')
    .single()

  if (insErr) throw insErr

  // Auto-tag with "BCC" so contacts created via BCC inbox are filterable
  const { data: bccTag } = await supabase
    .from('tags')
    .select('id')
    .ilike('name', 'BCC')
    .maybeSingle()
  if (bccTag?.id) {
    await supabase.from('contact_tags').insert({ contact_id: inserted.id, tag_id: bccTag.id })
  }

  return { id: inserted.id, created: true }
}
