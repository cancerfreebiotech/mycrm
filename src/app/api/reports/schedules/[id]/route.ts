import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

async function assertSuperAdmin(email: string, service: ReturnType<typeof createServiceClient>) {
  const { data } = await service.from('users').select('role').eq('email', email).single()
  return data?.role === 'super_admin'
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  if (!(await assertSuperAdmin(user.email!, service))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = await req.json()

  // Allowlist updatable fields — prevent mass-assignment
  const update: Record<string, unknown> = {}
  if (raw.recipients !== undefined) update.recipients = raw.recipients
  if (raw.cron_expr !== undefined) update.cron_expr = String(raw.cron_expr)
  if (raw.is_active !== undefined) update.is_active = Boolean(raw.is_active)

  const { error } = await service.from('report_schedules').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  if (!(await assertSuperAdmin(user.email!, service))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service.from('report_schedules').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
