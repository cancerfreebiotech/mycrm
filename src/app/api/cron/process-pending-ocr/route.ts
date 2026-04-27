import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processPendingBatchAcrossUsers } from '@/lib/pending-ocr-worker'

/**
 * Vercel Cron — every 2 minutes, rescue any pending_contacts rows that the
 * webhook's waitUntil() didn't finish (function crash, deploy mid-OCR, etc).
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 *
 * vercel.json: { "path": "/api/cron/process-pending-ocr", "schedule": "every 2 min" }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[pending-ocr-cron] unauthorized', { hasSecret: !!cronSecret, hasHeader: !!authHeader })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[pending-ocr-cron] start')
  const supabase = createServiceClient()
  try {
    const result = await processPendingBatchAcrossUsers(supabase)
    console.log('[pending-ocr-cron] done', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pending-ocr-cron] error', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const maxDuration = 300
