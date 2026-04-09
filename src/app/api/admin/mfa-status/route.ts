import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

/**
 * GET /api/admin/mfa-status
 * Returns { [email]: boolean } indicating verified MFA per user.
 * Uses a DB function to query auth.mfa_factors directly — avoids
 * permission issues with the auth.admin.mfa JS API.
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

  const status: Record<string, boolean> = {}
  for (const row of (data ?? []) as { email: string; has_mfa: boolean }[]) {
    status[row.email] = row.has_mfa
  }

  return NextResponse.json({ status })
}
