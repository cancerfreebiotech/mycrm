import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { contactId, base64, index } = await req.json()
    if (!contactId || !base64) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

    const supabase = createServiceClient()
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    const filename = `cards/${contactId}_${Date.now()}_${index}.jpg`

    const { error: uploadErr } = await supabase.storage.from('cards').upload(filename, blob, { contentType: 'image/jpeg' })
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('cards').getPublicUrl(filename)
    const label = index === 0 ? '正面' : `第 ${index + 1} 張`

    const { error: insertErr } = await supabase.from('contact_cards').insert({
      contact_id: contactId,
      url: urlData.publicUrl,
      storage_path: filename,
      label,
    })
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '上傳失敗' }, { status: 500 })
  }
}
