import { createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

/**
 * Whether the given user email holds the `newsletter` feature grant.
 *
 * The proxy (src/proxy.ts) only enforces login + MFA, so per-feature
 * authorization must be checked inside each mutating campaign route — otherwise
 * any logged-in employee could send/edit/delete campaigns without the grant.
 */
export async function hasNewsletterAccess(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('role, granted_features')
    .ilike('email', email)
    .maybeSingle()
  return !!me && hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], 'newsletter')
}
