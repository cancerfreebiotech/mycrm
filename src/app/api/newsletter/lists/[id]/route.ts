import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'

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

  const orgCtx = await getOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)

  // Verify list exists
  const { data: existing } = await db
    .from('newsletter_lists')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: 'list not found' }, { status: 404 })
  }

  // Strip from any campaigns that reference this list
  const { data: refCampaigns } = await db
    .from('newsletter_campaigns')
    .select('id, list_ids')
    .contains('list_ids', [id])
  for (const c of refCampaigns ?? []) {
    const remaining = ((c.list_ids as string[]) ?? []).filter((x) => x !== id)
    await db
      .from('newsletter_campaigns')
      .update({ list_ids: remaining })
      .eq('id', c.id)
  }

  // Delete subscriber_list rows for this list (subscribers themselves remain)
  const { error: linkErr } = await db
    .from('newsletter_subscriber_lists')
    .delete()
    .eq('list_id', id)
  if (linkErr) return NextResponse.json({ error: `failed to remove members: ${linkErr.message}` }, { status: 500 })

  // Delete the list row
  const { error: delErr } = await db
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

// PATCH /api/newsletter/lists/[id]
//
// Updates list name and/or description. Slug-key stays put (it's used in
// public unsubscribe URLs and shouldn't change once created).

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const orgCtx = await getOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)

  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string | null }
  const patch: { name?: string; description?: string | null } = {}
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    patch.name = trimmed
  }
  if (body.description !== undefined) {
    patch.description = body.description ? String(body.description).trim() || null : null
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await db
    .from('newsletter_lists')
    .update(patch)
    .eq('id', id)
    .select('id, key, name, description')
    .single()
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'failed to update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, list: updated })
}

export const maxDuration = 30
