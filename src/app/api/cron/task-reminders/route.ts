import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendTelegramMessage } from '@/lib/telegram'
import { recordCronRun } from '@/lib/cronHeartbeat'

/**
 * Vercel Cron — daily personal task digest via Telegram (09:00 Asia/Taipei).
 *
 * Per user with a linked telegram_id: overdue tasks + tasks due today
 * (as assignee, or as creator of self-assigned tasks). Users with nothing
 * due get NO message — the empty digest is silence, so no opt-out needed.
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

  // End of "today" in Taipei, expressed in UTC
  const now = new Date()
  const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const endOfDayTaipei = new Date(taipeiNow)
  endOfDayTaipei.setHours(23, 59, 59, 999)
  const endOfDayUtc = new Date(now.getTime() + (endOfDayTaipei.getTime() - taipeiNow.getTime()))

  const { data: users, error: uErr } = await service
    .from('users')
    .select('id, email, telegram_id')
    .not('telegram_id', 'is', null)
  if (uErr) {
    await recordCronRun(service, 'task-reminders', 'error', { error: uErr.message }, Date.now() - startMs)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  const { data: tasks, error: tErr } = await service
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
    if (mine.length === 0) continue

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
    parts.push('\n完成後可在任務頁或 Teams 卡片上勾選。')

    try {
      await sendTelegramMessage(Number(u.telegram_id), parts.join('\n'))
      notified++
    } catch (e) {
      console.error('[task-reminders] send failed for', u.email, e instanceof Error ? e.message : e)
    }
  }

  await recordCronRun(service, 'task-reminders', 'ok', { users: (users ?? []).length, notified }, Date.now() - startMs)
  return NextResponse.json({ ok: true, notified })
}

export const maxDuration = 120
