import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data } = await service
    .from('gmail_oauth')
    .select('email, expiry')
    .limit(1)
    .single()

  return NextResponse.json({ email: data?.email ?? null, expiry: data?.expiry ?? null })
}
