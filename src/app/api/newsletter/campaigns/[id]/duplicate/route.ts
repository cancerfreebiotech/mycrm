import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST — duplicate a campaign into a fresh draft
//
// Copies: title (append " (副本)"), subject, preview_text, content_html, list_ids
// Clears: status → draft, sent_at, sent_count, total_recipients, published_at, slug
// Slug is cleared because it's UNIQUE; user can set a new one after editing.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('id').ilike('email', user.email).maybeSingle()
  const userId = me?.id ?? null

  const { data: src, error: fetchErr } = await service
    .from('newsletter_campaigns')
    .select('title, subject, preview_text, content_html, list_ids')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!src) return NextResponse.json({ error: 'source not found' }, { status: 404 })

  const { data: dup, error: insertErr } = await service
    .from('newsletter_campaigns')
    .insert({
      title: `${src.title ?? ''} (副本)`,
      subject: src.subject ?? '',
      preview_text: src.preview_text,
      content_html: src.content_html,
      list_ids: src.list_ids ?? [],
      status: 'draft',
      created_by: userId,
    })
    .select('id')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json(dup)
}
