import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'

// GET /api/newsletter/drafts?period=2026-05
//   List all drafts for a period, grouped by section, ordered by position + event_date.
//
// POST /api/newsletter/drafts
//   Body: { period, section, title?, content?, event_date?, links?, created_via? }
//   Returns: the inserted draft.

async function authorize(): Promise<{ userId: string; email: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('id, role, granted_features')
    .eq('email', user.email)
    .single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return { userId: profile.id, email: user.email }
}

export async function GET(req: NextRequest) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const period = req.nextUrl.searchParams.get('period')
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }

  const ctx = await getOrgContext()
  const db: OrgDb = orgScopedClient(ctx)
  const { data, error } = await db
    .from('newsletter_drafts')
    .select('*, creator:created_by(id, email, display_name)')
    .eq('period', period)
    .neq('status', 'deleted')
    .order('section')
    .order('position')
    .order('event_date', { nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    period: string
    section: 'last_month' | 'next_month' | 'highlight'
    title?: string
    content?: string
    event_date?: string
    event_date_end?: string
    photo_urls?: string[]
    links?: Array<{ url: string; label?: string }>
    created_via?: 'telegram' | 'web'
  }
  if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }
  if (body.section !== 'last_month' && body.section !== 'next_month' && body.section !== 'highlight') {
    return NextResponse.json({ error: "section must be 'last_month', 'next_month' or 'highlight'" }, { status: 400 })
  }

  const ctx = await getOrgContext()
  const db: OrgDb = orgScopedClient(ctx)

  // Auto-position: append after last in same section/period
  const { data: existing } = await db
    .from('newsletter_drafts')
    .select('position')
    .eq('period', body.period)
    .eq('section', body.section)
    .neq('status', 'deleted')
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = (existing?.[0]?.position ?? -1) + 1

  // Drop an end date that precedes the start (UI guards this, but enforce server-side too)
  const eventDateEnd = body.event_date_end && body.event_date && body.event_date_end < body.event_date
    ? null : (body.event_date_end ?? null)

  const { data, error } = await db
    .from('newsletter_drafts')
    .insert({
      period: body.period,
      section: body.section,
      title: body.title ?? null,
      content: body.content ?? null,
      event_date: body.event_date ?? null,
      event_date_end: eventDateEnd,
      photo_urls: body.photo_urls ?? [],
      links: body.links ?? [],
      created_by: auth.userId,
      created_via: body.created_via ?? 'web',
      position: nextPos,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft: data })
}
