import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'

// GET /api/newsletter/period-meta?period=YYYY-MM
//   Returns the meta row for the period, or default-shaped object if none.
//
// PATCH /api/newsletter/period-meta
//   Body: { period: 'YYYY-MM', label_last?: string|null, label_next?: string|null }
//   Upserts the row + invalidates newsletter_compose_cache for that period
//   (so the next preview re-runs compose with the new meta).
//
// Note: highlight is no longer stored here. It's a newsletter_drafts row with
// section='highlight' (v6.8.2+).

async function authorize() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('id, role, granted_features').eq('email', user.email).single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return { userId: profile.id }
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
  const { data } = await db
    .from('newsletter_period_meta')
    .select('period, label_last, label_next, updated_at')
    .eq('period', period)
    .maybeSingle()
  return NextResponse.json({
    period,
    label_last: data?.label_last ?? null,
    label_next: data?.label_next ?? null,
    updated_at: data?.updated_at ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    period?: string
    label_last?: string | null
    label_next?: string | null
  }
  const { period } = body
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }

  const ctx = await getOrgContext()
  const db: OrgDb = orgScopedClient(ctx)

  // Build patch with only the fields the caller actually sent. undefined means
  // "don't touch"; null means "clear back to default".
  const patch: Record<string, unknown> = { period, updated_by: auth.userId, updated_at: new Date().toISOString() }
  if (body.label_last !== undefined) patch.label_last = body.label_last
  if (body.label_next !== undefined) patch.label_next = body.label_next

  const { error } = await db.from('newsletter_period_meta').upsert(patch, { onConflict: 'org_id,period' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate compose cache for this period so the next preview reflects the new meta
  await db.from('newsletter_compose_cache').delete().eq('period', period)

  const { data } = await db
    .from('newsletter_period_meta')
    .select('period, label_last, label_next, updated_at')
    .eq('period', period)
    .single()
  return NextResponse.json({ ok: true, meta: data })
}
