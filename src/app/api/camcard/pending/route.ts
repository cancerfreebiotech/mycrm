import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('camcard_pending')
    .select('id, image_filename, card_img_url, back_img_url, ocr_data, status, duplicate_contact_id, match_type, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch duplicate contacts separately if needed
  const dupIds = [...new Set((data ?? []).map((r) => r.duplicate_contact_id).filter(Boolean))]
  let dupMap: Record<string, { id: string; name: string | null; name_en: string | null; company: string | null; email: string | null }> = {}
  if (dupIds.length > 0) {
    const { data: dups } = await supabase
      .from('contacts')
      .select('id, name, name_en, company, email')
      .in('id', dupIds as string[])
    for (const d of dups ?? []) dupMap[d.id] = d
  }

  const result = (data ?? []).map((r) => ({
    ...r,
    duplicate_contact: r.duplicate_contact_id ? (dupMap[r.duplicate_contact_id] ?? null) : null,
  }))

  return NextResponse.json(result)
}
