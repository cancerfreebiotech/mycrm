import { NextRequest, NextResponse } from 'next/server'
import { runHunterBatch } from '@/lib/hunter'

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

  const result = await runHunterBatch({
    maxContacts: 50,
    cooldownDays: 30,
    remainingBuffer: 5,
  })

  console.log('[hunter-cron]', {
    total: result.total,
    found: result.found,
    skipped: result.skipped,
    skipReason: result.skipReason,
    creditsLeft: result.creditsLeft,
  })

  return NextResponse.json(result)
}
