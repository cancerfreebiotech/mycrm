import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export interface ServiceStatus {
  name: string
  status: 'ok' | 'error' | 'unconfigured'
  latencyMs?: number
  detail?: string
}

async function checkSupabase(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('contacts').select('id').limit(1)
    if (error) throw new Error(error.message)
    return { name: 'Supabase', status: 'ok', latencyMs: Date.now() - start }
  } catch (e) {
    return { name: 'Supabase', status: 'error', latencyMs: Date.now() - start, detail: String(e) }
  }
}

async function checkGemini(): Promise<ServiceStatus> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { name: 'Gemini', status: 'unconfigured', detail: 'GEMINI_API_KEY not set' }
  const start = Date.now()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: 'Gemini', status: 'ok', latencyMs: Date.now() - start }
  } catch (e) {
    return { name: 'Gemini', status: 'error', latencyMs: Date.now() - start, detail: String(e) }
  }
}

async function checkTelegram(): Promise<ServiceStatus> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { name: 'Telegram Bot', status: 'unconfigured', detail: 'TELEGRAM_BOT_TOKEN not set' }
  const start = Date.now()
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.description ?? 'getMe failed')
    return {
      name: 'Telegram Bot',
      status: 'ok',
      latencyMs: Date.now() - start,
      detail: `@${json.result.username}`,
    }
  } catch (e) {
    return { name: 'Telegram Bot', status: 'error', latencyMs: Date.now() - start, detail: String(e) }
  }
}

async function checkSendGrid(): Promise<ServiceStatus> {
  const key = process.env.SENDGRID_API_KEY
  if (!key) return { name: 'SendGrid', status: 'unconfigured', detail: 'SENDGRID_API_KEY not set' }
  const start = Date.now()
  try {
    const res = await fetch('https://api.sendgrid.com/v3/user/credits', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 401) throw new Error('Invalid API key')
    if (!res.ok && res.status !== 403) throw new Error(`HTTP ${res.status}`)
    return { name: 'SendGrid', status: 'ok', latencyMs: Date.now() - start }
  } catch (e) {
    return { name: 'SendGrid', status: 'error', latencyMs: Date.now() - start, detail: String(e) }
  }
}

async function checkTeamsBot(): Promise<ServiceStatus> {
  const appId = process.env.TEAMS_BOT_APP_ID
  const appSecret = process.env.TEAMS_BOT_APP_SECRET
  const tenantId = process.env.TEAMS_TENANT_ID
  if (!appId || !appSecret) {
    return { name: 'Teams Bot', status: 'unconfigured', detail: 'TEAMS_BOT_APP_ID / APP_SECRET not set' }
  }
  const start = Date.now()
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appSecret,
      scope: 'https://api.botframework.com/.default',
    })
    const tokenUrl = tenantId
      ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
      : 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token'
    const res = await fetch(tokenUrl, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Token fetch HTTP ${res.status}`)
    const json = await res.json()
    if (!json.access_token) throw new Error('No access_token returned')
    return { name: 'Teams Bot', status: 'ok', latencyMs: Date.now() - start }
  } catch (e) {
    return { name: 'Teams Bot', status: 'error', latencyMs: Date.now() - start, detail: String(e) }
  }
}

export async function GET() {
  const [supabase, gemini, telegram, sendgrid, teams] = await Promise.allSettled([
    checkSupabase(),
    checkGemini(),
    checkTelegram(),
    checkSendGrid(),
    checkTeamsBot(),
  ])

  function unwrap(r: PromiseSettledResult<ServiceStatus>): ServiceStatus {
    if (r.status === 'fulfilled') return r.value
    return { name: 'unknown', status: 'error', detail: String(r.reason) }
  }

  const services = [supabase, gemini, telegram, sendgrid, teams].map(unwrap)
  const allOk = services.every((s) => s.status !== 'error')

  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), services })
}
