import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { recordCronRun } from '@/lib/cronHeartbeat'
import { sendCampaign } from '@/lib/newsletter-send-worker'

/**
 * Vercel Cron — dispatch scheduled newsletter campaigns.
 *
 * Phase 1: finds campaigns whose scheduled_at is due (status='scheduled',
 * scheduled_at <= now) and sends each one. Each campaign is claimed atomically
 * by flipping status scheduled → sending guarded on the old status, so
 * overlapping runs never double-dispatch. sendCampaign itself writes the final
 * sent/partial state (and resume-dedup guarantees no recipient is emailed
 * twice even across retries).
 *
 * Phase 2: A/B holdout winner decisions + resumable remainder send. Picks up
 * A/B holdout campaigns (subject_b + ab_test_pct set) still in status
 * sent/partial. If ab_winner is null and the ab_wait_minutes window has elapsed
 * since sent_at, compute per-variant open rates from newsletter_recipients and
 * stamp ab_winner/ab_decided_at (the guarded update is the atomic claim, so the
 * winner is decided exactly once). Then send the remainder with the winning
 * subject (opts.abFinal bypasses the already-sent 409 guard; resume-dedup
 * excludes the cohort). If the winner was already stamped by an earlier run but
 * the remainder send did not finish (sent_at <= ab_decided_at, because the
 * worker only bumps sent_at once its chunk loop completes), the send is retried
 * — resume-dedup guarantees no recipient is emailed twice.
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

  // ── Phase 2: A/B holdout winner decisions ──
  const abResults: { id: string; winner?: 'a' | 'b'; ok?: boolean; sent?: number; total?: number; skipped?: boolean; error?: string }[] = []

  // Deliberately NOT filtered on ab_winner IS NULL: a campaign whose winner was
  // stamped but whose remainder send timed out mid-loop must be retried, so the
  // pickup covers every not-yet-fully-sent A/B holdout campaign and completion is
  // decided in JS (PostgREST can't compare sent_at against ab_decided_at).
  const { data: pending } = await service
    .from('newsletter_campaigns')
    .select('id, sent_at, ab_wait_minutes, ab_winner, ab_decided_at')
    .not('subject_b', 'is', null)
    .not('ab_test_pct', 'is', null)
    .not('sent_at', 'is', null)
    .in('status', ['sent', 'partial'])

  for (const c of (pending ?? []) as { id: string; sent_at: string; ab_wait_minutes: number | null; ab_winner: 'a' | 'b' | null; ab_decided_at: string | null }[]) {
    let winner: 'a' | 'b'

    if (c.ab_winner) {
      // Winner already decided by an earlier run. Retry the remainder send only if
      // it hasn't completed: the worker bumps sent_at past ab_decided_at once its
      // final chunk loop finishes, so sent_at <= ab_decided_at means the send was
      // interrupted (a mid-loop timeout never reaches the worker's state update).
      // resume-dedup skips anyone already emailed, so retrying never double-sends.
      const finalPending = c.ab_decided_at != null && new Date(c.sent_at).getTime() <= new Date(c.ab_decided_at).getTime()
      if (!finalPending) continue
      winner = c.ab_winner
    } else {
      // ab_wait_minutes is per-campaign, so the elapsed check happens in JS.
      const waitMs = (c.ab_wait_minutes ?? 120) * 60 * 1000
      if (new Date(c.sent_at).getTime() + waitMs > Date.now()) continue

      // Per-variant open rates from newsletter_recipients (head counts only).
      const variantCount = (variant: 'a' | 'b') =>
        service.from('newsletter_recipients').select('*', { count: 'exact', head: true })
          .eq('campaign_id', c.id).eq('variant', variant)
      const [aSentR, aOpenR, bSentR, bOpenR] = await Promise.all([
        variantCount('a').eq('status', 'sent'),
        variantCount('a').not('opened_at', 'is', null),
        variantCount('b').eq('status', 'sent'),
        variantCount('b').not('opened_at', 'is', null),
      ])
      const rateA = (aSentR.count ?? 0) > 0 ? (aOpenR.count ?? 0) / (aSentR.count ?? 0) : 0
      const rateB = (bSentR.count ?? 0) > 0 ? (bOpenR.count ?? 0) / (bSentR.count ?? 0) : 0
      winner = rateB > rateA ? 'b' : 'a'

      // Atomic claim: stamp the winner guarded on ab_winner still being null so
      // overlapping runs never decide twice. ab_decided_at is the fence the
      // completion check above compares sent_at against.
      const { data: claimed } = await service
        .from('newsletter_campaigns')
        .update({ ab_winner: winner, ab_decided_at: new Date().toISOString() })
        .eq('id', c.id)
        .is('ab_winner', null)
        .select('id')
        .maybeSingle()
      if (!claimed) {
        abResults.push({ id: c.id, skipped: true })
        continue
      }
    }

    try {
      const r = await sendCampaign(service, c.id, { abFinal: true, actorUserId: null })
      abResults.push({ id: c.id, winner, ok: r.ok, sent: r.sent, total: r.total })
    } catch (e) {
      // A campaign only reaches phase 2 after its cohort send passed every pre-send
      // check, so the sole reachable SendCampaignError here is "no valid recipients
      // after filters" — the cohort already covered everyone and nothing is left.
      // Bump sent_at past ab_decided_at so the completion check treats this as done
      // and the pickup above stops re-selecting it every run (no infinite retry).
      await service
        .from('newsletter_campaigns')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', c.id)
      abResults.push({ id: c.id, winner, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await recordCronRun(service, 'process-scheduled-campaigns', 'ok', { processed: results.length, abDecided: abResults.length }, Date.now() - startMs)
  return NextResponse.json({ ok: true, processed: results.length, results, abResults })
}

export const maxDuration = 300
