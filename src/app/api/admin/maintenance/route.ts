import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('id, role')
    .eq('email', user.email)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { service, profileId: profile.id }
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error

  const { data } = await auth.service
    .from('system_settings')
    .select('value, updated_at')
    .eq('key', 'maintenance_mode')
    .single()

  return NextResponse.json({
    enabled: data?.value === 'true',
    updated_at: data?.updated_at ?? null,
  })
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error

  let body: { enabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
  }

  const { error } = await auth.service
    .from('system_settings')
    .update({
      value: body.enabled ? 'true' : 'false',
      updated_at: new Date().toISOString(),
      updated_by: auth.profileId,
    })
    .eq('key', 'maintenance_mode')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, enabled: body.enabled })
}
