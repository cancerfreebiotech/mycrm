import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { generateEmailContent } from '@/lib/gemini'
import { buildContactContext } from '@/lib/contactContext'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { description, templateContent, generateSubject, returnHtml, contact_id } = await req.json()
    if (!description) {
      return NextResponse.json({ error: '缺少 description' }, { status: 400 })
    }

    // user_prompts.user_id is public.users.id (not the auth uid) — resolve by email
    // so the personal email prompt override is actually found.
    const service = createServiceClient()
    const { data: profile } = await service.from('users').select('id').ilike('email', user.email).maybeSingle()

    // When drafting for a specific contact, prepend CRM context so the email is grounded
    // in the relationship (profile, tags, recent interactions, latest social briefing).
    let finalDescription = description as string
    if (contact_id) {
      const context = await buildContactContext(service, String(contact_id))
      if (context) finalDescription = `${context}\n\n撰寫指示：\n${description}`
    }

    const result = await generateEmailContent(finalDescription, templateContent, profile?.id ?? undefined, !!generateSubject, !!returnHtml)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
