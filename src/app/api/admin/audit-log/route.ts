import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// GET /api/admin/audit-log — privileged-action audit log (super_admin only).
// /api/admin/* is exempted from the auth middleware, so this handler self-guards.
async function requireSuperAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: user.email }
}

interface AuditRow {
  id: string
  actor_email: string
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

const CSV_CAP = 5000

// A date-only value from <input type="date"> (YYYY-MM-DD) anchors to the
// Asia/Taipei day (UTC+8) so the filter/CSV window matches the product day and
// the timestamps the page displays. Full ISO timestamps pass through as-is.
function normalizeFrom(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value
}

function normalizeTo(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+08:00` : value
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: AuditRow[]): string {
  const header = ['created_at', 'actor_email', 'action', 'target', 'detail']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      csvEscape(r.created_at),
      csvEscape(r.actor_email),
      csvEscape(r.action),
      csvEscape(r.target),
      csvEscape(r.detail),
    ].join(','))
  }
  // Prepend a BOM so Excel opens UTF-8 (CJK) correctly.
  return '﻿' + lines.join('\r\n')
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const actor = (searchParams.get('actor') ?? '').trim()
  const action = (searchParams.get('action') ?? '').trim()
  const target = (searchParams.get('target') ?? '').trim()
  const fromDate = (searchParams.get('from') ?? '').trim()
  const toDate = (searchParams.get('to') ?? '').trim()
  const format = searchParams.get('format')

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const buildQuery = () => {
    let q = db
      .from('admin_actions')
      .select('id, actor_email, action, target, detail, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (actor) q = q.ilike('actor_email', `%${actor}%`)
    if (action) q = q.eq('action', action)
    if (target) q = q.ilike('target', `%${target}%`)
    if (fromDate) q = q.gte('created_at', normalizeFrom(fromDate))
    if (toDate) q = q.lte('created_at', normalizeTo(toDate))
    return q
  }

  if (format === 'csv') {
    const { data, error } = await buildQuery().range(0, CSV_CAP - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const csv = toCsv((data ?? []) as AuditRow[])
    const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await buildQuery().range(from, to)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 })
}
