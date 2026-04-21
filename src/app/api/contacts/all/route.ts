import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const SELECT_FIELDS = 'id, name, company, job_title, email, phone, country_code, met_at, created_at, last_activity_at, importance, language, email_status, users!created_by(display_name), contact_tags(tags(id, name))'
const BATCH_SIZE = 1000

// GET — fetch all contacts (bypasses PostgREST 1000-row limit via pagination)
// Default order: last_activity_at DESC (interaction_logs.created_at MAX for
// types note/meeting/email, fallback to contacts.created_at). Keeps contacts
// with recent activity near the top even if the row itself is old.
export async function GET() {
  const supabase = createServiceClient()

  const allContacts: unknown[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select(SELECT_FIELDS)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .range(from, from + BATCH_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break

    allContacts.push(...data)
    if (data.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return NextResponse.json(allContacts)
}
