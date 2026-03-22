import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { generateCardFilename } from '@/lib/cardFilename'

const OCR_TO_CONTACT: Record<string, string> = {
  name: 'name',
  name_en: 'name_en',
  name_local: 'name_local',
  company: 'company',
  company_en: 'company_en',
  company_local: 'company_local',
  job_title: 'job_title',
  department: 'department',
  email: 'email',
  second_email: 'second_email',
  phone: 'phone',
  second_phone: 'second_phone',
  fax: 'fax',
  address: 'address',
  address_en: 'address_en',
  website: 'website',
  linkedin_url: 'linkedin_url',
  facebook_url: 'facebook_url',
  country_code: 'country_code',
}

const KNOWN_CONTACT_KEYS = new Set(Object.values(OCR_TO_CONTACT))

/**
 * POST /api/camcard/[id]/confirm
 * Creates a new contact from camcard_pending OCR data.
 * Marks the pending row as confirmed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const tagIds: string[] = body.tagIds ?? []
  const supabase = createServiceClient()

  // Resolve confirming user — prefer body params, fall back to session cookie
  let confirmedByName: string = body.confirmedByName ?? ''
  let confirmedByUserId: string | null = null
  if (body.confirmedByUserId) {
    const { data: profile } = await supabase.from('users').select('display_name').eq('id', body.confirmedByUserId).single()
    if (profile) {
      confirmedByUserId = body.confirmedByUserId
      if (!confirmedByName) confirmedByName = profile.display_name || ''
    }
  }
  // Fallback: read from session cookie (covers batch confirm and race conditions)
  if (!confirmedByUserId) {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('display_name').eq('id', user.id).single()
      if (profile) {
        confirmedByUserId = user.id
        confirmedByName = profile.display_name || ''
      }
    }
  }

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
  const contactData: Record<string, unknown> = {
    source: 'camcard',
    imported_at: new Date().toISOString(),
    created_at: pending.created_at,  // use scan time so camcard contacts sort earlier
  }
  if (confirmedByUserId) contactData.created_by = confirmedByUserId
  const extraData: Record<string, string> = {}
  for (const [ocrKey, contactKey] of Object.entries(OCR_TO_CONTACT)) {
    if (ocr[ocrKey]) contactData[contactKey] = ocr[ocrKey]
  }
  // Any OCR keys not mapped to a contact column go into extra_data
  for (const [k, v] of Object.entries(ocr)) {
    if (v && !KNOWN_CONTACT_KEYS.has(k) && !OCR_TO_CONTACT[k]) extraData[k] = v
  }
  if (Object.keys(extraData).length > 0) contactData.extra_data = extraData
  // Name / company fallback: use English if no local language version
  if (!contactData.name && contactData.name_en) contactData.name = contactData.name_en
  if (!contactData.company && contactData.company_en) contactData.company = contactData.company_en
  if (pending.card_img_url) contactData.card_img_url = pending.card_img_url
  if (pending.back_img_url) contactData.card_img_back_url = pending.back_img_url

  const { data: contact, error: insertErr } = await supabase
    .from('contacts')
    .insert(contactData)
    .select('id')
    .single()

  if (insertErr || !contact) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Apply tags
  if (tagIds.length > 0) {
    await supabase.from('contact_tags').insert(
      tagIds.map((tagId) => ({ contact_id: contact.id, tag_id: tagId }))
    )
  }

  // Move staging images from camcard/ to cards/ with unified naming
  const personName = (ocr.name || ocr.name_en || '').replace(/[\s,./\\]/g, '')
  if (pending.storage_path) {
    const frontFile = await generateCardFilename({ name: personName || undefined, side: 'front' })
    const frontPath = `cards/${frontFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.storage_path, frontPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(frontPath)
      await supabase.from('contacts').update({ card_img_url: urlData.publicUrl }).eq('id', contact.id)
    }
  }
  if (pending.back_storage_path) {
    const backFile = await generateCardFilename({ name: personName || undefined, side: 'back' })
    const backPath = `cards/${backFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.back_storage_path, backPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(backPath)
      await supabase.from('contacts').update({ card_img_back_url: urlData.publicUrl }).eq('id', contact.id)
    }
  }

  // Write system log
  const confirmedNote = confirmedByName ? `，由 ${confirmedByName} 確認` : ''
  await supabase.from('interaction_logs').insert({
    contact_id: contact.id,
    type: 'system',
    content: `從名片王匯入（${pending.image_filename ?? ''}）${confirmedNote}`,
  })

  // Mark pending as confirmed
  await supabase
    .from('camcard_pending')
    .update({ status: 'confirmed' })
    .eq('id', id)

  return NextResponse.json({ ok: true, contactId: contact.id })
}
