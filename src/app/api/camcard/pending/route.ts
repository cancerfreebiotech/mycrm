import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const supabase = createServiceClient()
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'), 0)
  const search = (url.searchParams.get('search') ?? '').trim()
  const hasDuplicate = url.searchParams.get('has_duplicate') === '1'
  const countryCode = (url.searchParams.get('country_code') ?? '').trim()
  const hasEmail = url.searchParams.get('has_email') === '1'
  const assignee = (url.searchParams.get('assignee') ?? '').trim()  // exact label; special '__unassigned__' for NULL
  const sort = url.searchParams.get('sort') ?? 'newest'

  let countQ = supabase
    .from('camcard_pending')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  let dataQ = supabase
    .from('camcard_pending')
    .select('id, image_filename, card_img_url, back_img_url, ocr_data, status, duplicate_contact_id, match_type, created_at, assignee_label')
    .eq('status', 'pending')

  if (assignee === '__unassigned__') {
    countQ = countQ.is('assignee_label', null)
    dataQ = dataQ.is('assignee_label', null)
  } else if (assignee) {
    countQ = countQ.eq('assignee_label', assignee)
    dataQ = dataQ.eq('assignee_label', assignee)
  }

  if (hasDuplicate) {
    countQ = countQ.not('duplicate_contact_id', 'is', null)
    dataQ = dataQ.not('duplicate_contact_id', 'is', null)
  }
  if (countryCode) {
    countQ = countQ.filter('ocr_data->>country_code', 'eq', countryCode)
    dataQ = dataQ.filter('ocr_data->>country_code', 'eq', countryCode)
  }
  if (hasEmail) {
    countQ = countQ.not('ocr_data->>email', 'is', null).filter('ocr_data->>email', 'neq', '')
    dataQ = dataQ.not('ocr_data->>email', 'is', null).filter('ocr_data->>email', 'neq', '')
  }
  if (search) {
    const s = `%${search}%`
    const orFilter = `image_filename.ilike.${s},ocr_data->>name.ilike.${s},ocr_data->>name_en.ilike.${s},ocr_data->>company.ilike.${s},ocr_data->>company_en.ilike.${s}`
    countQ = countQ.or(orFilter)
    dataQ = dataQ.or(orFilter)
  }

  const { count } = await countQ

  const { data, error } = await dataQ
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const dupIds = [...new Set((data ?? []).map((r) => r.duplicate_contact_id).filter(Boolean))]
  let dupMap: Record<string, { id: string; name: string | null; name_en: string | null; company: string | null; email: string | null }> = {}
  if (dupIds.length > 0) {
    const { data: dups } = await supabase
      .from('contacts')
      .select('id, name, name_en, company, email')
      .in('id', dupIds as string[])
    for (const d of dups ?? []) dupMap[d.id] = d
  }

  const cards = (data ?? []).map((r) => ({
    ...r,
    duplicate_contact: r.duplicate_contact_id ? (dupMap[r.duplicate_contact_id] ?? null) : null,
  }))

  return NextResponse.json({ cards, total: count ?? 0 })
}
