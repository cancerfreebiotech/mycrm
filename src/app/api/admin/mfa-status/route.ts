import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

/**
 * GET /api/admin/mfa-status
 * Returns a map of { [email]: boolean } indicating whether each user has verified MFA.
 * Only accessible by super_admin.
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

  // Get all auth users
  const { data: { users: authUsers }, error } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Check each user's MFA factors individually (listUsers doesn't reliably include factor data)
  const status: Record<string, boolean> = {}
  await Promise.all(
    authUsers.map(async (u) => {
      if (!u.email) return
      const { data: factorsData } = await service.auth.admin.mfa.listFactors({ userId: u.id })
      const allFactors = [
        ...(factorsData?.totp ?? []),
        ...(factorsData?.phone ?? []),
      ]
      status[u.email] = allFactors.some((f) => f.status === 'verified')
    })
  )

  return NextResponse.json({ status })
}
