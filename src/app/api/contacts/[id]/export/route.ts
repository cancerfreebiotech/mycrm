import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { hasFeature } from '@/lib/features'
import { logAdminAction } from '@/lib/adminAudit'

// GET /api/contacts/[id]/export — GDPR data-subject export.
//
// Aggregates every personal-data record tied to a single contact into one
// downloadable JSON file. Permission mirrors contact export (contacts page
// `canExport`): super_admin OR granted_features includes 'export_contacts'.
//
// contact_cards image bodies live in Storage, not the DB — only URLs/paths are
// included here.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid contact id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('role, granted_features')
    .ilike('email', user.email)
    .maybeSingle()
  if (!me || !hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], 'export_contacts')) {
    return NextResponse.json({ error: 'Forbidden — export permission required' }, { status: 403 })
  }

  const orgCtx = await getOrgContext()
  const db = orgScopedClient(orgCtx)

  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (contactErr) return NextResponse.json({ error: contactErr.message }, { status: 500 })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Emails that identify this data subject across email-keyed tables.
  const emails = [
    ...new Set(
      [contact.email, contact.second_email]
        .map((e: string | null | undefined) => e?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  ]

  // Rows in newsletter_recipients / email_events may be linked by contact_id OR
  // just by email (historic rows, or after a prior SET NULL). Collect both and
  // dedupe by primary key.
  async function collectByContactOrEmail(table: string): Promise<Record<string, unknown>[]> {
    const [byId, byEmail] = await Promise.all([
      service.from(table).select('*').eq('contact_id', id),
      emails.length > 0
        ? service.from(table).select('*').in('email', emails)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    const map = new Map<unknown, Record<string, unknown>>()
    for (const row of [...(byId.data ?? []), ...(byEmail.data ?? [])]) {
      map.set((row as Record<string, unknown>).id, row as Record<string, unknown>)
    }
    return [...map.values()]
  }

  const [cards, photos, logs, tasks, recipients, events] = await Promise.all([
    db.from('contact_cards').select('*').eq('contact_id', id),
    db.from('contact_photos').select('*').eq('contact_id', id),
    db.from('interaction_logs').select('*').eq('contact_id', id).order('created_at', { ascending: true }),
    db.from('tasks').select('*').eq('contact_id', id),
    collectByContactOrEmail('newsletter_recipients'),
    collectByContactOrEmail('email_events'),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    exported_by: user.email,
    contact,
    contact_cards: cards.data ?? [],
    contact_photos: photos.data ?? [],
    interaction_logs: logs.data ?? [],
    tasks: tasks.data ?? [],
    newsletter_recipients: recipients,
    email_events: events,
  }

  await logAdminAction(db, {
    actorEmail: user.email,
    action: 'gdpr_export',
    target: id,
    detail: {
      contact_cards: payload.contact_cards.length,
      contact_photos: payload.contact_photos.length,
      interaction_logs: payload.interaction_logs.length,
      tasks: payload.tasks.length,
      newsletter_recipients: payload.newsletter_recipients.length,
      email_events: payload.email_events.length,
    },
  })

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="contact-${id}-export.json"`,
    },
  })
}

export const maxDuration = 60
