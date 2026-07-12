import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { hasFeatureAccess } from '@/lib/featureAccess'

/**
 * POST /api/camcard/[id]/skip
 * Marks the pending row as skipped.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasFeatureAccess(user.email, 'camcard'))) {
    return NextResponse.json({ error: 'Forbidden — camcard permission required' }, { status: 403 })
  }

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const { error } = await db
    .from('camcard_pending')
    .update({ status: 'skipped' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
