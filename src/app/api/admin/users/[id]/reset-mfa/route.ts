import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify caller has user-management capability (super_admin or feature-granted)
  const { data: profile } = await service
    .from('users')
    .select('role, granted_features')
    .eq('email', user.email!)
    .single()

  const role = profile?.role ?? ''
  const granted = (profile?.granted_features as string[] | null) ?? []
  if (role !== 'super_admin' && !hasFeature(role, granted, 'user_management')) {
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

  // Delete ALL factors (verified + unverified) via SECURITY DEFINER RPC.
  // admin.mfa.listFactors hides unverified factors, leaving users stuck mid-
  // enrollment with no way to reset; direct DELETE on auth.mfa_factors covers
  // both states.
  const { data: deleted, error: rpcError } = await service.rpc('admin_delete_all_mfa_factors', {
    p_user_id: authUserId,
  })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: deleted ?? 0 })
}
