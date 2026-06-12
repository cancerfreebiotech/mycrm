import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// GET /api/social-briefing/[id] — 輪詢狀態 / 取結果
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()
  const { data, error } = await service
    .from('contact_briefings')
    .select('id, contact_id, status, trigger, result_md, sources, model_used, error_message, created_at, processed_at')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(data)
}
