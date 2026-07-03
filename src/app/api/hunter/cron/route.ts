import { NextRequest, NextResponse } from 'next/server'
import { runHunterBatch } from '@/lib/hunter'
import { createServiceClient } from '@/lib/supabase'
import { recordCronRun } from '@/lib/cronHeartbeat'

/**
 * Vercel Cron Job — Daily Hunter.io email enrichment for backlog contacts
 * Schedule: 02:00 Asia/Taipei (= 18:00 UTC prev day)
 * vercel.json: { "path": "/api/hunter/cron", "schedule": "0 18 * * *" }
 *
 * Auth: Vercel automatically sends Authorization: Bearer {CRON_SECRET}
 * Set CRON_SECRET in Vercel environment variables.
 *
 * Caps: 50 contacts per run to stay within Vercel hobby 10s timeout and
 * Hunter per-minute rate limit (sequential fetches). Backfill of 800 old
 * contacts clears over ~16 days. Found-email credits decrement monthly
 * allowance; not-found lookups are free (per Hunter Free tier policy).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const startMs = Date.now()
  try {
    const result = await runHunterBatch({
      maxContacts: 50,
      cooldownDays: 30,
      remainingBuffer: 5,
    })
    await recordCronRun(service, 'hunter-cron', 'ok', result, Date.now() - startMs)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await recordCronRun(service, 'hunter-cron', 'error', { error: msg }, Date.now() - startMs)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
