import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// One-time admin utility — call this to register Telegram webhook from server side
// Protected by ADMIN_SECRET env var
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && secret !== adminSecret) {
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

  return NextResponse.json({ setWebhook: data, webhookInfo: info, webhookUrl })
}
