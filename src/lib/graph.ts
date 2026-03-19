// ── Token refresh ─────────────────────────────────────────────────────────────

function isTokenExpiredOrSoon(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    // Refresh if less than 5 minutes remaining
    return (payload.exp * 1000) - Date.now() < 5 * 60 * 1000
  } catch {
    return true // Can't decode → assume expired
  }
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const tenantId = process.env.TEAMS_TENANT_ID ?? 'common'
  const clientId = process.env.AZURE_OAUTH_CLIENT_ID ?? process.env.TEAMS_BOT_APP_ID!
  const clientSecret = process.env.AZURE_OAUTH_CLIENT_SECRET ?? process.env.TEAMS_BOT_APP_SECRET!

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'email profile Mail.Send Calendars.ReadWrite offline_access',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error_description ?? `Token refresh failed: ${res.status}`)
  }
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken }
}

/**
 * Returns a valid access token for the given user.
 * If the stored token is expired (or about to expire), refreshes it via the refresh token.
 * Requires: createServiceClient from '@/lib/supabase'
 */
export async function getValidProviderToken(userId: string): Promise<string> {
  const { createServiceClient } = await import('@/lib/supabase')
  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('users')
    .select('provider_token, provider_refresh_token')
    .eq('id', userId)
    .single()

  if (!user?.provider_token) throw new Error('找不到 Microsoft 存取憑證，請重新登入')

  // If token is still valid, return it directly
  if (!isTokenExpiredOrSoon(user.provider_token)) return user.provider_token

  // Try to refresh
  if (!user.provider_refresh_token) throw new Error('存取憑證已過期，請重新登入以更新授權')

  const { accessToken, refreshToken } = await refreshMicrosoftToken(user.provider_refresh_token)

  // Save new tokens to DB
  await supabase.from('users').update({
    provider_token: accessToken,
    provider_refresh_token: refreshToken,
  }).eq('id', userId)

  return accessToken
}

export interface CalendarEventParams {
  accessToken: string
  title: string
  startIso: string
  endIso: string
  attendeeEmails?: string[]
  location?: string
}

export async function createCalendarEvent(params: CalendarEventParams): Promise<string> {
  const { accessToken, title, startIso, endIso, attendeeEmails = [], location } = params
  const event: Record<string, unknown> = {
    subject: title,
    start: { dateTime: startIso, timeZone: 'UTC' },
    end: { dateTime: endIso, timeZone: 'UTC' },
  }
  if (location) event.location = { displayName: location }
  if (attendeeEmails.length > 0) {
    event.attendees = attendeeEmails.map(email => ({
      emailAddress: { address: email },
      type: 'required',
    }))
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Graph API error: ${res.status}`)
  }
  const data = await res.json()
  return (data.webLink as string) ?? ''
}

interface Attachment {
  name: string
  contentType: string
  contentBytes: string // base64
}

interface SendMailParams {
  accessToken: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  attachments?: Attachment[]
}

function parseAddresses(raw: string | undefined): { emailAddress: { address: string } }[] {
  if (!raw?.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(addr => ({ emailAddress: { address: addr } }))
}

export async function sendMail({ accessToken, to, cc, bcc, subject, body, attachments }: SendMailParams) {
  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: 'HTML',
      content: body,
    },
    toRecipients: parseAddresses(to),
  }

  const ccList = parseAddresses(cc)
  if (ccList.length > 0) message.ccRecipients = ccList

  const bccList = parseAddresses(bcc)
  if (bccList.length > 0) message.bccRecipients = bccList

  if (attachments && attachments.length > 0) {
    message.attachments = attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBytes,
    }))
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Graph API error: ${res.status}`)
  }
}
