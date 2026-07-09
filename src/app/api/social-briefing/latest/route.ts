import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// GET /api/social-briefing/latest?contactId=<uuid>
// 回傳該聯絡人最新一份 briefing（任何狀態；無則 briefing: null）。
// 聯絡人頁掛載時用它載回已存結果，避免每次都重新生成。
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contactId = req.nextUrl.searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data } = await db
    .from('contact_briefings')
    .select('id, status, result_md, sources, model_used, error_message, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ briefing: data ?? null })
}
