import type { SupabaseClient } from '@supabase/supabase-js'

// GDPR erasure tombstones.
// When a contact is permanently deleted (right to erasure), we record its
// email(s) in `newsletter_blacklist` with reason = 'erasure' so that inbound
// email capture (findOrCreateContactByEmail) and Hunter enrichment never
// silently recreate the same person from the same address the next day.
//
// NOTE: newsletter_blacklist.status has a CHECK constraint that does NOT include
// an 'erasure' value (allowed: bounced/invalid/deferred/mailbox_full/
// sender_blocked/recipient_blocked). We therefore store a valid status
// ('recipient_blocked') and use the `reason` column as the tombstone marker.

export const ERASURE_REASON = 'erasure'
const ERASURE_STATUS = 'recipient_blocked'

// True if the email has an active erasure tombstone.
export async function isEmailErased(
  supabase: SupabaseClient,
  email: string | null | undefined,
): Promise<boolean> {
  const norm = email?.trim().toLowerCase()
  if (!norm) return false
  const { data } = await supabase
    .from('newsletter_blacklist')
    .select('email')
    .eq('email', norm)
    .eq('reason', ERASURE_REASON)
    .limit(1)
    .maybeSingle()
  return !!data
}

// Record erasure tombstones for the given emails. Existing blacklist rows are
// left untouched (ignoreDuplicates → ON CONFLICT DO NOTHING) so a previously
// suppressed address keeps its original reason/status.
// Returns true if at least one non-empty email was submitted.
export async function addErasureTombstones(
  service: SupabaseClient,
  emails: (string | null | undefined)[],
): Promise<boolean> {
  const norm = [
    ...new Set(
      emails
        .map((e) => e?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  ]
  if (norm.length === 0) return false
  await service
    .from('newsletter_blacklist')
    .upsert(
      norm.map((email) => ({ email, reason: ERASURE_REASON, status: ERASURE_STATUS })),
      { onConflict: 'email', ignoreDuplicates: true },
    )
  return true
}
