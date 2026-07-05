import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { logAdminAction } from '@/lib/adminAudit'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// POST /api/admin/users/[id]/telegram-id
// super_admin updates a teammate's telegram_id. Body: { telegramId: number | null }
// Server-side validation is just "integer or null" — we trust admin to type the right value.
// (UI does a soft "looks too short" confirm, but server intentionally doesn't gate on length.)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

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
  const body = await req.json().catch(() => ({}))
  const raw = body.telegramId

  let telegramId: number | null = null
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: 'telegramId must be a positive integer or null' }, { status: 400 })
    }
    telegramId = n
  }

  const { error } = await service
    .from('users')
    .update({ telegram_id: telegramId })
    .eq('id', targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  await logAdminAction(db, {
    actorEmail: user.email ?? 'unknown',
    action: 'set_telegram_id',
    target: targetUserId,
    detail: { telegramId },
  })

  return NextResponse.json({ ok: true, telegramId })
}
