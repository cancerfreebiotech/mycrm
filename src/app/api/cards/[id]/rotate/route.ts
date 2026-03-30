import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import sharp from 'sharp'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { deg, side = 'front' } = await req.json() as { deg: 90 | 180 | 270; side?: 'front' | 'back' }
  if (![90, 180, 270].includes(deg)) {
    return NextResponse.json({ error: 'invalid_deg' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: card, error: fetchErr } = await supabase
    .from('contact_cards')
    .select('id, card_img_url, card_img_back_url, storage_path')
    .eq('id', id)
    .single()

  if (fetchErr || !card) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const isFront = side === 'front'
  const imgUrl = isFront ? card.card_img_url : card.card_img_back_url
  if (!imgUrl) return NextResponse.json({ error: 'no_image' }, { status: 400 })

  // Derive storage path from public URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/cards/`
  const rawPath = imgUrl.startsWith(publicPrefix)
    ? imgUrl.slice(publicPrefix.length)
    : null
  const storagePath = rawPath ? rawPath.split('?')[0] : null

  if (!storagePath) {
    return NextResponse.json({ error: 'cannot_derive_path' }, { status: 400 })
  }

  // Download from storage
  const { data: fileData, error: dlErr } = await supabase.storage
    .from('cards')
    .download(storagePath)

  if (dlErr || !fileData) {
    return NextResponse.json({ error: 'download_failed' }, { status: 500 })
  }

  // Rotate with sharp
  const buffer = Buffer.from(await fileData.arrayBuffer())
  const rotated = await sharp(buffer).rotate(deg).jpeg({ quality: 90 }).toBuffer()

  // Re-upload (upsert)
  const { error: uploadErr } = await supabase.storage
    .from('cards')
    .upload(storagePath, rotated, { contentType: 'image/jpeg', upsert: true })

  if (uploadErr) {
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
  }

  // Bust CDN cache by appending a new timestamp to the public URL
  const newUrl = `${publicPrefix}${storagePath}?t=${Date.now()}`

  // Update DB field
  const updateField = isFront ? { card_img_url: newUrl } : { card_img_back_url: newUrl }
  await supabase.from('contact_cards').update(updateField).eq('id', id)

  return NextResponse.json({ ok: true, url: newUrl })
}
