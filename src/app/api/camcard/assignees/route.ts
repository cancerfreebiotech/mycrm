import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET — distinct assignee_label values in status='pending' rows (for filter dropdown)
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('camcard_pending')
    .select('assignee_label')
    .eq('status', 'pending')
    .not('assignee_label', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { assignee_label: string }[]) {
    const k = row.assignee_label
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  // Include unassigned count
  const { count: unassigned } = await supabase
    .from('camcard_pending')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('assignee_label', null)

  const assignees = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

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
