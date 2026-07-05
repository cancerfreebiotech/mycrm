import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('id, role, granted_features').eq('email', user.email).single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return { userId: profile.id, role: profile.role }
}

// PATCH /api/newsletter/drafts/[id]
//   Body: any subset of { title, content, event_date, photo_urls, links,
//                          period, section, position, status }
//
// DELETE /api/newsletter/drafts/[id]   — soft-delete (status='deleted')

const EDITABLE = new Set([
  'title', 'content', 'event_date', 'event_date_end', 'photo_urls', 'links',
  'period', 'section', 'position', 'status',
])

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const orgCtx = await getOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)

  const body = await req.json() as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (EDITABLE.has(k)) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no editable fields supplied' }, { status: 400 })
  }

  // Drop an end date that precedes the start (when both are supplied together)
  if (typeof patch.event_date_end === 'string' && typeof patch.event_date === 'string' && patch.event_date_end < patch.event_date) {
    patch.event_date_end = null
  }

  // Don't allow moving 'used' drafts (already became campaigns) unless super_admin
  if (patch.status !== 'used' && (patch.period || patch.section)) {
    const { data: existing } = await db
      .from('newsletter_drafts').select('status').eq('id', id).single()
    if (existing?.status === 'used' && auth.role !== 'super_admin') {
      return NextResponse.json({ error: 'Cannot move a used draft' }, { status: 400 })
    }
  }

  const { data, error } = await db
    .from('newsletter_drafts')
    .update(patch).eq('id', id)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const orgCtx = await getOrgContext()
  const db: OrgDb = orgScopedClient(orgCtx)
  const { error } = await db
    .from('newsletter_drafts')
    .update({ status: 'deleted' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
