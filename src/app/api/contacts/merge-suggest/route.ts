import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { suggestMergePlan, type ContactRow } from '@/lib/mergeSuggest'

export const maxDuration = 60

// 與 ai-merge-review 相同的欄位集合，加上 referred_by（屬於合併時會補入的欄位）。
const CONTACT_FIELDS =
  'id, name, name_en, name_local, company, company_en, company_local, job_title, department, ' +
  'email, second_email, phone, second_phone, address, website, linkedin_url, facebook_url, ' +
  'country_code, notes, met_at, met_date, referred_by, created_at'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const contactIdA: string | undefined = body?.contact_id_a
  const contactIdB: string | undefined = body?.contact_id_b
  if (!contactIdA || !contactIdB || contactIdA === contactIdB) {
    return NextResponse.json({ error: '缺少聯絡人 ID' }, { status: 400 })
  }

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from('contacts').select(CONTACT_FIELDS).eq('id', contactIdA).is('deleted_at', null).maybeSingle(),
    db.from('contacts').select(CONTACT_FIELDS).eq('id', contactIdB).is('deleted_at', null).maybeSingle(),
  ])
  if (!a || !b) return NextResponse.json({ error: '找不到聯絡人' }, { status: 404 })

  try {
    const plan = await suggestMergePlan(a as unknown as ContactRow, b as unknown as ContactRow)
    return NextResponse.json(plan)
  } catch (e) {
    return NextResponse.json({ error: `AI 建議失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }
}
