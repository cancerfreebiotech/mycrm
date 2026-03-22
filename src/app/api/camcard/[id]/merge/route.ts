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
  const body = await req.json()
  const { contactId } = body

  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const supabase = createServiceClient()

  // Resolve confirming user — always look up display_name from DB (don't trust client-provided name)
  let confirmedByName: string = ''
  let resolvedUserId: string | null = body.confirmedByUserId ?? null
  if (resolvedUserId) {
    const { data: profile } = await supabase.from('users').select('display_name').eq('id', resolvedUserId).single()
    if (profile) confirmedByName = profile.display_name || ''
  }
  // Fallback: read from session cookie
  if (!resolvedUserId) {
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('display_name').eq('id', user.id).single()
      if (profile) {
        resolvedUserId = user.id
        confirmedByName = profile.display_name || ''
      }
    }
  }

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
  // Merge extra_data (unknown OCR keys)
  const extraData: Record<string, string> = { ...(contact.extra_data ?? {}) }
  for (const [k, v] of Object.entries(ocr)) {
    if (v && !KNOWN_CONTACT_KEYS.has(k) && !OCR_TO_CONTACT[k] && !extraData[k]) extraData[k] = v
  }
  if (Object.keys(extraData).length > 0) updates.extra_data = extraData
  if (pending.back_img_url && !contact.card_img_back_url) updates.card_img_back_url = pending.back_img_url

  if (Object.keys(updates).length > 0) {
    await supabase.from('contacts').update(updates).eq('id', contactId)
  }

  // Move staging images from camcard/ to cards/ with unified naming
  const personName = (contact.name || contact.name_en || ocr.name || ocr.name_en || '').replace(/[\s,./\\]/g, '')
  let finalFrontUrl = pending.card_img_url
  let finalFrontPath = pending.storage_path
  if (pending.storage_path) {
    const frontFile = await generateCardFilename({ name: personName || undefined, side: 'front' })
    const frontPath = `cards/${frontFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.storage_path, frontPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(frontPath)
      finalFrontUrl = urlData.publicUrl
      finalFrontPath = frontPath
    }
  }
  if (pending.back_storage_path) {
    const backFile = await generateCardFilename({ name: personName || undefined, side: 'back' })
    const backPath = `cards/${backFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.back_storage_path, backPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(backPath)
      if (!contact.card_img_back_url) {
        await supabase.from('contacts').update({ card_img_back_url: urlData.publicUrl }).eq('id', contactId)
      }
    }
  }

  // Add card image to contact_cards if available
  if (finalFrontUrl) {
    await supabase.from('contact_cards').insert({
      contact_id: contactId,
      card_img_url: finalFrontUrl,
      storage_path: finalFrontPath,
      label: '名片王匯入',
    })
  }

  // Write system log
  const confirmedNote = confirmedByName ? `，由 ${confirmedByName} 確認` : ''
  await supabase.from('interaction_logs').insert({
    contact_id: contactId,
    type: 'system',
    content: `名片王名片合併（${pending.image_filename ?? ''}）${confirmedNote}`,
  })

  // Mark pending as confirmed
  await supabase
    .from('camcard_pending')
    .update({ status: 'confirmed' })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
