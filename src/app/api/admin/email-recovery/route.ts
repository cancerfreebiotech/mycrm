import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// GET /api/admin/email-recovery
// List all contacts with email_status set (bounced/invalid/unsubscribed/etc.)
// and for each, find candidate replacements: another live contact with the
// same name (likely a new business card after job change) carrying a clean
// email. The page lets the user one-click replace the old email with the
// new one, archive old to notes, and clear the bad status.

export const runtime = 'nodejs'
export const maxDuration = 30

interface ContactRef {
  id: string
  name: string | null
  name_en: string | null
  name_local: string | null
  company: string | null
  email: string | null
  email_status: string | null
  created_at: string | null
}

interface RecoveryRow {
  bad: ContactRef
  bad_event_at: string | null
  bad_event_reason: string | null
  candidates: ContactRef[]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  // Step 1: all contacts with non-null email_status (= some kind of email problem)
  const { data: bad } = await db
    .from('contacts')
    .select('id, name, name_en, name_local, company, email, email_status, created_at')
    .not('email_status', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const badRows = (bad ?? []) as ContactRef[]

  if (badRows.length === 0) {
    return NextResponse.json({ total: 0, rows: [] })
  }

  // Step 2: get most recent system event per bad contact (e.g. SendGrid
  // bounce reason) — surfaces "when did this break + why".
  const badIds = badRows.map((c) => c.id)
  const QUERY_BATCH = 200
  const eventByContact = new Map<string, { at: string; reason: string }>()
  for (let i = 0; i < badIds.length; i += QUERY_BATCH) {
    const batch = badIds.slice(i, i + QUERY_BATCH)
    const { data: events } = await db
      .from('interaction_logs')
      .select('contact_id, content, created_at')
      .in('contact_id', batch)
      .eq('type', 'system')
      .or('content.ilike.%bounce%,content.ilike.%退信%,content.ilike.%invalid%,content.ilike.%suppression%')
      .order('created_at', { ascending: false })
      .returns<{ contact_id: string; content: string | null; created_at: string }[]>()
    for (const e of events ?? []) {
      const cid = e.contact_id as string
      if (!eventByContact.has(cid)) {
        eventByContact.set(cid, {
          at: e.created_at as string,
          reason: ((e.content as string) ?? '').slice(0, 300),
        })
      }
    }
  }

  // Step 3: fuzzy-match candidate replacements by name (any of name/name_en/name_local).
  // We look at LIVE contacts created AFTER the bad contact (logic: new card = new job).
  const candidateNames = new Set<string>()
  for (const b of badRows) {
    if (b.name) candidateNames.add(b.name.trim())
    if (b.name_en) candidateNames.add(b.name_en.trim())
    if (b.name_local) candidateNames.add(b.name_local.trim())
  }

  const allCandidates: ContactRef[] = []
  if (candidateNames.size > 0) {
    const namesArr = Array.from(candidateNames).filter(Boolean)
    for (let i = 0; i < namesArr.length; i += QUERY_BATCH) {
      const batch = namesArr.slice(i, i + QUERY_BATCH)
      // Pull all candidates whose name matches; we'll filter further client-side.
      const { data: cands } = await db
        .from('contacts')
        .select('id, name, name_en, name_local, company, email, email_status, created_at')
        .or(
          batch.map((n) => `name.eq.${n}`).join(',') + ',' +
            batch.map((n) => `name_en.eq.${n}`).join(',') + ',' +
            batch.map((n) => `name_local.eq.${n}`).join(',')
        )
        .is('deleted_at', null)
        .is('email_status', null)
      if (cands) allCandidates.push(...(cands as ContactRef[]))
    }
  }

  const rows: RecoveryRow[] = badRows.map((b) => {
    const cands = allCandidates.filter((c) => {
      if (c.id === b.id) return false
      if (!c.email || !c.email.trim()) return false
      // Must share at least one name field
      const sameName =
        (b.name && b.name === c.name) ||
        (b.name_en && b.name_en === c.name_en) ||
        (b.name_local && b.name_local === c.name_local) ||
        (b.name && b.name === c.name_en) ||
        (b.name && b.name === c.name_local) ||
        (b.name_en && b.name_en === c.name) ||
        (b.name_local && b.name_local === c.name)
      if (!sameName) return false
      // Must be created AFTER the bad contact (heuristic: new card = newer)
      if (b.created_at && c.created_at && c.created_at < b.created_at) return false
      // Email must differ
      if ((c.email ?? '').toLowerCase().trim() === (b.email ?? '').toLowerCase().trim()) return false
      return true
    })
    const ev = eventByContact.get(b.id)
    return {
      bad: b,
      bad_event_at: ev?.at ?? null,
      bad_event_reason: ev?.reason ?? null,
      candidates: cands,
    }
  })

  return NextResponse.json({
    total: rows.length,
    with_candidates: rows.filter((r) => r.candidates.length > 0).length,
    rows,
  })
}
