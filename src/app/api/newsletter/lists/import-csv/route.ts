import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { parseCsv } from '@/lib/csv'

// POST /api/newsletter/lists/import-csv
//
// multipart/form-data with field `file` = CSV file.
// CSV columns must be exactly "名字" (name) + "email" (case-insensitive on
// "email"). Header order doesn't matter; any extra columns are ignored.
//
// Behavior:
// - List name is derived from filename (.csv stripped, non-alphanumeric removed,
//   CJK preserved). Falls back to `import-<timestamp>` if name would be empty.
// - List key (slug) is ASCII-only derived from filename, with timestamp collision.
// - Rows with bad email format are SKIPPED and counted.
// - Rows duplicating an earlier email in the same CSV are SKIPPED and counted.
// - Rows whose email appears in newsletter_blacklist or newsletter_unsubscribes
//   are STILL IMPORTED (per user policy 2026-05-20) — only counted for stats.
// - Subscribers are upsert by email (unique). The reverse trigger
//   `link_subscriber_to_contact` auto-fills contact_id when a matching contact
//   exists. No contacts are ever created.

const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const NAME_HEADER = '名字'

interface ParsedRow {
  email: string
  name: string | null
}

function sanitizeListName(filename: string): string {
  const stripped = filename.replace(/\.csv$/i, '').replace(/[^\p{L}\p{N}]/gu, '')
  return stripped || `import-${Date.now()}`
}

function sanitizeListKey(filename: string): string {
  const stripped = filename
    .replace(/\.csv$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return stripped || `csv-${Date.now().toString(36)}`
}

export async function POST(req: NextRequest) {
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

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid form data' }, { status: 400 })
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 })
  }

  let text: string
  try {
    text = await file.text()
  } catch {
    return NextResponse.json({ error: 'failed to read file' }, { status: 400 })
  }

  const rows = parseCsv(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'csv_empty' }, { status: 400 })
  }

  const headers = rows[0].map((h) => h.trim())
  const nameIdx = headers.findIndex((h) => h === NAME_HEADER)
  const emailIdx = headers.findIndex((h) => h.toLowerCase() === 'email')
  if (nameIdx === -1 || emailIdx === -1) {
    return NextResponse.json({ error: 'csv_headers', seen: headers }, { status: 400 })
  }

  // Per-row triage
  const total = rows.length - 1
  let invalidFormat = 0
  let duplicatesInCsv = 0
  const seenInCsv = new Set<string>()
  const acceptedRows: ParsedRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rawEmail = (r[emailIdx] ?? '').trim()
    const rawName = nameIdx >= 0 ? (r[nameIdx] ?? '').trim() : ''
    if (!rawEmail) { invalidFormat++; continue }
    if (!EMAIL_RX.test(rawEmail)) { invalidFormat++; continue }
    const lc = rawEmail.toLowerCase()
    if (seenInCsv.has(lc)) { duplicatesInCsv++; continue }
    seenInCsv.add(lc)
    acceptedRows.push({ email: lc, name: rawName || null })
  }

  // Informational: count how many accepted emails were previously bounced /
  // unsubscribed. They are STILL imported — this is just stats for the user.
  const QUERY_BATCH = 200
  const acceptedEmails = acceptedRows.map((r) => r.email)
  const bouncedSet = new Set<string>()
  const unsubSet = new Set<string>()

  for (let i = 0; i < acceptedEmails.length; i += QUERY_BATCH) {
    const batch = acceptedEmails.slice(i, i + QUERY_BATCH)
    const [{ data: bl }, { data: us }, { data: subs }] = await Promise.all([
      service.from('newsletter_blacklist').select('email').in('email', batch),
      service.from('newsletter_unsubscribes').select('email').in('email', batch),
      service
        .from('newsletter_subscribers')
        .select('email, unsubscribed_at')
        .in('email', batch)
        .not('unsubscribed_at', 'is', null),
    ])
    for (const r of bl ?? []) if (r.email) bouncedSet.add((r.email as string).toLowerCase())
    for (const r of us ?? []) if (r.email) unsubSet.add((r.email as string).toLowerCase())
    for (const r of subs ?? []) if (r.email) unsubSet.add((r.email as string).toLowerCase())
  }

  // Allocate list (with key collision handling)
  const listName = sanitizeListName(file.name)
  let listKey = sanitizeListKey(file.name)
  const { data: existing } = await service
    .from('newsletter_lists')
    .select('id')
    .eq('key', listKey)
    .maybeSingle()
  if (existing) listKey = `${listKey}-${Date.now().toString(36)}`

  const { data: created, error: createErr } = await service
    .from('newsletter_lists')
    .insert({ key: listKey, name: listName, description: null })
    .select('id, key, name')
    .single()
  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? 'failed to create list' }, { status: 500 })
  }

  // Upsert subscribers (one row per unique email; existing rows preserved)
  const source = `csv_import_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const subscriberPayload = acceptedRows.map((r) => ({
    email: r.email,
    first_name: r.name,
    source,
  }))
  const INSERT_BATCH = 500
  const errors: string[] = []
  for (let i = 0; i < subscriberPayload.length; i += INSERT_BATCH) {
    const chunk = subscriberPayload.slice(i, i + INSERT_BATCH)
    const { error } = await service
      .from('newsletter_subscribers')
      .upsert(chunk, { onConflict: 'email', ignoreDuplicates: true })
    if (error) errors.push(`upsert subscribers batch ${i / INSERT_BATCH}: ${error.message}`)
  }

  // Re-fetch IDs by email to build link rows
  const subscriberIdByEmail = new Map<string, string>()
  for (let i = 0; i < acceptedEmails.length; i += QUERY_BATCH) {
    const batch = acceptedEmails.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_subscribers')
      .select('id, email')
      .in('email', batch)
    for (const s of data ?? []) {
      if (s.email) subscriberIdByEmail.set((s.email as string).toLowerCase(), s.id as string)
    }
  }

  const linkRows: { list_id: string; subscriber_id: string }[] = []
  const seenSubIds = new Set<string>()
  for (const r of acceptedRows) {
    const sid = subscriberIdByEmail.get(r.email)
    if (!sid || seenSubIds.has(sid)) continue
    seenSubIds.add(sid)
    linkRows.push({ list_id: created.id, subscriber_id: sid })
  }

  let imported = 0
  for (let i = 0; i < linkRows.length; i += INSERT_BATCH) {
    const chunk = linkRows.slice(i, i + INSERT_BATCH)
    const { error } = await service.from('newsletter_subscriber_lists').insert(chunk)
    if (error) {
      errors.push(`insert link rows batch ${i / INSERT_BATCH}: ${error.message}`)
      continue
    }
    imported += chunk.length
  }

  return NextResponse.json({
    list_id: created.id,
    list_key: created.key,
    list_name: created.name,
    stats: {
      total,
      imported,
      duplicates_in_csv: duplicatesInCsv,
      invalid_format: invalidFormat,
      bounced: bouncedSet.size,
      unsubscribed: unsubSet.size,
    },
    errors: errors.length > 0 ? errors : undefined,
  })
}

export const maxDuration = 300
