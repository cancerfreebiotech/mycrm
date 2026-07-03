import { NextResponse } from 'next/server'
import { runAllHealthChecks } from '@/lib/healthChecks'

// Re-exported so existing consumers (admin/health page) keep importing the type
// from this route path.
export type { ServiceStatus } from '@/lib/healthChecks'

export async function GET() {
  const services = await runAllHealthChecks()
  const allOk = services.every((s) => s.status !== 'error')

  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), services })
}
