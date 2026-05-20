import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

/**
 * GET /api/admin/mfa-status
 * Returns { [email]: { verified, anyFactor } } per user.
 *   - verified:  has a factor in 'verified' state (MFA actually enforced)
 *   - anyFactor: has any factor row (incl. 'unverified' — stuck mid-enroll)
 * Admin UI uses `verified` for the status pill and `anyFactor` to decide
 * whether the Reset MFA button should appear.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await service.rpc('get_users_mfa_status')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const status: Record<string, { verified: boolean; anyFactor: boolean }> = {}
  for (const row of (data ?? []) as { email: string; has_mfa: boolean; has_any_factor: boolean }[]) {
    status[row.email] = { verified: row.has_mfa, anyFactor: row.has_any_factor }
  }

  return NextResponse.json({ status })
}
