import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import type { FeatureKey } from '@/lib/features'
import { hasFeature } from '@/lib/features'

/**
 * Check if the authenticated user has permission for a feature.
 * Returns null if allowed, or a 403 NextResponse if not.
 */
export async function checkPermission(
  userEmail: string,
  feature: FeatureKey
): Promise<NextResponse | null> {
  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('users')
    .select('role, granted_features')
    .eq('email', userEmail)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!hasFeature(profile.role, profile.granted_features ?? [], feature)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
