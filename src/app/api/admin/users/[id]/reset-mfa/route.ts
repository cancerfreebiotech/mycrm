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

  // Look up target user's email from public users table
  const { data: targetProfile } = await service
    .from('users')
    .select('email')
    .eq('id', targetUserId)
    .single()

  if (!targetProfile?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Resolve auth user UUID via DB function (avoids listUsers API permission issues)
  const { data: authUserId, error: lookupError } = await service.rpc('get_auth_user_id_by_email', {
    p_email: targetProfile.email,
  })

  if (lookupError || !authUserId) {
    return NextResponse.json({ error: 'Auth user not found' }, { status: 404 })
  }

  // Delete all verified MFA factors directly via admin API
  const { data: factorsData, error: listError } = await service.auth.admin.mfa.listFactors({ userId: authUserId })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const allFactors = [
    ...(factorsData?.totp ?? []),
    ...(factorsData?.phone ?? []),
  ]

  let deleted = 0
  for (const factor of allFactors) {
    const { error } = await service.auth.admin.mfa.deleteFactor({ userId: authUserId, id: factor.id })
    if (!error) deleted++
  }

  return NextResponse.json({ ok: true, deleted })
}
