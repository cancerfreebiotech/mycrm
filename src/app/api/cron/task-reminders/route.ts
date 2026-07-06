import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'
import { sendTelegramMessage, type InlineKeyboardMarkup } from '@/lib/telegram'
import { getValidProviderToken } from '@/lib/graph-server'
import { recordCronRun } from '@/lib/cronHeartbeat'
import { escapeLikePattern } from '@/lib/likeEscape'
import { getOrgSetting } from '@/lib/orgSettings'

/**
 * Vercel Cron — daily personal task digest via Telegram (09:00 Asia/Taipei).
 *
 * Per user with a linked telegram_id: overdue tasks + tasks due today
 * (as assignee, or as creator of self-assigned tasks), plus today's Outlook
 * meetings. Users with neither tasks nor meetings today get NO message — the
 * empty digest is silence, so no opt-out needed.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/task-reminders", "schedule": "0 1 * * *" }
 */

const TZ = 'Asia/Taipei'

interface TaskRow {
  id: string
  title: string
  due_at: string | null
  status: string
  created_by: string | null
  contacts: { name: string | null } | null
  task_assignees: { assignee_email: string }[]
}

interface TodayEvent {
  subject: string
  startIso: string
  attendeeEmails: string[]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Read the signed-in user's Outlook calendar within an explicit UTC window.
// Mirrors listUpcomingEvents' Graph call style (graph.ts) but takes a fixed
// day window instead of hoursAhead, so it can cover the whole Taipei day.
async function fetchTodayEvents(
  accessToken: string,
  startIso: string,
  endIso: string
): Promise<TodayEvent[]> {
  const url = 'https://graph.microsoft.com/v1.0/me/calendarView'
    + `?startDateTime=${encodeURIComponent(startIso)}`
    + `&endDateTime=${encodeURIComponent(endIso)}`
    + '&$select=subject,start,attendees'
    + '&$top=100'
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Graph API error: ${res.status}`)
  }
  const data = await res.json()
  const events = (data.value ?? []) as Array<{
    subject?: string
    start?: { dateTime?: string }
    attendees?: Array<{ emailAddress?: { address?: string } }>
  }>
  return events.map((ev) => {
    const dt = ev.start?.dateTime ?? ''
    const startIsoNorm = dt ? new Date(dt.endsWith('Z') ? dt : `${dt}Z`).toISOString() : ''
    const attendeeEmails = (ev.attendees ?? [])
      .map((a) => a.emailAddress?.address)
      .filter((e): e is string => !!e)
    return { subject: ev.subject ?? '', startIso: startIsoNorm, attendeeEmails }
  })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startMs = Date.now()
  const service = createServiceClient()
  // Phase 2+: 逐 org 迭代／由 payload 解析 org
  const ctx = systemOrgContext()
  const db = orgScopedClient(ctx)
  const internalDomain = '@' + (await getOrgSetting(service, 'internal_email_domain', ctx.orgId))

  // "Today" in Taipei, expressed as a UTC window
  const now = new Date()
  const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const endOfDayTaipei = new Date(taipeiNow)
  endOfDayTaipei.setHours(23, 59, 59, 999)
  const endOfDayUtc = new Date(now.getTime() + (endOfDayTaipei.getTime() - taipeiNow.getTime()))
  const startOfDayTaipei = new Date(taipeiNow)
  startOfDayTaipei.setHours(0, 0, 0, 0)
  const startOfDayUtc = new Date(now.getTime() + (startOfDayTaipei.getTime() - taipeiNow.getTime()))

  const { data: users, error: uErr } = await service
    .from('users')
    .select('id, email, telegram_id')
    .not('telegram_id', 'is', null)
  if (uErr) {
    await recordCronRun(service, 'task-reminders', 'error', { error: uErr.message }, Date.now() - startMs)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  const { data: tasks, error: tErr } = await db
    .from('tasks')
    .select('id, title, due_at, status, created_by, contacts(name), task_assignees(assignee_email)')
    .neq('status', 'done')
    .not('due_at', 'is', null)
    .lte('due_at', endOfDayUtc.toISOString())
    .order('due_at', { ascending: true })
    .limit(500)
  if (tErr) {
    await recordCronRun(service, 'task-reminders', 'error', { error: tErr.message }, Date.now() - startMs)
    return NextResponse.json({ error: tErr.message }, { status: 500 })
  }

  let notified = 0
  for (const u of users ?? []) {
    const mine = ((tasks ?? []) as unknown as TaskRow[]).filter((t) => {
      const assignees = t.task_assignees ?? []
      if (assignees.some((a) => a.assignee_email === u.email)) return true
      // Creator of a self-reminder (no other assignees) — same rule as the tasks page
      return t.created_by === u.email && assignees.length === 0
    })

    const overdue = mine.filter((t) => new Date(t.due_at!) < now)
    const dueToday = mine.filter((t) => new Date(t.due_at!) >= now)
    const fmt = (t: TaskRow) => {
      const when = new Date(t.due_at!).toLocaleString('zh-TW', {
        timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      })
      const who = t.contacts?.name ? `（${esc(t.contacts.name)}）` : ''
      return `• ${esc(t.title)}${who} — ${when}`
    }
    const parts: string[] = ['📋 <b>今日任務摘要</b>']
    if (overdue.length > 0) parts.push(`\n🔴 <b>已逾期 ${overdue.length} 件</b>\n${overdue.slice(0, 10).map(fmt).join('\n')}`)
    if (dueToday.length > 0) parts.push(`\n🟡 <b>今日到期 ${dueToday.length} 件</b>\n${dueToday.slice(0, 10).map(fmt).join('\n')}`)

    // Feature B: 今日會議 — Outlook events for the Taipei day, with matched
    // contacts + briefing-ready markers. Wrapped so a calendar/token failure
    // never kills the digest (many users have no Microsoft token → skipped).
    let hasMeetings = false
    try {
      const token = await getValidProviderToken(u.id)
      const events = (await fetchTodayEvents(token, startOfDayUtc.toISOString(), endOfDayUtc.toISOString()))
        .filter((ev) => ev.startIso)
        .sort((a, b) => a.startIso.localeCompare(b.startIso))

      if (events.length > 0) {
        const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
        const meetingLines: string[] = []
        for (const ev of events) {
          const time = new Date(ev.startIso).toLocaleTimeString('zh-TW', {
            timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
          })
          let line = `• ${time} ${esc(ev.subject || '(無主題)')}`

          const externalEmails = [...new Set(
            ev.attendeeEmails
              .map((e) => e.trim().toLowerCase())
              .filter((e) => e && !e.endsWith(internalDomain)),
          )]
          if (externalEmails.length > 0) {
            const orParts: string[] = []
            for (const e of externalEmails) {
              const p = escapeLikePattern(e)
              orParts.push(`email.ilike.${p}`, `second_email.ilike.${p}`)
            }
            const { data: matched } = await db
              .from('contacts')
              .select('id, name')
              .is('deleted_at', null)
              .or(orParts.join(','))
            const contacts = (matched ?? []) as { id: string; name: string | null }[]

            if (contacts.length > 0) {
              const contactIds = contacts.map((c) => c.id)
              // Briefings already prepared for these contacts, for a meeting today
              const { data: briefed } = await db
                .from('contact_briefings')
                .select('contact_id')
                .eq('status', 'done')
                .in('contact_id', contactIds)
                .gte('meeting_at', startOfDayUtc.toISOString())
                .lte('meeting_at', endOfDayUtc.toISOString())
              const briefedSet = new Set((briefed ?? []).map((r) => r.contact_id as string))

              for (const c of contacts) {
                const nm = esc(c.name || '(未命名)')
                const link = appUrl ? `<a href="${appUrl}/contacts/${c.id}">${nm}</a>` : nm
                const ready = briefedSet.has(c.id) ? ' 📋 briefing 已備好' : ''
                line += `\n   ${link}${ready}`
              }
            }
          }
          meetingLines.push(line)
        }
        parts.push(`\n🗓 <b>今日會議</b>\n${meetingLines.join('\n')}`)
        // 段落真的寫進 parts 才算有會議——若上方子查詢中途丟例外被 catch 吞掉，
        // 不能讓無任務使用者收到近乎空白的摘要
        hasMeetings = true
      }
    } catch (e) {
      console.error('[task-reminders] calendar section skipped for', u.email, e instanceof Error ? e.message : e)
    }

    // Send when the user has tasks OR meetings today; skip only when both are
    // empty so the empty digest stays silent (no message at all).
    if (mine.length === 0 && !hasMeetings) continue

    parts.push('\n完成後可用下方按鈕、任務頁或 Teams 卡片處理。')

    // Feature A: inline done/snooze buttons — one row per actionable task,
    // capped at 8 (Telegram callback_data ≤64 bytes; UUID fits). Extras stay
    // text-only. Bot handlers own the trdone_/trsnooze_ prefixes.
    const actionable = [...overdue, ...dueToday].slice(0, 8)
    const replyMarkup: InlineKeyboardMarkup | undefined = actionable.length > 0
      ? {
          inline_keyboard: actionable.map((t) => [
            { text: '✅ 完成', callback_data: `trdone_${t.id}` },
            { text: '⏰ +1天', callback_data: `trsnooze_${t.id}` },
          ]),
        }
      : undefined

    try {
      await sendTelegramMessage(Number(u.telegram_id), parts.join('\n'), replyMarkup)
      notified++
    } catch (e) {
      console.error('[task-reminders] send failed for', u.email, e instanceof Error ? e.message : e)
    }
  }

  await recordCronRun(service, 'task-reminders', 'ok', { users: (users ?? []).length, notified }, Date.now() - startMs)
  return NextResponse.json({ ok: true, notified })
}

export const maxDuration = 120
