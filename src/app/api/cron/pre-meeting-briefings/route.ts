import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'
import { listUpcomingEvents } from '@/lib/graph'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendTelegramMessage } from '@/lib/telegram'
import { recordCronRun } from '@/lib/cronHeartbeat'
import { escapeLikePattern } from '@/lib/likeEscape'

/**
 * Vercel Cron — 會前自動 briefing（每 6 小時）。
 *
 * 對每位已連結 Microsoft 帳號的使用者，讀取未來 24 小時的 Outlook 行事曆，
 * 把與會者（排除 cancerfree.io 內部網域）比對到 CRM 聯絡人，為每位聯絡人排入
 * 一份 pre_meeting briefing（status='pending'）。實際產生由 process-pending-briefings
 * worker 負責，這裡只插入佇列並（若有 telegram_id）回報摘要。
 *
 * 同一場會議（meeting_at）＋同一聯絡人不會重複排入（去重）。
 * Auth: Authorization: Bearer {CRON_SECRET}
 */

const HOURS_AHEAD = 24
const INTERNAL_DOMAIN = '@cancerfree.io'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  // Phase 2+: 逐 org 迭代／由 payload 解析 org
  const ctx = systemOrgContext()
  const db = orgScopedClient(ctx)
  const startMs = Date.now()

  try {
    const { data: users } = await service
      .from('users')
      .select('id, telegram_id')
      .not('provider_refresh_token', 'is', null)

    let usersProcessed = 0
    let usersFailed = 0
    let totalInserted = 0

    for (const user of users ?? []) {
      try {
        const token = await getValidProviderToken(user.id)
        const events = await listUpcomingEvents(token, HOURS_AHEAD)

        const insertedMeetings: { subject: string; count: number }[] = []

        for (const ev of events) {
          if (!ev.startIso) continue

          const externalEmails = [...new Set(
            ev.attendeeEmails
              .map((e) => e.trim().toLowerCase())
              .filter((e) => e && !e.endsWith(INTERNAL_DOMAIN)),
          )]
          if (externalEmails.length === 0) continue

          const orParts: string[] = []
          for (const e of externalEmails) {
            const p = escapeLikePattern(e)
            orParts.push(`email.ilike.${p}`, `second_email.ilike.${p}`)
          }
          const { data: matched } = await db
            .from('contacts')
            .select('id')
            .is('deleted_at', null)
            .or(orParts.join(','))

          const contactIds = [...new Set((matched ?? []).map((r) => r.id as string))]
          if (contactIds.length === 0) continue

          // 去重：同場會議（meeting_at）＋同一聯絡人已有 pre_meeting 列就跳過
          const { data: existing } = await db
            .from('contact_briefings')
            .select('contact_id')
            .eq('trigger', 'pre_meeting')
            .eq('meeting_at', ev.startIso)
            .in('contact_id', contactIds)
          const existingSet = new Set((existing ?? []).map((r) => r.contact_id as string))

          const toInsert = contactIds
            .filter((id) => !existingSet.has(id))
            .map((id) => ({
              contact_id: id,
              status: 'pending',
              trigger: 'pre_meeting',
              meeting_at: ev.startIso,
              // System-initiated: created_by has FK → auth.users(id), and this
              // loop iterates public.users rows (different ids for everyone —
              // see project memory). NULL is the honest system-actor value.
              created_by: null,
              // notify_user_id → public.users(id): this loop already holds it.
              notify_user_id: user.id,
            }))
          if (toInsert.length === 0) continue

          const { error: insErr } = await db.from('contact_briefings').insert(toInsert)
          if (insErr) {
            console.error('[pre-meeting-briefings] insert failed', user.id, insErr.message)
            continue
          }
          totalInserted += toInsert.length
          insertedMeetings.push({ subject: ev.subject, count: toInsert.length })
        }

        const telegramId = user.telegram_id == null ? NaN : Number(user.telegram_id)
        if (Number.isFinite(telegramId) && telegramId !== 0 && insertedMeetings.length > 0) {
          const lines = insertedMeetings.map(
            (m) => `已為會議「<b>${esc(m.subject || '(無主題)')}</b>」排入 ${m.count} 位聯絡人的會前 briefing`,
          )
          await sendTelegramMessage(telegramId, lines.join('\n'))
        }

        usersProcessed++
      } catch (err) {
        usersFailed++
        console.error(
          '[pre-meeting-briefings] user failed',
          user.id,
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    // 第二輪：會後成果提示。會議結束後 48 小時內、briefing 已完成、且尚未提示過的
    // pre_meeting 列，推一則提示請使用者用 /v 記錄成果。每次上限 10 筆，避免逼近 maxDuration。
    // 即使 telegram_id 缺失也標記 outcome_prompted_at，避免同一列被反覆掃描。
    let outcomePrompted = 0
    try {
      const nowIso = new Date().toISOString()
      const windowStartIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data: dueOutcome } = await db
        .from('contact_briefings')
        .select('id, notify_user_id, contacts(name, name_en)')
        .eq('trigger', 'pre_meeting')
        .eq('status', 'done')
        .is('outcome_prompted_at', null)
        .not('notify_user_id', 'is', null)
        .gte('meeting_at', windowStartIso)
        .lte('meeting_at', nowIso)
        .limit(10)

      for (const row of dueOutcome ?? []) {
        try {
          const { data: notifyUser } = await service
            .from('users')
            .select('telegram_id')
            .eq('id', row.notify_user_id as string)
            .maybeSingle()
          const telegramId = notifyUser?.telegram_id == null ? NaN : Number(notifyUser.telegram_id)
          if (Number.isFinite(telegramId) && telegramId !== 0) {
            const rel = (row as { contacts?: { name?: string | null; name_en?: string | null } | { name?: string | null; name_en?: string | null }[] | null }).contacts
            const c = Array.isArray(rel) ? rel[0] : rel
            const rawName = (c?.name || c?.name_en || '').trim()
            const nameEsc = esc(rawName || '（姓名不詳）')
            const text = `🤝 你與 <b>${nameEsc}</b> 的會議應已結束 — 回覆 /v ${nameEsc} 加上重點，一句話記錄成果`
            await sendTelegramMessage(telegramId, text)
          }
          await db
            .from('contact_briefings')
            .update({ outcome_prompted_at: new Date().toISOString() })
            .eq('id', row.id)
          outcomePrompted++
        } catch (err) {
          console.error(
            '[pre-meeting-briefings] outcome prompt failed',
            row.id,
            err instanceof Error ? err.message : String(err),
          )
        }
      }
    } catch (err) {
      console.error(
        '[pre-meeting-briefings] outcome pass failed',
        err instanceof Error ? err.message : String(err),
      )
    }

    const result = { usersProcessed, usersFailed, inserted: totalInserted, outcomePrompted }
    await recordCronRun(service, 'pre-meeting-briefings', 'ok', result, Date.now() - startMs)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pre-meeting-briefings] error', msg)
    await recordCronRun(service, 'pre-meeting-briefings', 'error', { error: msg }, Date.now() - startMs)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const maxDuration = 120
