import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'

// PATCH /api/newsletter/drafts/reorder
//   Body: { items: Array<{ id, section, position }> }
//   Persists drag-and-drop reordering / cross-section moves in one call.
async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('id, role, granted_features').eq('email', user.email).single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return { role: profile.role }
}

const SECTIONS = new Set(['last_month', 'next_month', 'highlight'])

export async function PATCH(req: NextRequest) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    period?: string
    items?: Array<{ id: string; section: string; position: number }>
  }
  const period = body.period
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return NextResponse.json({ error: 'items required' }, { status: 400 })
  for (const it of items) {
    if (!it.id || !SECTIONS.has(it.section) || !Number.isInteger(it.position)) {
      return NextResponse.json({ error: 'each item needs id, valid section, integer position' }, { status: 400 })
    }
  }

  const ctx = await getOrgContext()
  const db: OrgDb = orgScopedClient(ctx)
  // Scope each update to the viewed period and to movable statuses — 'used' drafts
  // (already turned into campaigns) and 'deleted' must not be reshuffled here, matching
  // the single-draft PATCH guard.
  const results = await Promise.all(items.map((it) =>
    db.from('newsletter_drafts')
      .update({ section: it.section, position: it.position })
      .eq('id', it.id)
      .eq('period', period)
      .in('status', ['draft', 'approved'])
  ))
  const failed = results.find((r) => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updated: items.length })
}
