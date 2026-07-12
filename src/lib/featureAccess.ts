import { createServiceClient } from '@/lib/supabase'
import { hasFeature, type FeatureKey } from '@/lib/features'

/**
 * Whether the given user email holds the grant for a managed feature.
 *
 * The proxy (src/proxy.ts) only enforces login + MFA, so per-feature
 * authorization must be checked inside each managed-feature route — otherwise
 * any logged-in employee could operate the feature without the grant.
 *
 * Generalizes hasNewsletterAccess() to any FeatureKey (camcard, etc.).
 */
export async function hasFeatureAccess(
  email: string | undefined | null,
  feature: FeatureKey
): Promise<boolean> {
  if (!email) return false
  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('role, granted_features')
    .ilike('email', email)
    .maybeSingle()
  return !!me && hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], feature)
}
