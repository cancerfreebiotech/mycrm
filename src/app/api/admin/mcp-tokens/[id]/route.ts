import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { logAdminAction } from '@/lib/adminAudit'

// PATCH  /api/admin/mcp-tokens/[id]  — enable / disable a token
//   Body: { disabled: boolean, reason?: string }
// DELETE /api/admin/mcp-tokens/[id]  — permanently delete a token
//
// super_admin only.

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('id, role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return null
  return { id: profile.id as string, email: user.email }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { disabled?: boolean; reason?: string }
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const patch = body.disabled
    ? { disabled_at: new Date().toISOString(), disabled_reason: body.reason?.trim() || null }
    : { disabled_at: null, disabled_reason: null }
  const { error } = await db.from('agent_tokens').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const service = createServiceClient()
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { error } = await db.from('agent_tokens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(service, {
    actorEmail: admin.email ?? 'unknown',
    action: 'mcp_token_revoke',
    target: id,
  })

  return NextResponse.json({ ok: true })
}
