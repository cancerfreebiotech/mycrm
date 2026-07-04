import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// GET — fetch campaign details for quick-send page
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('newsletter_campaigns')
    .select('id, title, subject, subject_b, preview_text, content_html, list_ids, status, slug, published_at, sent_at, sent_count, total_recipients, created_at, promo_text, scheduled_at, ab_test_pct, ab_wait_minutes, ab_winner, ab_decided_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH — update editable fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    title?: string; subject?: string; subject_b?: string | null; preview_text?: string;
    content_html?: string; list_ids?: string[]; promo_text?: string | null;
    scheduled_at?: string | null; status?: string;
    ab_test_pct?: number | null; ab_wait_minutes?: number | null
  }

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title
  if (typeof body.subject === 'string') update.subject = body.subject
  if (typeof body.preview_text === 'string') update.preview_text = body.preview_text
  if (typeof body.content_html === 'string') update.content_html = body.content_html
  if (Array.isArray(body.list_ids)) update.list_ids = body.list_ids
  if (body.promo_text !== undefined) update.promo_text = body.promo_text
  if (body.subject_b !== undefined) update.subject_b = body.subject_b
  // A/B holdout settings: pct 10–50, wait one of 60/120/240 minutes (null clears both).
  if (body.ab_test_pct !== undefined) {
    if (body.ab_test_pct !== null && (!Number.isInteger(body.ab_test_pct) || body.ab_test_pct < 10 || body.ab_test_pct > 50)) {
      return NextResponse.json({ error: 'ab_test_pct must be an integer between 10 and 50' }, { status: 400 })
    }
    update.ab_test_pct = body.ab_test_pct
  }
  if (body.ab_wait_minutes !== undefined) {
    if (body.ab_wait_minutes !== null && ![60, 120, 240].includes(body.ab_wait_minutes)) {
      return NextResponse.json({ error: 'ab_wait_minutes must be one of 60, 120, 240' }, { status: 400 })
    }
    update.ab_wait_minutes = body.ab_wait_minutes
  }

  const service = createServiceClient()

  // Scheduling: only the draft<->scheduled transition is editable here; sending/
  // sent/partial are owned by the send worker. Guard on CURRENT status too —
  // otherwise PATCH status:'draft' on a sent campaign would bypass the delete
  // protection above.
  if (body.scheduled_at !== undefined || body.status === 'scheduled' || body.status === 'draft') {
    const { data: cur } = await service
      .from('newsletter_campaigns').select('status').eq('id', id).maybeSingle()
    if (cur && (cur.status === 'draft' || cur.status === 'scheduled')) {
      if (body.scheduled_at !== undefined) update.scheduled_at = body.scheduled_at
      if (body.status === 'scheduled' || body.status === 'draft') update.status = body.status
    }
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true, noChange: true })
  const { error } = await service.from('newsletter_campaigns').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove campaign (draft only; sent campaigns are protected)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: campaign } = await service
    .from('newsletter_campaigns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (campaign.status === 'sent' || campaign.status === 'partial') return NextResponse.json({ error: '已寄送的電子報不可刪除' }, { status: 400 })

  const { error } = await service.from('newsletter_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
