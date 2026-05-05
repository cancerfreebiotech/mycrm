import type { SupabaseClient } from '@supabase/supabase-js'

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
export async function findOrCreateContactByEmail(
  supabase: SupabaseClient,
  { email, name, createdBy }: FindOrCreateContactInput
): Promise<FindOrCreateContactResult> {
  const norm = email.trim().toLowerCase()
  if (!norm) throw new Error('email required')

  const { data: existing, error: selErr } = await supabase
    .from('contacts')
    .select('id')
    .ilike('email', norm)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (selErr) throw selErr
  if (existing?.id) return { id: existing.id, created: false }

  const { data: inserted, error: insErr } = await supabase
    .from('contacts')
    .insert({
      name: name?.trim() || norm,
      email: norm,
      source: 'inbound_email',
      importance: 'medium',
      language: 'english',
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (insErr) throw insErr
  return { id: inserted.id, created: true }
}
