import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendTelegramMessage } from '@/lib/telegram'
import { recordCronRun } from '@/lib/cronHeartbeat'

/**
 * Vercel Cron — weekly stale-relationship nudge via Telegram (Mon 02:00 UTC).
 *
 * Per user with a linked telegram_id: their own contacts (created_by = user.id)
 * whose last interaction is going stale — high-importance after 30d, everyone
 * else after 90d — excluding any contact that already has an OPEN (pending)
 * task, since someone is already on it. Worst 8 by staleness. Users with
 * nothing stale get NO message — the empty digest is silence.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/stale-contacts", "schedule": "0 2 * * 1" }
 */

const DAY_MS = 86_400_000
const HIGH_STALE_DAYS = 30
const DEFAULT_STALE_DAYS = 90
const MAX_PER_DIGEST = 8

interface ContactRow {
  id: string
  name: string | null
  company: string | null
  importance: string | null
  last_activity_at: string | null
  created_at: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startMs = Date.now()
  const service = createServiceClient()
  const now = Date.now()
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  const { data: users, error: uErr } = await service
    .from('users')
    .select('id, email, telegram_id')
    .not('telegram_id', 'is', null)
  if (uErr) {
    await recordCronRun(service, 'stale-contacts', 'error', { error: uErr.message }, Date.now() - startMs)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  // Broadest possible stale cutoff = the tightest threshold (high = 30d).
  // Anything touched more recently than that can never be stale, so drop it in
  // SQL; nulls fall through to the created_at fallback computed below.
  const broadCutoffIso = new Date(now - HIGH_STALE_DAYS * DAY_MS).toISOString()

  let notified = 0
  try {
    for (const u of users ?? []) {
      const { data: contacts, error: cErr } = await service
        .from('contacts')
        .select('id, name, company, importance, last_activity_at, created_at')
        .eq('created_by', u.id)
        .is('deleted_at', null)
        .or(`last_activity_at.is.null,last_activity_at.lt.${broadCutoffIso}`)
      if (cErr) throw new Error(cErr.message)

      // Fallback to created_at when a contact has no recorded activity, then
      // apply the per-importance threshold.
      const stale = ((contacts ?? []) as ContactRow[])
        .map((c) => {
          const ref = new Date(c.last_activity_at ?? c.created_at).getTime()
          const ageDays = (now - ref) / DAY_MS
          const threshold = c.importance === 'high' ? HIGH_STALE_DAYS : DEFAULT_STALE_DAYS
          return { c, ageDays, threshold }
        })
        .filter((x) => x.ageDays > x.threshold)

      if (stale.length === 0) continue

      // Exclude contacts that already have an open (pending) task.
      const staleIds = stale.map((x) => x.c.id)
      const { data: openTasks, error: tErr } = await service
        .from('tasks')
        .select('contact_id')
        .eq('status', 'pending')
        .in('contact_id', staleIds)
      if (tErr) throw new Error(tErr.message)
      const covered = new Set((openTasks ?? []).map((t) => t.contact_id))

      const worst = stale
        .filter((x) => !covered.has(x.c.id))
        .sort((a, b) => b.ageDays - a.ageDays)
        .slice(0, MAX_PER_DIGEST)

      if (worst.length === 0) continue

      const lines = worst.map(({ c, ageDays }) => {
        const name = esc(c.name ?? '—')
        const label = c.company ? `${name}（${esc(c.company)}）` : name
        const days = Math.floor(ageDays)
        const link = appUrl ? `\n  ${appUrl}/contacts/${c.id}` : ''
        return `• ${label} — ${days} 天未互動${link}`
      })
      const text = [
        '🌿 <b>該聯繫了</b>',
        '',
        lines.join('\n'),
        '',
        '<i>回覆 /v &lt;名字&gt; &lt;重點&gt; 可一句話記錄互動</i>',
      ].join('\n')

      try {
        await sendTelegramMessage(Number(u.telegram_id), text)
        notified++
      } catch (e) {
        console.error('[stale-contacts] send failed for', u.email, e instanceof Error ? e.message : e)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordCronRun(service, 'stale-contacts', 'error', { error: msg, notified }, Date.now() - startMs)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  await recordCronRun(service, 'stale-contacts', 'ok', { users: (users ?? []).length, notified }, Date.now() - startMs)
  return NextResponse.json({ ok: true, notified })
}

export const maxDuration = 120
