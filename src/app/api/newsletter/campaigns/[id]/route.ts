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
    .select('id, title, subject, preview_text, content_html, list_ids, status, slug, published_at, sent_at, sent_count, total_recipients, created_at')
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
    title?: string; subject?: string; preview_text?: string;
    content_html?: string; list_ids?: string[]
  }

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title
  if (typeof body.subject === 'string') update.subject = body.subject
  if (typeof body.preview_text === 'string') update.preview_text = body.preview_text
  if (typeof body.content_html === 'string') update.content_html = body.content_html
  if (Array.isArray(body.list_ids)) update.list_ids = body.list_ids

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true, noChange: true })

  const service = createServiceClient()
  const { error } = await service.from('newsletter_campaigns').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
