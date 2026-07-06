import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { generateCardFilename } from '@/lib/cardFilename'
import { mergeIntoContact, type MergeMode } from '@/lib/merge-into-contact'

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
 * Body: { contactId: string, mode?: 'fill' | 'replace' }
 *
 * Merges camcard_pending OCR data into an existing contact via mergeIntoContact helper.
 * Mode 'fill' (default): only empty fields filled, conflicts written to log unchanged.
 * Mode 'replace': non-empty conflicts overwritten with new values, old archived to log.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { contactId } = body
  const mode: MergeMode = body.mode === 'replace' ? 'replace' : 'fill'

  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const supabase = createServiceClient()

  let confirmedByName = ''
  let resolvedUserId: string | null = null
  const authClient = await createClient()
  const { data: { user: authUser } } = await authClient.auth.getUser()
  if (authUser?.email) {
    const { data: profile } = await supabase.from('users').select('id, display_name').eq('email', authUser.email).single()
    if (profile) {
      resolvedUserId = profile.id
      confirmedByName = profile.display_name || ''
    }
  }

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const [{ data: pending }, { data: contact }] = await Promise.all([
    db.from('camcard_pending').select('*').eq('id', id).single(),
    db.from('contacts').select('id, name, name_en, extra_data, card_img_back_url').eq('id', contactId).single(),
  ])

  if (!pending) return NextResponse.json({ error: 'Pending not found' }, { status: 404 })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const ocr = (pending.ocr_data ?? {}) as Record<string, string | null>

  // Move staging images from camcard/ to cards/ with unified naming
  const personName = (contact.name || contact.name_en || ocr.name || ocr.name_en || '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
  let finalFrontUrl: string | null = pending.card_img_url
  let finalFrontPath: string | null = pending.storage_path
  if (pending.storage_path) {
    const frontFile = await generateCardFilename({ name: personName || undefined, side: 'front' })
    const frontPath = `${ctx.orgId}/cards/${frontFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.storage_path, frontPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(frontPath)
      finalFrontUrl = urlData.publicUrl
      finalFrontPath = frontPath
    }
  }

  let finalBackUrl: string | null = pending.back_img_url ?? null
  if (pending.back_storage_path) {
    const backFile = await generateCardFilename({ name: personName || undefined, side: 'back' })
    const backPath = `${ctx.orgId}/cards/${backFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.back_storage_path, backPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(backPath)
      finalBackUrl = urlData.publicUrl
      if (!contact.card_img_back_url) {
        await db.from('contacts').update({ card_img_back_url: urlData.publicUrl }).eq('id', contactId)
      }
    }
  }

  // Build newData from OCR (camcard schema → contact column names)
  const newData: Record<string, unknown> = {}
  for (const [ocrKey, contactKey] of Object.entries(OCR_TO_CONTACT)) {
    if (ocr[ocrKey]) newData[contactKey] = ocr[ocrKey]
  }
  // Carry unknown OCR keys into extra_data (pre-merge so helper doesn't lose them)
  const extraData: Record<string, string> = { ...((contact as { extra_data?: Record<string, string> }).extra_data ?? {}) }
  for (const [k, v] of Object.entries(ocr)) {
    if (v && !KNOWN_CONTACT_KEYS.has(k) && !OCR_TO_CONTACT[k] && !extraData[k]) extraData[k] = v
  }
  if (Object.keys(extraData).length > 0) {
    await db.from('contacts').update({ extra_data: extraData }).eq('id', contactId)
  }

  const confirmedNote = confirmedByName ? `，由 ${confirmedByName} 確認` : ''
  const logPrefix = mode === 'replace'
    ? `名片王名片更新（${pending.image_filename ?? ''}）${confirmedNote}`
    : `名片王名片合併（${pending.image_filename ?? ''}）${confirmedNote}`

  const result = await mergeIntoContact(supabase, {
    targetId: contactId,
    newData,
    cardImgUrl: finalFrontUrl,
    cardImgBackUrl: finalBackUrl,
    storagePath: finalFrontPath,
    cardLabel: '名片王匯入',
    mode,
    userId: resolvedUserId,
    logPrefix,
  })

  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Merge failed' }, { status: 500 })

  await db.from('camcard_pending').update({ status: 'confirmed' }).eq('id', id)

  return NextResponse.json({
    ok: true,
    contact_id: result.contact_id,
    filled: result.filled,
    replaced: result.replaced,
    conflicts: result.conflicts,
  })
}
