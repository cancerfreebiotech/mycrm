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

    // Resolve contact IDs for tag filter (applied to logs via contact_id)
    let contactIdFilter: string[] | null = null
    if (tagIds && tagIds.length > 0) {
      const { data: taggedContacts } = await service
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', tagIds)
      contactIdFilter = [...new Set((taggedContacts ?? []).map((t) => t.contact_id))]
      if (contactIdFilter.length === 0) {
        return format === 'json'
          ? NextResponse.json({ logs: [] })
          : new NextResponse(new Uint8Array(), {
              headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="report_${dateFrom}_${dateTo}.xlsx"`,
              },
            })
      }
    }

    // Interaction logs
    let logsQuery = service
      .from('interaction_logs')
      .select(`
        type, content, email_subject, meeting_date, meeting_time, meeting_location, created_at,
        contacts(name, company)
      `)
      .neq('type', 'system')
      .not('content', 'ilike', '%透過 Telegram Bot 新增名片%')
      .gte('created_at', `${dateFrom}T00:00:00.000Z`)
      .lte('created_at', `${dateTo}T23:59:59.999Z`)
      .order('created_at', { ascending: false })

    if (!isSuperAdmin) {
      logsQuery = logsQuery.eq('created_by', profile.id)
    }
    if (contactIdFilter) {
      logsQuery = logsQuery.in('contact_id', contactIdFilter)
    }

    const { data: logs } = await logsQuery

    const logRows = (logs ?? []).map((l) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contact: (l.contacts as any)?.name ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: (l.contacts as any)?.company ?? '',
      type: l.type ?? '',
      content: l.email_subject ?? l.content ?? '',
      date: l.meeting_date ?? '',
      time: (l as unknown as Record<string, string>).meeting_time
        ? String((l as unknown as Record<string, string>).meeting_time).slice(0, 5)
        : '',
      location: (l as unknown as Record<string, string>).meeting_location ?? '',
      created_at: l.created_at ? new Date(l.created_at).toLocaleString() : '',
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
