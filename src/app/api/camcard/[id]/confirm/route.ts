import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const OCR_TO_CONTACT: Record<string, string> = {
  name: 'name',
  name_en: 'name_en',
  name_local: 'name_local',
  company: 'company',
  company_en: 'company_en',
  company_local: 'company_local',
  job_title: 'job_title',
  email: 'email',
  second_email: 'second_email',
  phone: 'phone',
  second_phone: 'second_phone',
  address: 'address',
  website: 'website',
  linkedin_url: 'linkedin_url',
  facebook_url: 'facebook_url',
  country_code: 'country_code',
}

/**
 * POST /api/camcard/[id]/confirm
 * Creates a new contact from camcard_pending OCR data.
 * Marks the pending row as confirmed.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: pending, error: fetchErr } = await supabase
    .from('camcard_pending')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !pending) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ocr = (pending.ocr_data ?? {}) as Record<string, string | null>

  // Build contact fields from OCR data
  const contactData: Record<string, unknown> = { source: 'camcard', imported_at: new Date().toISOString() }
  for (const [ocrKey, contactKey] of Object.entries(OCR_TO_CONTACT)) {
    if (ocr[ocrKey]) contactData[contactKey] = ocr[ocrKey]
  }
  if (pending.card_img_url) contactData.card_img_url = pending.card_img_url

  const { data: contact, error: insertErr } = await supabase
    .from('contacts')
    .insert(contactData)
    .select('id')
    .single()

  if (insertErr || !contact) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Write system log
  await supabase.from('interaction_logs').insert({
    contact_id: contact.id,
    type: 'system',
    content: `從名片王匯入（${pending.image_filename ?? ''}）`,
  })

  // Mark pending as confirmed
  await supabase
    .from('camcard_pending')
    .update({ status: 'confirmed' })
    .eq('id', id)

  return NextResponse.json({ ok: true, contactId: contact.id })
}
