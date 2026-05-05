import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET — distinct assignee_label values in status='pending' rows (for filter dropdown)
export async function GET() {
  const supabase = createServiceClient()

  const [{ data: rpcData, error }, { count: unassigned }] = await Promise.all([
    supabase.rpc('get_camcard_assignee_counts'),
    supabase.from('camcard_pending').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('assignee_label', null),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const assignees = (rpcData ?? []).map((r: { assignee_label: string; cnt: number }) => ({
    label: r.assignee_label,
    count: Number(r.cnt),
  }))

  return NextResponse.json({ assignees, unassigned: unassigned ?? 0 })
}

// PATCH — bulk update assignee_label
// Body: { ids: string[], assignee_label: string | null }
export async function PATCH(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json() as { ids?: string[]; assignee_label?: string | null }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }
  const label = body.assignee_label?.trim() || null
  const { error, data } = await supabase
    .from('camcard_pending')
    .update({ assignee_label: label })
    .in('id', body.ids)
    .eq('status', 'pending')
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0 })
}
