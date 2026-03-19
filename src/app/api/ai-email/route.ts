import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { generateEmailContent } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { description, templateContent, model, generateSubject } = await req.json()
    if (!description) {
      return NextResponse.json({ error: '缺少 description' }, { status: 400 })
    }

    const result = await generateEmailContent(description, templateContent, model, user.id, !!generateSubject)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
