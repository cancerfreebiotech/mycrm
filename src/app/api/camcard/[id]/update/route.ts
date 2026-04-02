import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { ocr_data } = body

  if (!ocr_data || typeof ocr_data !== 'object') {
    return NextResponse.json({ error: 'ocr_data required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('camcard_pending')
    .update({ ocr_data })
    .eq('id', id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
