import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

async function getUserProfile(service: ReturnType<typeof createServiceClient>, email: string) {
  const { data } = await service
    .from('users')
    .select('id, role')
    .eq('email', email)
    .single()
  return data
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const profile = await getUserProfile(service, user.email!)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = service
    .from('report_schedules')
    .select('*')
    .order('created_at', { ascending: false })

  if (profile.role !== 'super_admin') {
    query = query.eq('owner_id', profile.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedules: data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const profile = await getUserProfile(service, user.email!)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, frequency, cron_expr, date_range_days, recipients } = body

  if (!name || !frequency || !cron_expr || !date_range_days || !recipients?.length) {
    return NextResponse.json({ error: '請填寫所有欄位' }, { status: 400 })
  }

  const { data, error } = await service
    .from('report_schedules')
    .insert({
      name,
      frequency,
      cron_expr,
      date_range_days,
      recipients,
      created_by: profile.id,
      owner_id: profile.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: data })
}
