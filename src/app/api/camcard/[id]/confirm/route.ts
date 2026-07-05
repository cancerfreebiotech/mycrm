import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
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
  met_at: 'met_at',
  met_date: 'met_date',
}

const KNOWN_CONTACT_KEYS = new Set(Object.values(OCR_TO_CONTACT))

// Backdate default for camcard_pending approvals. Approver can override
// per-request via body.backdate (YYYY-MM-DD); when omitted or invalid we
// stamp this. The point is to keep batch-imported old cards from
// clustering at the top of /contacts (which sorts by last_activity_at).
// imported_at still records approve moment for audit.
const HISTORIC_BACKDATE = '2000-01-01T00:00:00.000Z'

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
  const importance: string = ['high', 'medium', 'low'].includes(body.importance) ? body.importance : 'medium'
  const language: string = ['chinese', 'english', 'japanese'].includes(body.language) ? body.language : 'english'

  // Approver can override the backdate. Expect YYYY-MM-DD from a <input type="date">.
  // Anything else (missing, malformed, NaN) falls back to HISTORIC_BACKDATE.
  let backdateIso = HISTORIC_BACKDATE
  if (typeof body.backdate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.backdate)) {
    const parsed = new Date(`${body.backdate}T00:00:00.000Z`)
    if (!Number.isNaN(parsed.getTime())) backdateIso = parsed.toISOString()
  }

  const supabase = createServiceClient()

  // Resolve confirming user via session cookies (most reliable)
  let confirmedByName: string = ''
  let confirmedByUserId: string | null = null
  const authClient = await createClient()
  const { data: { user: authUser } } = await authClient.auth.getUser()
  if (authUser?.email) {
    const { data: profile } = await supabase.from('users').select('id, display_name').eq('email', authUser.email).single()
    if (profile) {
      confirmedByUserId = profile.id
      confirmedByName = profile.display_name || ''
    }
  }

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const { data: pending, error: fetchErr } = await db
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
    created_at: backdateIso,
    last_activity_at: backdateIso,
  }
  if (confirmedByUserId) contactData.created_by = confirmedByUserId
  contactData.importance = importance
  contactData.language = language
  const extraData: Record<string, string> = {}
  for (const [ocrKey, contactKey] of Object.entries(OCR_TO_CONTACT)) {
    if (ocr[ocrKey]) contactData[contactKey] = ocr[ocrKey]
  }
  // Any OCR keys not mapped to a contact column go into extra_data
  for (const [k, v] of Object.entries(ocr)) {
    if (v && !KNOWN_CONTACT_KEYS.has(k) && !OCR_TO_CONTACT[k]) extraData[k] = v
  }
  if (Object.keys(extraData).length > 0) contactData.extra_data = extraData
  // Name / company fallback chain: prefer name → name_en → name_local
  // Japanese/Korean cards often fill only name_local (kanji/hangul)
  if (!contactData.name && contactData.name_en) contactData.name = contactData.name_en
  if (!contactData.name && contactData.name_local) contactData.name = contactData.name_local
  // For chinese-language cards: if name came from name_local (OCR misidentified as Japanese),
  // clear name_local — the name is Chinese, not Japanese
  if (language === 'chinese' && !ocr.name && !ocr.name_en && ocr.name_local) {
    delete contactData.name_local
  }
  if (!contactData.company && contactData.company_en) contactData.company = contactData.company_en
  if (!contactData.company && contactData.company_local) contactData.company = contactData.company_local
  if (pending.card_img_url) contactData.card_img_url = pending.card_img_url
  if (pending.back_img_url) contactData.card_img_back_url = pending.back_img_url

  const { data: contact, error: insertErr } = await db
    .from('contacts')
    .insert(contactData)
    .select('id')
    .single()

  if (insertErr || !contact) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Apply tags
  if (tagIds.length > 0) {
    await db.from('contact_tags').insert(
      tagIds.map((tagId) => ({ contact_id: contact.id, tag_id: tagId }))
    )
  }

  // Move staging images from camcard/ to cards/ with unified naming
  const personName = (ocr.name || ocr.name_en || '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
  if (pending.storage_path) {
    const frontFile = await generateCardFilename({ name: personName || undefined, side: 'front' })
    const frontPath = `cards/${frontFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.storage_path, frontPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(frontPath)
      await db.from('contacts').update({ card_img_url: urlData.publicUrl }).eq('id', contact.id)
    }
  }
  if (pending.back_storage_path) {
    const backFile = await generateCardFilename({ name: personName || undefined, side: 'back' })
    const backPath = `cards/${backFile}`
    const { error: moveErr } = await supabase.storage.from('cards').move(pending.back_storage_path, backPath)
    if (!moveErr) {
      const { data: urlData } = supabase.storage.from('cards').getPublicUrl(backPath)
      await db.from('contacts').update({ card_img_back_url: urlData.publicUrl }).eq('id', contact.id)
    }
  }

  // Write system log
  const confirmedNote = confirmedByName ? `，由 ${confirmedByName} 確認` : ''
  await db.from('interaction_logs').insert({
    contact_id: contact.id,
    type: 'system',
    content: `從名片王匯入（${pending.image_filename ?? ''}）${confirmedNote}`,
  })

  // Mark pending as confirmed
  await db
    .from('camcard_pending')
    .update({ status: 'confirmed' })
    .eq('id', id)

  return NextResponse.json({ ok: true, contactId: contact.id })
}
