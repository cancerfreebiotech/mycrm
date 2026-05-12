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

  const { dateFrom, dateTo, format, tagIds, countryCodes, types, creatorIds } = await req.json() as {
    dateFrom: string
    dateTo: string
    format: 'json' | 'excel'
    tagIds?: string[]
    countryCodes?: string[]
    types?: string[]
    creatorIds?: string[]
  }

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: '缺少日期參數' }, { status: 400 })
  }

  try {
    const { data: logs, error: rpcError } = await service.rpc('get_interaction_logs_by_tags', {
      p_tag_ids: (tagIds && tagIds.length > 0) ? tagIds : null,
      p_date_from: `${dateFrom}T00:00:00.000Z`,
      p_date_to: `${dateTo}T23:59:59.999Z`,
      p_created_by: null,
      p_country_codes: (countryCodes && countryCodes.length > 0) ? countryCodes : null,
      p_types: (types && types.length > 0) ? types : null,
      p_created_by_ids: (creatorIds && creatorIds.length > 0) ? creatorIds : null,
      p_exclude_newsletter: true,
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    const TYPE_LABEL: Record<string, string> = {
      meeting: '拜訪',
      note: '備忘',
      email: 'Email',
    }

    const logRows = (logs ?? []).map((l: {
      contact_name: string | null
      contact_company: string | null
      type: string | null
      content: string | null
      email_subject: string | null
      meeting_date: string | null
      meeting_location: string | null
      creator_name: string | null
      log_date: string | null
    }) => ({
      logDate: l.log_date ?? '',
      contact: l.contact_name ?? '',
      company: l.contact_company ?? '',
      type: TYPE_LABEL[l.type ?? ''] ?? l.type ?? '',
      summary: l.type === 'email'
        ? (l.email_subject ?? '')
        : (l.content ?? '').slice(0, 80),
      visitDate: l.meeting_date ?? '',
      location: l.meeting_location ?? '',
      creator: l.creator_name ?? '',
    }))

    if (format === 'json') {
      return NextResponse.json({ logs: logRows })
    }

    // Build Excel with Chinese headers
    const wb = XLSX.utils.book_new()
    const headers = ['填寫日期', '聯絡人', '公司', '類型', '主題/摘要', '拜訪日期', '地點', '填寫人']
    const rows = logRows.map((r: { logDate: string; contact: string; company: string; type: string; summary: string; visitDate: string; location: string; creator: string }) => [r.logDate, r.contact, r.company, r.type, r.summary, r.visitDate, r.location, r.creator])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
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
