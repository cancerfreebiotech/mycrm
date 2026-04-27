import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processPendingBatchAcrossUsers } from '@/lib/pending-ocr-worker'

/**
 * Vercel Cron — every 2 minutes, rescue any pending_contacts rows that the
 * webhook's waitUntil() didn't finish (function crash, deploy mid-OCR, etc).
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 *
 * vercel.json: { "path": "/api/cron/process-pending-ocr", "schedule": "*/2 * * * *" }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const result = await processPendingBatchAcrossUsers(supabase)
  console.log('[pending-ocr-cron]', result)
  return NextResponse.json({ ok: true, ...result })
}

export const maxDuration = 300
