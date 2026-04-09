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

  // List all MFA factors for the target user
  const { data: factorsData, error: listError } = await service.auth.admin.mfa.listFactors({ userId: targetUserId })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const factors = factorsData?.factors ?? []

  // Delete each factor
  let deleted = 0
  for (const factor of factors) {
    const { error } = await service.auth.admin.mfa.deleteFactor({ userId: targetUserId, id: factor.id })
    if (!error) deleted++
  }

  return NextResponse.json({ ok: true, deleted })
}
