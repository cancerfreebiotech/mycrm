import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { sendCampaign, SendCampaignError } from '@/lib/newsletter-send-worker'

// POST — send this campaign via SendGrid to everyone in its list_ids.
// The send logic lives in @/lib/newsletter-send-worker (shared with the
// scheduled-send cron). This route only handles auth + request/response glue.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('id').ilike('email', authUser.email).maybeSingle()
  const actorUserId = me?.id ?? null

  // Optional: allow overrides in body (testOnly flag to send only to self)
  const body = (await req.json().catch(() => ({}))) as { testOnly?: boolean; testEmail?: string; resend?: boolean }

  try {
    const result = await sendCampaign(service, campaignId, {
      testOnly: body.testOnly,
      testEmail: body.testEmail,
      resend: body.resend,
      actorUserId,
    })
    return NextResponse.json({ ...result, testOnly: !!body.testOnly })
  } catch (e) {
    if (e instanceof SendCampaignError) return NextResponse.json(e.payload, { status: e.status })
    throw e
  }
}

// Large lists (2000+ recipients) + per-chunk SendGrid calls + log inserts can
// run well past the default. Allow up to 5 minutes (Vercel Pro/Enterprise).
export const maxDuration = 300
