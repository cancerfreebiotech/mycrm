import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST — create a new blank campaign draft
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    subject?: string
    preview_text?: string
    content_html?: string
    list_ids?: string[]
  }

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('id').ilike('email', user.email).maybeSingle()
  const userId = me?.id ?? null

  const { data, error } = await service
    .from('newsletter_campaigns')
    .insert({
      title: body.title ?? '未命名電子報',
      subject: body.subject ?? '',
      preview_text: body.preview_text ?? null,
      content_html: body.content_html ?? '<p>（請在 quick-send 頁面編輯內容）</p>',
      list_ids: body.list_ids ?? [],
      status: 'draft',
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
