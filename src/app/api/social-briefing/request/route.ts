import { NextRequest, NextResponse, after } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { processPendingBriefings } from '@/lib/social-briefing-worker'

export const maxDuration = 300

// POST /api/social-briefing/request — 排程一份 briefing
// body: { contact_id: string, trigger?: 'manual'|'nl_command'|'pre_meeting', meeting_at?: string }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const contactId = body?.contact_id
  if (!contactId) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 })

  const trigger = ['manual', 'nl_command', 'pre_meeting'].includes(body?.trigger) ? body.trigger : 'manual'
  const meetingAt = body?.meeting_at ?? null

  const service = createServiceClient()
  const { data, error } = await service
    .from('contact_briefings')
    .insert({ contact_id: contactId, trigger, meeting_at: meetingAt, created_by: user.id })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 背景立即處理（cron 為後援，避免等到下一次排程）
  after(async () => {
    try {
      await processPendingBriefings(service)
    } catch (e) {
      console.error('[social-briefing] background process failed', e instanceof Error ? e.message : e)
    }
  })

  return NextResponse.json({ id: data.id, status: 'pending' })
}
