import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { runAllHealthChecks } from '@/lib/healthChecks'

// Re-exported so existing consumers (admin/health page) keep importing the type
// from this route path.
export type { ServiceStatus } from '@/lib/healthChecks'

export async function GET() {
  // Infrastructure status is admin-only (its sole caller is /admin/health);
  // the proxy only enforces login, so restrict to super_admin here.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const services = await runAllHealthChecks()
  const allOk = services.every((s) => s.status !== 'error')

  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), services })
}
