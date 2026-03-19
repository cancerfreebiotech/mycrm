// ── Token refresh functions live in graph-server.ts (server-only) ─────────────
// graph.ts only contains pure fetch helpers safe for client-side import

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
