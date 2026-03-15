import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify super_admin
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { dateFrom, dateTo, format } = await req.json() as {
    dateFrom: string
    dateTo: string
    format: 'json' | 'excel'
  }

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: '缺少日期參數' }, { status: 400 })
  }

  try {
    // Sheet 1: contacts created in range
    const { data: contacts } = await service
      .from('contacts')
      .select(`
        name, company, email, phone, job_title, created_at,
        contact_tags(tags(name))
      `)
      .gte('created_at', `${dateFrom}T00:00:00.000Z`)
      .lte('created_at', `${dateTo}T23:59:59.999Z`)
      .order('created_at', { ascending: false })

    // Sheet 2: interaction logs in range
    const { data: logs } = await service
      .from('interaction_logs')
      .select(`
        type, content, email_subject, meeting_date, created_at,
        contacts(name, company)
      `)
      .gte('created_at', `${dateFrom}T00:00:00.000Z`)
      .lte('created_at', `${dateTo}T23:59:59.999Z`)
      .order('created_at', { ascending: false })

    const contactRows = (contacts ?? []).map((c) => ({
      name: c.name ?? '',
      company: c.company ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      job_title: c.job_title ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tags: (c.contact_tags as any[])?.map((ct: any) => ct.tags?.name).filter(Boolean).join(', ') ?? '',
      created_at: c.created_at ? new Date(c.created_at).toLocaleString() : '',
    }))

    const logRows = (logs ?? []).map((l) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contact: (l.contacts as any)?.name ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: (l.contacts as any)?.company ?? '',
      type: l.type ?? '',
      content: l.email_subject ?? l.content ?? '',
      date: l.meeting_date
        ? new Date(l.meeting_date).toLocaleString()
        : l.created_at ? new Date(l.created_at).toLocaleString() : '',
    }))

    if (format === 'json') {
      return NextResponse.json({ contacts: contactRows, logs: logRows })
    }

    // Build Excel
    const wb = XLSX.utils.book_new()

    const ws1 = XLSX.utils.json_to_sheet(contactRows)
    XLSX.utils.book_append_sheet(wb, ws1, '新增名片')

    const ws2 = XLSX.utils.json_to_sheet(logRows)
    XLSX.utils.book_append_sheet(wb, ws2, '互動紀錄')

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
