import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

// DELETE /api/newsletter/lists/[id]
//
// Removes the list itself and the subscriber_list join rows. Subscribers stay
// (they may belong to other lists); contacts are never touched. Also strips
// this list_id from any newsletter_campaigns.list_ids array so future sends
// don't reference a dead list.

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid list id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('id, role, granted_features')
    .ilike('email', user.email)
    .maybeSingle()
  if (!me || !hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], 'newsletter')) {
    return NextResponse.json({ error: 'Forbidden — newsletter permission required' }, { status: 403 })
  }

  // Verify list exists
  const { data: existing } = await service
    .from('newsletter_lists')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: 'list not found' }, { status: 404 })
  }

  // Strip from any campaigns that reference this list
  const { data: refCampaigns } = await service
    .from('newsletter_campaigns')
    .select('id, list_ids')
    .contains('list_ids', [id])
  for (const c of refCampaigns ?? []) {
    const remaining = ((c.list_ids as string[]) ?? []).filter((x) => x !== id)
    await service
      .from('newsletter_campaigns')
      .update({ list_ids: remaining })
      .eq('id', c.id)
  }

  // Delete subscriber_list rows for this list (subscribers themselves remain)
  const { error: linkErr } = await service
    .from('newsletter_subscriber_lists')
    .delete()
    .eq('list_id', id)
  if (linkErr) return NextResponse.json({ error: `failed to remove members: ${linkErr.message}` }, { status: 500 })

  // Delete the list row
  const { error: delErr } = await service
    .from('newsletter_lists')
    .delete()
    .eq('id', id)
  if (delErr) return NextResponse.json({ error: `failed to delete list: ${delErr.message}` }, { status: 500 })

  return NextResponse.json({
    ok: true,
    deleted_list_id: id,
    cleared_from_campaigns: (refCampaigns ?? []).length,
  })
}

export const maxDuration = 30
