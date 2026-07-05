import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'

// One-time admin utility — call this to register Telegram webhook from server side
// Protected by ADMIN_SECRET env var
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || secret !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin

  if (!botToken) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 })
  }

  const webhookUrl = `${appUrl}/api/bot`
  const params = new URLSearchParams({ url: webhookUrl })
  if (webhookSecret) params.set('secret_token', webhookSecret)

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook?${params}`,
  )
  const data = await res.json()

  // Also return current webhook info
  const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
  const info = await infoRes.json()

  // Auth is a shared ADMIN_SECRET (no user identity) → actor is unknown.
  // Phase 2+: 逐 org 迭代／由 payload 解析 org
  await logAdminAction(orgScopedClient(systemOrgContext()), {
    actorEmail: 'unknown',
    action: 'set_webhook',
    target: webhookUrl,
    detail: { ok: data?.ok },
  })

  return NextResponse.json({ setWebhook: data, webhookInfo: info, webhookUrl })
}
