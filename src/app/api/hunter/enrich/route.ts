import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { enrichContactEmail } from '@/lib/hunter'

// POST /api/hunter/enrich — enrich a single contact via Hunter (if email empty)
// Body: { contactId: string }
// Returns: { email: string | null }
//
// Client-side new-contact flows (batch upload, manual create) call this after
// insert so they don't need to embed Hunter API key in the browser.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { contactId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  // Fetch contact to ensure still no email + get name/company
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, name_en, company, email')
    .eq('id', body.contactId)
    .single()

  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 })
  if (contact.email) return NextResponse.json({ status: 'already_had_email', email: contact.email })

  const result = await enrichContactEmail(
    contact.id as string,
    contact.name_en as string | null,
    contact.name as string | null,
    contact.company as string | null,
  )
  return NextResponse.json(result)
}
