import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { recordCronRun } from '@/lib/cronHeartbeat'
import { sendCampaign } from '@/lib/newsletter-send-worker'

/**
 * Vercel Cron — dispatch scheduled newsletter campaigns.
 *
 * Finds campaigns whose scheduled_at is due (status='scheduled', scheduled_at
 * <= now) and sends each one. Each campaign is claimed atomically by flipping
 * status scheduled → sending guarded on the old status, so overlapping runs
 * never double-dispatch. sendCampaign itself writes the final sent/partial
 * state (and resume-dedup guarantees no recipient is emailed twice even across
 * retries).
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/process-scheduled-campaigns", "schedule": "*\/10 * * * *" }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startMs = Date.now()
  const service = createServiceClient()

  const nowIso = new Date().toISOString()
  const { data: due, error } = await service
    .from('newsletter_campaigns')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })

  if (error) {
    await recordCronRun(service, 'process-scheduled-campaigns', 'error', { error: error.message }, Date.now() - startMs)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; ok?: boolean; sent?: number; total?: number; skipped?: boolean; error?: string }[] = []

  for (const c of due ?? []) {
    // Atomic claim: flip scheduled → sending. If a concurrent run already
    // claimed it, the guarded update matches no row and we skip.
    const { data: claimed } = await service
      .from('newsletter_campaigns')
      .update({ status: 'sending' })
      .eq('id', c.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()
    if (!claimed) {
      results.push({ id: c.id, skipped: true })
      continue
    }

    try {
      const r = await sendCampaign(service, c.id, { resend: false, actorUserId: null })
      results.push({ id: c.id, ok: r.ok, sent: r.sent, total: r.total })
    } catch (e) {
      // sendCampaign throws only for pre-send validation/config failures (nothing
      // emailed) — revert the claim so the campaign stays scheduled for the next
      // run / admin inspection. The status guard means an already-finished send
      // (now 'sent'/'partial') is never reverted, and resume-dedup prevents any
      // double-send if some chunks did go out before an unexpected throw.
      await service
        .from('newsletter_campaigns')
        .update({ status: 'scheduled' })
        .eq('id', c.id)
        .eq('status', 'sending')
      results.push({ id: c.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await recordCronRun(service, 'process-scheduled-campaigns', 'ok', { processed: results.length }, Date.now() - startMs)
  return NextResponse.json({ ok: true, processed: results.length, results })
}

export const maxDuration = 300
