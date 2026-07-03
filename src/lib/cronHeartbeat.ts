import type { createServiceClient } from '@/lib/supabase'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Expected run interval (minutes) per cron job. The watchdog flags a job as
 * overdue when its latest run is older than 3× this interval, and the admin
 * cron-health view surfaces it per job.
 */
export const CRON_EXPECTED_INTERVAL_MIN: Record<string, number> = {
  'process-pending-ocr': 2,
  'process-pending-briefings': 2,
  'check-feedback': 1440,
  'run-report-schedules': 60,
  'purge-retention': 1440,
  'hunter-cron': 1440,
  'import-suppressions': 1440,
  'health-watchdog': 10,
}

/**
 * Insert one heartbeat row into cron_runs. A heartbeat failure must never kill
 * the cron body, so any error is logged with console.error and swallowed.
 */
export async function recordCronRun(
  service: ServiceClient,
  job: string,
  status: 'ok' | 'error',
  detail?: unknown,
  durationMs?: number,
): Promise<void> {
  try {
    const { error } = await service.from('cron_runs').insert({
      job,
      status,
      detail: detail ?? null,
      duration_ms: durationMs ?? null,
    })
    if (error) console.error('[cronHeartbeat] insert failed', job, error.message)
  } catch (e) {
    console.error('[cronHeartbeat] insert threw', job, e instanceof Error ? e.message : String(e))
  }
}

export interface LatestCronRun {
  status: 'ok' | 'error' | null
  finished_at: string | null
  duration_ms: number | null
}

/**
 * Latest cron_runs row for every job in CRON_EXPECTED_INTERVAL_MIN. Jobs that
 * have never run map to null fields.
 */
export async function getLatestRunsPerJob(
  service: ServiceClient,
): Promise<Record<string, LatestCronRun>> {
  const jobs = Object.keys(CRON_EXPECTED_INTERVAL_MIN)
  const entries = await Promise.all(
    jobs.map(async (job): Promise<readonly [string, LatestCronRun]> => {
      const { data } = await service
        .from('cron_runs')
        .select('status, finished_at, duration_ms')
        .eq('job', job)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return [
        job,
        {
          status: (data?.status ?? null) as 'ok' | 'error' | null,
          finished_at: data?.finished_at ?? null,
          duration_ms: data?.duration_ms ?? null,
        },
      ]
    }),
  )
  return Object.fromEntries(entries)
}
