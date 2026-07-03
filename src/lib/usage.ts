import type { SupabaseClient } from '@supabase/supabase-js'

// Asia/Taipei is UTC+8 year-round (no DST), so the calendar month there is stable.
function periodFor(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  return `${y}-${m}`
}

// Current billing period (YYYY-MM) in Asia/Taipei.
export function currentPeriod(): string {
  return periodFor(new Date())
}

// The calendar month before the current one, in Asia/Taipei.
export function previousPeriod(): string {
  const [y, m] = currentPeriod().split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Fire-and-forget usage metering. Increments each metric for the current period
// via the SECURITY DEFINER `increment_usage` RPC. Any failure is logged and
// swallowed — metering must never break the caller's business logic.
export async function recordUsage(
  service: SupabaseClient,
  metrics: Record<string, number>,
): Promise<void> {
  const period = currentPeriod()
  await Promise.all(
    Object.entries(metrics).map(async ([metric, delta]) => {
      if (!delta || delta <= 0) return
      try {
        const { error } = await service.rpc('increment_usage', {
          p_period: period,
          p_metric: metric,
          p_delta: delta,
        })
        if (error) console.error('[recordUsage]', metric, error.message)
      } catch (e) {
        console.error('[recordUsage]', metric, e instanceof Error ? e.message : String(e))
      }
    }),
  )
}
