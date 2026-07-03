import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

interface ClickByUrl {
  url: string
  clicks: number
  uniqueEmails: number
}

interface TimelineBucket {
  hour: string
  opens: number
  clicks: number
}

interface EngagementEvent {
  event: string
  url: string | null
  email: string
  occurred_at: string
}

// Format a UTC ISO timestamp into an Asia/Taipei "MM/DD HH:00" hour bucket label.
function taipeiHourBucket(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  // Intl with hour12:false can emit "24" at midnight in some runtimes — normalize.
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('month')}/${get('day')} ${hour}:00`
}

// GET — aggregated engagement analytics for a single campaign.
// summary → newsletter_recipients (unique openers/clickers)
// clicksByUrl + timeline → newsletter_events (raw event feed, collected since v7.2.9)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // ── Summary from newsletter_recipients (head counts, no rows transferred) ──
  const recipientCount = () =>
    service.from('newsletter_recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', id)

  const [totalR, sentR, failedR, openedR, clickedR] = await Promise.all([
    recipientCount(),
    recipientCount().eq('status', 'sent'),
    recipientCount().eq('status', 'failed'),
    recipientCount().not('opened_at', 'is', null),
    recipientCount().not('clicked_at', 'is', null),
  ])

  const total = totalR.count ?? 0
  const sent = sentR.count ?? 0
  const failed = failedR.count ?? 0
  const opened = openedR.count ?? 0
  const clicked = clickedR.count ?? 0
  const rateDenom = sent || total
  const openRate = rateDenom > 0 ? opened / rateDenom : 0
  const clickRate = rateDenom > 0 ? clicked / rateDenom : 0

  // ── Delivery-issue event counts from newsletter_events (head counts) ──
  const eventCount = () =>
    service.from('newsletter_events').select('*', { count: 'exact', head: true }).eq('campaign_id', id)

  const [bouncesR, unsubscribesR, spamreportsR, anyEventR] = await Promise.all([
    eventCount().eq('event', 'bounce'),
    eventCount().eq('event', 'unsubscribe'),
    eventCount().eq('event', 'spamreport'),
    eventCount(),
  ])

  const hasEventData = (anyEventR.count ?? 0) > 0

  // ── Fetch open/click events for clicksByUrl + timeline (paginated) ──
  const events: EngagementEvent[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data } = await service
      .from('newsletter_events')
      .select('event, url, email, occurred_at')
      .eq('campaign_id', id)
      .in('event', ['open', 'click'])
      .order('occurred_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    events.push(...(data as EngagementEvent[]))
    if (data.length < PAGE) break
  }

  // clicksByUrl — group click events by original url (descending by clicks)
  const urlMap = new Map<string, { clicks: number; emails: Set<string> }>()
  for (const ev of events) {
    if (ev.event !== 'click' || !ev.url) continue
    let entry = urlMap.get(ev.url)
    if (!entry) {
      entry = { clicks: 0, emails: new Set() }
      urlMap.set(ev.url, entry)
    }
    entry.clicks++
    entry.emails.add(ev.email)
  }
  const clicksByUrl: ClickByUrl[] = [...urlMap.entries()]
    .map(([url, v]) => ({ url, clicks: v.clicks, uniqueEmails: v.emails.size }))
    .sort((a, b) => b.clicks - a.clicks)

  // timeline — opens/clicks per Asia/Taipei hour (events fetched chronologically,
  // so Map insertion order is already chronological)
  const timelineMap = new Map<string, { opens: number; clicks: number }>()
  for (const ev of events) {
    const hour = taipeiHourBucket(ev.occurred_at)
    let bucket = timelineMap.get(hour)
    if (!bucket) {
      bucket = { opens: 0, clicks: 0 }
      timelineMap.set(hour, bucket)
    }
    if (ev.event === 'open') bucket.opens++
    else if (ev.event === 'click') bucket.clicks++
  }
  const timeline: TimelineBucket[] = [...timelineMap.entries()].map(([hour, v]) => ({
    hour,
    opens: v.opens,
    clicks: v.clicks,
  }))

  // ── A/B variant breakdown (only when the campaign used subject_b) ──
  const variantCount = (variant: 'a' | 'b') =>
    service.from('newsletter_recipients').select('*', { count: 'exact', head: true })
      .eq('campaign_id', id).eq('variant', variant)
  const [aSentR, aOpenR, bSentR, bOpenR] = await Promise.all([
    variantCount('a').eq('status', 'sent'),
    variantCount('a').not('opened_at', 'is', null),
    variantCount('b').eq('status', 'sent'),
    variantCount('b').not('opened_at', 'is', null),
  ])
  const mkVariant = (variant: 'a' | 'b', vSent: number, vOpened: number) => ({
    variant, sent: vSent, opened: vOpened, openRate: vSent > 0 ? vOpened / vSent : 0,
  })
  const variants = (aSentR.count ?? 0) + (bSentR.count ?? 0) > 0
    ? [mkVariant('a', aSentR.count ?? 0, aOpenR.count ?? 0), mkVariant('b', bSentR.count ?? 0, bOpenR.count ?? 0)]
    : []

  return NextResponse.json({
    summary: { total, sent, failed, opened, clicked, openRate, clickRate },
    variants,
    clicksByUrl,
    timeline,
    events: {
      bounces: bouncesR.count ?? 0,
      unsubscribes: unsubscribesR.count ?? 0,
      spamreports: spamreportsR.count ?? 0,
    },
    hasEventData,
  })
}
