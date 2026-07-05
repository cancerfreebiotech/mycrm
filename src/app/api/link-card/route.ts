import { NextRequest, NextResponse } from 'next/server'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// Links an already-stored image to a contact (no re-upload needed)
// Optionally marks the originating failed_scan as reviewed
export async function POST(req: NextRequest) {
  try {
    const { contactId, card_img_url, storage_path, failed_scan_id } = await req.json()
    if (!contactId || !card_img_url) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

    const ctx = await getOrgContext()
    const db = orgScopedClient(ctx)

    const { error: insertErr } = await db.from('contact_cards').insert({
      contact_id: contactId,
      card_img_url,
      storage_path: storage_path ?? null,
      label: '正面',
    })
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    if (failed_scan_id) {
      await db
        .from('failed_scans')
        .update({ reviewed: true, reviewed_at: new Date().toISOString() })
        .eq('id', failed_scan_id)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '失敗' }, { status: 500 })
  }
}
