import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { recordCronRun } from '@/lib/cronHeartbeat'
import { getOrgSetting } from '@/lib/orgSettings'

/**
 * Vercel Cron — daily system-feedback check.
 *
 * Queries the feedback form for rows created in the last 24h and emails a summary
 * to the owner (no new issues → a short "all clear" note; new issues → a list +
 * a best-effort Gemini triage). This is the durable 24/7 replacement for the
 * Claude Code session schedule, which auto-expires after 7 days.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/check-feedback", "schedule": "0 18 * * *" }
 */

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'
const TZ = 'Asia/Taipei'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface FeedbackRow {
  type: string | null
  status: string | null
  title: string | null
  description: string | null
  created_at: string
  reporter: string | null
}

// Best-effort AI triage; never throws (returns '' on any failure).
async function triage(rows: FeedbackRow[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return ''
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const list = rows.map((r, i) =>
      `${i + 1}. [${r.type ?? '?'}] ${r.title ?? '(無標題)'} — ${r.description ?? ''}（回報者：${r.reporter ?? '?'}）`
    ).join('\n')
    const prompt = `你是 myCRM 的工程助理。以下是過去 24 小時的新使用者回報。請用繁體中文，為每一筆做簡短分類與判斷（嚴重度 高/中/低、是否該修、建議怎麼修），條列、精簡。\n\n${list}`
    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch {
    return ''
  }
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

  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  const fromName = process.env.SENDGRID_FROM_NAME ?? 'CancerFree Biotech'
  if (!sgKey || !fromEmail) {
    await recordCronRun(service, 'check-feedback', 'error', { error: 'SendGrid not configured' }, Date.now() - startMs)
    return NextResponse.json({ error: 'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)' }, { status: 500 })
  }

  const recipient = (await getOrgSetting(service, 'feedback_recipient')) || 'pohan.chen@cancerfree.io'
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io'

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('feedback')
    .select('type, status, title, description, created_at, creator:created_by(display_name)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) {
    await recordCronRun(service, 'check-feedback', 'error', { error: error.message }, Date.now() - startMs)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: FeedbackRow[] = (data ?? []).map((r) => {
    const creator = r.creator as { display_name: string | null } | { display_name: string | null }[] | null
    const c = Array.isArray(creator) ? creator[0] : creator
    return {
      type: r.type, status: r.status, title: r.title,
      description: r.description, created_at: r.created_at,
      reporter: c?.display_name ?? null,
    }
  })

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: TZ })
  let subject: string
  let html: string

  if (rows.length === 0) {
    subject = `[myCRM] 今日無新回報 — ${today}`
    html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#222;">
      <p>過去 24 小時系統回報表單沒有新的 issue。</p>
      <p style="color:#888;font-size:12px;">myCRM 每日回報檢查 · ${today}（${TZ}）</p>
    </div>`
  } else {
    const items = rows.map((r) => {
      const at = new Date(r.created_at).toLocaleString('zh-TW', { timeZone: TZ })
      return `<li style="margin-bottom:10px;">
        <strong>[${esc(r.type)}] ${esc(r.title) || '(無標題)'}</strong>
        <span style="color:#888;font-size:12px;"> · ${esc(r.reporter) || '?'} · ${at} · ${esc(r.status)}</span>
        <div style="white-space:pre-wrap;color:#444;margin-top:2px;">${esc(r.description)}</div>
      </li>`
    }).join('')
    const ai = await triage(rows)
    const aiBlock = ai
      ? `<h3 style="margin-top:1.4em;">AI 初步研判</h3><div style="white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:6px;">${esc(ai)}</div>`
      : ''
    subject = `[myCRM] 今日有 ${rows.length} 筆新回報 — ${today}`
    html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#222;max-width:680px;">
      <p>過去 24 小時收到 <strong>${rows.length}</strong> 筆新回報：</p>
      <ul style="padding-left:1.2em;">${items}</ul>
      ${aiBlock}
      <p style="margin-top:1em;"><a href="${appUrl}/admin/feedback">→ 前往後台處理</a></p>
      <p style="color:#888;font-size:12px;">myCRM 每日回報檢查 · ${today}（${TZ}）</p>
    </div>`
  }

  const res = await fetch(SG_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      reply_to: { email: recipient },
      subject,
      content: [{ type: 'text/html', value: html }],
      personalizations: [{ to: [{ email: recipient }] }],
    }),
  })
  if (res.status !== 202) {
    const body = await res.text()
    await recordCronRun(service, 'check-feedback', 'error', { error: `SendGrid ${res.status}` }, Date.now() - startMs)
    return NextResponse.json({ ok: false, error: `SendGrid ${res.status}: ${body}` }, { status: 500 })
  }
  await recordCronRun(service, 'check-feedback', 'ok', { count: rows.length }, Date.now() - startMs)
  return NextResponse.json({ ok: true, count: rows.length, emailed: recipient })
}

export const maxDuration = 300
