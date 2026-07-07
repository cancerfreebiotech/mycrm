import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { getOrgSetting } from '@/lib/orgSettings'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n/config'

/**
 * POST /api/feedback-status — 管理端更新回饋狀態。
 *
 * 「done」刻意不在可設定範圍：完成必須由回報者本人在 /feedback 按「確認完成」
 * （RLS `feedback_confirm_own` 只允許回報者把自己的 resolved → done）。
 * 設為 resolved 時自動寄信通知回報者（依其介面語言）；寄信失敗不影響狀態更新。
 */

const ADMIN_SETTABLE = ['open', 'in_progress', 'resolved', 'wont_fix'] as const

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'
const TZ = 'Asia/Taipei'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

interface Creator {
  email: string | null
  display_name: string | null
  locale: string | null
}

interface UpdatedFeedback {
  id: string
  title: string | null
  created_at: string
  creator: Creator | Creator[] | null
}

async function notifyReporter(
  service: ReturnType<typeof createServiceClient>,
  orgId: string,
  fb: UpdatedFeedback
): Promise<boolean> {
  const creator = Array.isArray(fb.creator) ? fb.creator[0] : fb.creator
  const to = creator?.email
  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!to || !sgKey || !fromEmail) return false

  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(creator?.locale ?? '')
    ? (creator!.locale as string)
    : DEFAULT_LOCALE
  const m = (await import(`../../../messages/${locale}.json`)).default.feedbackEmail as Record<string, string>

  const fromName = await getOrgSetting(service, 'sender_name', orgId)
  const replyTo = await getOrgSetting(service, 'feedback_recipient', orgId)
  const appUrl = process.env.NEXTAUTH_URL ?? (await getOrgSetting(service, 'app_url', orgId))

  const vars = {
    title: fb.title ?? '',
    name: creator?.display_name ?? to,
    date: new Date(fb.created_at).toLocaleDateString(locale, { timeZone: TZ }),
  }
  const html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#222;max-width:640px;">
    <p>${esc(fill(m.greeting, vars))}</p>
    <p>${esc(fill(m.body, vars))}</p>
    <p style="margin:1.4em 0;"><a href="${appUrl}/feedback" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;">${esc(m.cta)}</a></p>
    <p style="color:#888;font-size:12px;">${esc(m.footer)}</p>
  </div>`

  const res = await fetch(SG_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      reply_to: { email: replyTo },
      subject: fill(m.subject, vars),
      content: [{ type: 'text/html', value: html }],
      personalizations: [{ to: [{ email: to }] }],
    }),
  })
  return res.status === 202
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('id, role')
    .eq('email', user.email)
    .single()
  if (me?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const status = body.status as (typeof ADMIN_SETTABLE)[number]
  if (!id || !ADMIN_SETTABLE.includes(status)) {
    return NextResponse.json({ error: 'Invalid id or status' }, { status: 400 })
  }

  const ctx = await getOrgContext({ email: user.email, userId: me.id })
  const db = orgScopedClient(ctx)
  const { data: updated, error } = await db
    .from('feedback')
    .update({ status })
    .eq('id', id)
    .select('id, title, created_at, creator:created_by(email, display_name, locale)')
    .single()
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  }

  let notified = false
  if (status === 'resolved') {
    notified = await notifyReporter(service, ctx.orgId, updated as unknown as UpdatedFeedback).catch(() => false)
  }
  return NextResponse.json({ ok: true, notified })
}
