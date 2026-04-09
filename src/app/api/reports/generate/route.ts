import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('id, role')
    .eq('email', user.email!)
    .single()

  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dateFrom, dateTo, format, tagIds } = await req.json() as {
    dateFrom: string
    dateTo: string
    format: 'json' | 'excel'
    tagIds?: string[]
  }

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: '缺少日期參數' }, { status: 400 })
  }

  try {
    const isSuperAdmin = profile.role === 'super_admin'

    // Use RPC to avoid URL length limits when filtering by many contact IDs
    const { data: logs, error: rpcError } = await service.rpc('get_interaction_logs_by_tags', {
      p_tag_ids: (tagIds && tagIds.length > 0) ? tagIds : null,
      p_date_from: `${dateFrom}T00:00:00.000Z`,
      p_date_to: `${dateTo}T23:59:59.999Z`,
      p_created_by: isSuperAdmin ? null : profile.id,
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    const logRows = (logs ?? []).map((l: {
      contact_name: string | null
      contact_company: string | null
      type: string | null
      content: string | null
      email_subject: string | null
      meeting_date: string | null
      meeting_time: string | null
      meeting_location: string | null
    }) => ({
      contact: l.contact_name ?? '',
      company: l.contact_company ?? '',
      type: l.type ?? '',
      content: l.email_subject ?? l.content ?? '',
      date: l.meeting_date ?? '',
      time: l.meeting_time ? String(l.meeting_time).slice(0, 5) : '',
      location: l.meeting_location ?? '',
    }))

    if (format === 'json') {
      return NextResponse.json({ logs: logRows })
    }

    // Build Excel
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(logRows)
    XLSX.utils.book_append_sheet(wb, ws, '互動紀錄')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_${dateFrom}_${dateTo}.xlsx"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
