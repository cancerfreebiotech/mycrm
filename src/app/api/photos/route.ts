import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  let query = service
    .from('contact_photos')
    .select('id, photo_url, storage_path, note, taken_at, location_name, latitude, longitude, created_at, contact_id, contacts(id, name, name_en)')
    .order('taken_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or(
      `note.ilike.%${q}%,location_name.ilike.%${q}%,contacts.name.ilike.%${q}%,contacts.name_en.ilike.%${q}%`
    )
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate signed URLs (1 hour)
  const photos = await Promise.all(
    (data ?? []).map(async (p) => {
      let signedUrl = p.photo_url
      if (p.storage_path) {
        const { data: signed } = await service.storage
          .from('cards')
          .createSignedUrl(p.storage_path, 3600)
        if (signed?.signedUrl) signedUrl = signed.signedUrl
      }
      const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts
      return {
        id: p.id,
        photo_url: signedUrl,
        note: p.note,
        taken_at: p.taken_at,
        location_name: p.location_name,
        latitude: p.latitude,
        longitude: p.longitude,
        created_at: p.created_at,
        contact_id: p.contact_id,
        contact_name: contact?.name || contact?.name_en || null,
      }
    })
  )

  return NextResponse.json({ photos, total: photos.length })
}
