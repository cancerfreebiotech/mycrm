import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST — add a contact to a list
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { list_id?: string; contact_id?: string; email?: string }
  if (!body.list_id || (!body.contact_id && !body.email)) {
    return NextResponse.json({ error: 'list_id and contact_id or email required' }, { status: 400 })
  }

  const service = createServiceClient()

  let subscriber: { id: string } | null = null

  if (body.contact_id) {
    const { data: contact } = await service
      .from('contacts')
      .select('id, email, name, name_en, name_local')
      .eq('id', body.contact_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!contact) return NextResponse.json({ error: '找不到聯絡人' }, { status: 404 })
    if (!contact.email) return NextResponse.json({ error: '此聯絡人沒有 email，無法加入名單' }, { status: 422 })

    const { data: byContactId } = await service
      .from('newsletter_subscribers')
      .select('id')
      .eq('contact_id', body.contact_id)
      .maybeSingle()
    subscriber = byContactId

    if (!subscriber) {
      const { data: byEmail } = await service
        .from('newsletter_subscribers')
        .select('id')
        .eq('email', contact.email)
        .maybeSingle()
      subscriber = byEmail
    }

    if (!subscriber) {
      const displayName = (contact.name || contact.name_en || contact.name_local || '').split(' ')
      const { data: created, error: createErr } = await service
        .from('newsletter_subscribers')
        .insert({
          email: contact.email,
          contact_id: body.contact_id,
          first_name: displayName[0] ?? null,
          last_name: displayName.slice(1).join(' ') || null,
          source: 'crm',
        })
        .select('id')
        .single()
      if (createErr || !created) return NextResponse.json({ error: '建立訂閱者失敗' }, { status: 500 })
      subscriber = created
    }
  } else {
    // Email-only path
    const email = body.email!.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '請輸入有效的 email 格式' }, { status: 422 })
    }

    const { data: byEmail } = await service
      .from('newsletter_subscribers')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    subscriber = byEmail

    if (!subscriber) {
      const { data: created, error: createErr } = await service
        .from('newsletter_subscribers')
        .insert({ email, source: 'manual' })
        .select('id')
        .single()
      if (createErr || !created) return NextResponse.json({ error: '建立訂閱者失敗' }, { status: 500 })
      subscriber = created
    }
  }

  // Check already in list
  const { data: existing } = await service
    .from('newsletter_subscriber_lists')
    .select('subscriber_id')
    .eq('list_id', body.list_id)
    .eq('subscriber_id', subscriber.id)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: '此聯絡人已在名單中' }, { status: 409 })

  const { error: insertErr } = await service
    .from('newsletter_subscriber_lists')
    .insert({ list_id: body.list_id, subscriber_id: subscriber.id })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, subscriber_id: subscriber.id })
}

// DELETE — remove a subscriber from a list
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { list_id?: string; subscriber_id?: string }
  if (!body.list_id || !body.subscriber_id) {
    return NextResponse.json({ error: 'list_id and subscriber_id required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('newsletter_subscriber_lists')
    .delete()
    .eq('list_id', body.list_id)
    .eq('subscriber_id', body.subscriber_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
