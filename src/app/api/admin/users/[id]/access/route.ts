import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'

// Super Admin (per CLAUDE.md) must never be demoted or deleted.
const SUPER_ADMIN_EMAIL = 'pohan.chen@cancerfree.io'

// POST /api/admin/users/[id]/access
// Body: { role?: 'super_admin' | 'member' } and/or { granted_features?: string[] }
//       and/or { status?: 'active' | 'suspended' }
//
// Server-side, audited replacement for the previous browser-side
// `users.update({ role | granted_features })`. These are privilege grants, so:
//   - caller must be super_admin (RLS also enforces this, but we 403 explicitly)
//   - the Super Admin account cannot be demoted or suspended (defense-in-depth; a
//     DB trigger enforces the demote rule against direct writes)
//   - every change is written to the admin_actions audit log
//
// `status` is the suspend/offboarding switch. It lives on
// organization_members.status (NOT public.users), so we update all of the target's
// membership rows (single org today). NOTE: suspension only takes effect at the
// user's next login/auth callback — an already-logged-in user keeps their session
// until it expires (≤7 days). See src/app/api/auth/callback/route.ts.
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

  let body: { role?: string; granted_features?: string[]; status?: string }
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

  // Suspension / offboarding — writes to organization_members.status, not users.
  let statusChange: { from: string | null; to: 'active' | 'suspended' } | null = null
  if (typeof body.status === 'string') {
    if (body.status !== 'active' && body.status !== 'suspended') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    const nextStatus = body.status as 'active' | 'suspended'
    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL && nextStatus === 'suspended') {
      return NextResponse.json({ error: 'Super Admin 不可被停用' }, { status: 403 })
    }
    const { data: membership } = await service
      .from('organization_members')
      .select('status')
      .eq('user_id', targetId)
      .limit(1)
      .maybeSingle()
    statusChange = { from: membership?.status ?? null, to: nextStatus }
  }

  if (Object.keys(updates).length === 0 && !statusChange) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await service.from('users').update(updates).eq('id', targetId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  if (statusChange) {
    // Single org today → update all of this user's membership rows.
    const { error: stErr } = await service
      .from('organization_members')
      .update({ status: statusChange.to })
      .eq('user_id', targetId)
    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })
  }

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
  if (statusChange) {
    await logAdminAction(service, {
      actorEmail: user.email,
      action: 'set_status',
      target: target.email,
      detail: { from: statusChange.from, to: statusChange.to },
    })
  }

  return NextResponse.json({ ok: true, ...updates, ...(statusChange ? { status: statusChange.to } : {}) })
}

// GET /api/admin/users/[id]/access
// Returns every member's membership status: { statuses: [{ user_id, status }] }.
// organization_members has RLS enabled with no policies yet (v8.0 Phase 0), so the
// browser client can't read it — the admin users page fetches status through here.
// The [id] segment is ignored; the response is the full single-org roster.
export async function GET() {
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

  const { data, error } = await service
    .from('organization_members')
    .select('user_id, status')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ statuses: data ?? [] })
}
