import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// GET /api/contacts/shared-emails
//
// Returns emails that appear on >1 active contact (deleted_at IS NULL),
// with each contact's basic info. Used by /admin/shared-emails to surface
// contacts that share an email — common when partners / family members or
// shared inboxes (info@, sales@) get added separately.

interface ContactRef {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
}

interface SharedEmailGroup {
  email: string
  count: number
  contacts: ContactRef[]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  // Pull all active contacts with email; group in JS (data is small enough,
  // ~5k rows max even with 3 langs).
  const allContacts: { id: string; email: string; name: string | null; company: string | null; job_title: string | null }[] = []
  let from = 0
  const BATCH = 1000
  while (true) {
    const { data, error } = await db
      .from('contacts')
      .select('id, email, name, company, job_title')
      .is('deleted_at', null)
      .not('email', 'is', null)
      .neq('email', '')
      .range(from, from + BATCH - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allContacts.push(...data as typeof allContacts)
    if (data.length < BATCH) break
    from += BATCH
  }

  const groups = new Map<string, ContactRef[]>()
  for (const c of allContacts) {
    const key = c.email.trim().toLowerCase()
    if (!key) continue
    let arr = groups.get(key)
    if (!arr) { arr = []; groups.set(key, arr) }
    arr.push({ id: c.id, name: c.name, company: c.company, job_title: c.job_title })
  }

  const shared: SharedEmailGroup[] = []
  for (const [email, contacts] of groups) {
    if (contacts.length > 1) shared.push({ email, count: contacts.length, contacts })
  }
  shared.sort((a, b) => b.count - a.count || a.email.localeCompare(b.email))

  return NextResponse.json({
    total_groups: shared.length,
    total_contacts_with_shared_email: shared.reduce((sum, g) => sum + g.count, 0),
    groups: shared,
  })
}

export const maxDuration = 60
