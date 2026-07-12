import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { hasFeatureAccess } from '@/lib/featureAccess'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasFeatureAccess(user.email, 'camcard'))) {
    return NextResponse.json({ error: 'Forbidden — camcard permission required' }, { status: 403 })
  }

  const body = await req.json()
  const { ocr_data } = body

  if (!ocr_data || typeof ocr_data !== 'object') {
    return NextResponse.json({ error: 'ocr_data required' }, { status: 400 })
  }

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  // Preserve import-time metadata that the edit form doesn't include
  const { data: existing } = await db
    .from('camcard_pending')
    .select('ocr_data')
    .eq('id', id)
    .single()
  const existingOcr = (existing?.ocr_data ?? {}) as Record<string, unknown>
  const PRESERVE = ['referred_by'] as const
  const preserved: Record<string, unknown> = {}
  for (const k of PRESERVE) {
    if (existingOcr[k]) preserved[k] = existingOcr[k]
  }
  const { error } = await db
    .from('camcard_pending')
    .update({ ocr_data: { ...ocr_data, ...preserved } })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
