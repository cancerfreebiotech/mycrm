import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify caller is super_admin
  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: targetUserId } = await params

  // Look up the target user's email from public users table
  const { data: targetProfile } = await service
    .from('users')
    .select('email')
    .eq('id', targetUserId)
    .single()

  if (!targetProfile?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Resolve the auth user ID by email (public users.id may differ from auth.users.id)
  const { data: { users: authUsers }, error: listErr } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  const authUser = authUsers.find(u => u.email === targetProfile.email)
  if (!authUser) return NextResponse.json({ error: 'Auth user not found' }, { status: 404 })

  const authUserId = authUser.id

  // List all MFA factors for the target auth user
  const { data: factorsData, error: listFactorsError } = await service.auth.admin.mfa.listFactors({ userId: authUserId })
  if (listFactorsError) return NextResponse.json({ error: listFactorsError.message }, { status: 500 })

  // listFactors returns { totp: [], phone: [] } — combine all factor types
  const allFactors = [
    ...(factorsData?.totp ?? []),
    ...(factorsData?.phone ?? []),
  ]

  // Delete each factor
  let deleted = 0
  for (const factor of allFactors) {
    const { error } = await service.auth.admin.mfa.deleteFactor({ userId: authUserId, id: factor.id })
    if (!error) deleted++
  }

  return NextResponse.json({ ok: true, deleted })
}
