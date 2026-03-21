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
 * POST /api/camcard/[id]/merge
 * Body: { contactId: string }
 *
 * Merges camcard_pending OCR data into an existing contact.
 * Empty fields on the existing contact are filled from OCR data.
 * Adds the card image to contact_cards.
 * Marks the pending row as confirmed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { contactId } = await req.json()

  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const supabase = createServiceClient()

  const [{ data: pending }, { data: contact }] = await Promise.all([
    supabase.from('camcard_pending').select('*').eq('id', id).single(),
    supabase.from('contacts').select('*').eq('id', contactId).single(),
  ])

  if (!pending) return NextResponse.json({ error: 'Pending not found' }, { status: 404 })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const ocr = (pending.ocr_data ?? {}) as Record<string, string | null>

  // Fill empty fields on existing contact from OCR data
  const updates: Record<string, unknown> = {}
  for (const [ocrKey, contactKey] of Object.entries(OCR_TO_CONTACT)) {
    if (!contact[contactKey] && ocr[ocrKey]) {
      updates[contactKey] = ocr[ocrKey]
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('contacts').update(updates).eq('id', contactId)
  }

  // Add card image to contact_cards if available
  if (pending.card_img_url) {
    await supabase.from('contact_cards').insert({
      contact_id: contactId,
      card_img_url: pending.card_img_url,
      storage_path: pending.storage_path,
      label: '名片王匯入',
    })
  }

  // Write system log
  await supabase.from('interaction_logs').insert({
    contact_id: contactId,
    type: 'system',
    content: `名片王名片合併（${pending.image_filename ?? ''}）`,
  })

  // Mark pending as confirmed
  await supabase
    .from('camcard_pending')
    .update({ status: 'confirmed' })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
