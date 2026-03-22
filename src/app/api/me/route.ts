import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data } = await supabase.from('users').select('display_name, role').eq('id', user.id).single()

  return NextResponse.json({ display_name: data?.display_name ?? '', role: data?.role ?? '' })
}
