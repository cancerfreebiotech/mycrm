import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST /api/contacts/[id]/clear-unsubscribe
// Comprehensively un-suppress this contact's email so they can receive
// newsletters / broadcast emails again. Three layers of state are reset:
//   1. contacts.email_status = NULL (clears bounced/invalid/unsubscribed badge)
//   2. newsletter_unsubscribes row deleted (the canonical global blocklist)
//   3. newsletter_subscribers.unsubscribed_at cleared (per-list state)
// Also writes a system interaction_log so the action is auditable.

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  const userId = me?.id ?? null

  const { data: contact } = await service
    .from('contacts')
    .select('id, name, email, email_status')
    .eq('id', id)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 })

  const oldStatus = contact.email_status
  const email = (contact.email ?? '').trim().toLowerCase()

  const summary: string[] = []

  // 1. Clear email_status on contact
  if (oldStatus) {
    await service.from('contacts').update({ email_status: null }).eq('id', id)
    summary.push(`contacts.email_status (${oldStatus}→null)`)
  }

  // 2. Remove from global blocklist
  if (email) {
    const { count: unsubCount } = await service
      .from('newsletter_unsubscribes')
      .delete({ count: 'exact' })
      .eq('email', email)
    if (unsubCount && unsubCount > 0) {
      summary.push(`newsletter_unsubscribes (${unsubCount} row removed)`)
    }
  }

  // 3. Reset per-list subscriber state (case-insensitive)
  if (email) {
    const { data: subRows } = await service
      .from('newsletter_subscribers')
      .select('id')
      .ilike('email', email)
      .not('unsubscribed_at', 'is', null)
    const subIds = (subRows ?? []).map((s: { id: string }) => s.id)
    if (subIds.length > 0) {
      await service
        .from('newsletter_subscribers')
        .update({ unsubscribed_at: null })
        .in('id', subIds)
      summary.push(`newsletter_subscribers (${subIds.length} unsub cleared)`)
    }
  }

  if (summary.length > 0) {
    await service.from('interaction_logs').insert({
      contact_id: id,
      type: 'system',
      content: `手動清除退訂/退信狀態：${summary.join('; ')}`,
      created_by: userId,
    })
  }

  return NextResponse.json({ ok: true, cleared: summary })
}
