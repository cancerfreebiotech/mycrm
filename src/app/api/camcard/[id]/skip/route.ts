import { NextRequest, NextResponse } from 'next/server'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

/**
 * POST /api/camcard/[id]/skip
 * Marks the pending row as skipped.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const { error } = await db
    .from('camcard_pending')
    .update({ status: 'skipped' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
