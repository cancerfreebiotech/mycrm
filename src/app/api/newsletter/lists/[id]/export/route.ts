import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

// GET /api/newsletter/lists/[id]/export
//
// Returns subscribers of the list as CSV. Columns: email, first_name,
// last_name, company, source, joined_at, unsubscribed.
// Unsubscribe state is read from `newsletter_unsubscribes` (canonical).

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const { data: list } = await service
    .from('newsletter_lists')
    .select('id, key, name')
    .eq('id', id)
    .maybeSingle()
  if (!list) return NextResponse.json({ error: 'list not found' }, { status: 404 })

  // Pull all members (could be thousands; paginate)
  type Row = {
    added_at: string | null
    newsletter_subscribers: {
      email: string
      first_name: string | null
      last_name: string | null
      company: string | null
      source: string | null
    } | null
  }
  const allRows: Row[] = []
  let from = 0
  const BATCH = 1000
  while (true) {
    const { data, error } = await service
      .from('newsletter_subscriber_lists')
      .select('added_at, newsletter_subscribers(email, first_name, last_name, company, source)')
      .eq('list_id', id)
      .range(from, from + BATCH - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allRows.push(...(data as unknown as Row[]))
    if (data.length < BATCH) break
    from += BATCH
  }

  // Look up canonical unsubscribe set for these emails
  const emails = Array.from(
    new Set(
      allRows
        .map((r) => r.newsletter_subscribers?.email?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  )
  const unsubscribed = new Set<string>()
  const QUERY_BATCH = 200
  for (let i = 0; i < emails.length; i += QUERY_BATCH) {
    const batch = emails.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_unsubscribes')
      .select('email')
      .in('email', batch)
    for (const u of data ?? []) {
      if (u.email) unsubscribed.add((u.email as string).toLowerCase())
    }
  }

  // Build CSV (RFC 4180-ish: quote everything, double internal quotes)
  function csvCell(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const lines: string[] = []
  lines.push(['email', 'first_name', 'last_name', 'company', 'source', 'joined_at', 'unsubscribed'].map(csvCell).join(','))
  for (const r of allRows) {
    const s = r.newsletter_subscribers
    if (!s) continue
    const isUnsub = unsubscribed.has((s.email ?? '').toLowerCase()) ? 'yes' : 'no'
    lines.push([
      s.email,
      s.first_name,
      s.last_name,
      s.company,
      s.source,
      r.added_at,
      isUnsub,
    ].map(csvCell).join(','))
  }
  // Add UTF-8 BOM so Excel opens Chinese/Japanese correctly
  const csv = '﻿' + lines.join('\r\n') + '\r\n'

  const safeName = (list.key as string).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'list'
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

export const maxDuration = 60
