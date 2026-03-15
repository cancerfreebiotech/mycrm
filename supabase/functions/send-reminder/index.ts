/**
 * Supabase Edge Function: send-reminder
 *
 * Called by pg_cron every minute to scan for overdue tasks and send Telegram + Teams notifications.
 *
 * pg_cron setup (run once in Supabase SQL editor):
 *   SELECT cron.schedule('send-reminder', '* * * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project>.supabase.co/functions/v1/send-reminder',
 *       headers := '{"Authorization": "Bearer <anon_key>", "Content-Type": "application/json"}',
 *       body := '{}'
 *     )$$
 *   );
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

serve(async (req) => {
  // Verify caller — accept only requests with the anon key or a dedicated cron secret
  const expectedKey = Deno.env.get('CRON_SECRET') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (expectedKey) {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (token !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    const now = new Date().toISOString()

    // Find pending tasks that are due within the next 1 minute (due_at <= now + 1m)
    // and haven't been notified yet (we use a simple approach: due_at is in the past, status pending)
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()

    const { data: dueTasks } = await supabase
      .from('tasks')
      .select(`
        id, title, due_at, created_by,
        task_assignees(assignee_email, users(telegram_id, display_name))
      `)
      .eq('status', 'pending')
      .lte('due_at', now)
      .gte('due_at', oneMinuteAgo)  // only tasks whose due_at just passed (within last minute)

    if (!dueTasks || dueTasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let notified = 0
    for (const task of dueTasks) {
      const assignees = task.task_assignees as Array<{
        assignee_email: string
        users: { telegram_id: number | null; display_name: string | null } | null
      }>

      const dueStr = new Date(task.due_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })

      for (const a of assignees) {
        const tgId = a.users?.telegram_id
        if (!tgId) continue

        await sendTelegram(tgId,
          `⏰ <b>任務提醒</b>\n\n📌 ${task.title}\n截止時間：${dueStr}\n\n` +
          `前往任務管理：${APP_URL}/tasks`
        )
        notified++
      }

      // Also notify creator if not already in assignees
      const assigneeEmails = assignees.map(a => a.assignee_email)
      if (!assigneeEmails.includes(task.created_by)) {
        const { data: creator } = await supabase
          .from('users')
          .select('telegram_id')
          .eq('email', task.created_by)
          .single()

        if (creator?.telegram_id) {
          await sendTelegram(creator.telegram_id,
            `⏰ <b>你建立的任務已到期</b>\n\n📌 ${task.title}\n截止時間：${dueStr}`
          )
          notified++
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, notified }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-reminder error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
