import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processPendingBriefings } from '@/lib/social-briefing-worker'

/**
 * Vercel Cron — 每 2 分鐘處理 contact_briefings 佇列（unstick / 補跑沒被背景處理完的）。
 * Auth: Authorization: Bearer {CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  try {
    const result = await processPendingBriefings(supabase)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[briefing-cron] error', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const maxDuration = 300
