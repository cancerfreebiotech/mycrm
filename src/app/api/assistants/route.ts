import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data } = await service
    .from('user_assistants')
    .select('id, assistant_email, users!user_assistants_assistant_email_fkey(display_name)')
    .eq('manager_email', user.email!)

  return NextResponse.json({ assistants: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { assistant_email } = await req.json()

  if (!assistant_email?.trim()) return NextResponse.json({ error: '請輸入 Email' }, { status: 400 })
  if (assistant_email.trim() === user.email) return NextResponse.json({ error: '不能設定自己為助理' }, { status: 400 })

  // Verify the assistant is a registered user
  const { data: assistantUser } = await service
    .from('users')
    .select('email')
    .eq('email', assistant_email.trim())
    .single()

  if (!assistantUser) return NextResponse.json({ error: '找不到此使用者' }, { status: 404 })

  const { error } = await service
    .from('user_assistants')
    .insert({ manager_email: user.email!, assistant_email: assistant_email.trim() })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '已設定此助理' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { assistant_email } = await req.json()

  await service
    .from('user_assistants')
    .delete()
    .eq('manager_email', user.email!)
    .eq('assistant_email', assistant_email)

  return NextResponse.json({ ok: true })
}
