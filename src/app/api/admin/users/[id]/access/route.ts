import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'

// Super Admin (per CLAUDE.md) must never be demoted or deleted.
const SUPER_ADMIN_EMAIL = 'pohan.chen@cancerfree.io'

// POST /api/admin/users/[id]/access
// Body: { role?: 'super_admin' | 'member' } OR { granted_features?: string[] }
//
// Server-side, audited replacement for the previous browser-side
// `users.update({ role | granted_features })`. These are privilege grants, so:
//   - caller must be super_admin (RLS also enforces this, but we 403 explicitly)
//   - the Super Admin account cannot be demoted (defense-in-depth; a DB trigger
//     enforces the same rule against direct writes)
//   - every change is written to the admin_actions audit log
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: caller } = await service
    .from('users')
    .select('role')
    .eq('email', user.email)
    .single()
  if (caller?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { role?: string; granted_features?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { id: targetId } = await params
  const { data: target } = await service
    .from('users')
    .select('email, role, granted_features')
    .eq('id', targetId)
    .single()
  if (!target?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}

  if (typeof body.role === 'string') {
    if (body.role !== 'super_admin' && body.role !== 'member') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL && body.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super Admin 不可被降級' }, { status: 403 })
    }
    updates.role = body.role
  }

  if (Array.isArray(body.granted_features)) {
    updates.granted_features = body.granted_features.filter((f) => typeof f === 'string')
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error: updErr } = await service.from('users').update(updates).eq('id', targetId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  if ('role' in updates) {
    await logAdminAction(service, {
      actorEmail: user.email,
      action: 'set_role',
      target: target.email,
      detail: { from: target.role, to: updates.role },
    })
  }
  if ('granted_features' in updates) {
    await logAdminAction(service, {
      actorEmail: user.email,
      action: 'set_features',
      target: target.email,
      detail: { from: target.granted_features ?? [], to: updates.granted_features },
    })
  }

  return NextResponse.json({ ok: true, ...updates })
}
