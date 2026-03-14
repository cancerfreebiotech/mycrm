interface Attachment {
  name: string
  contentType: string
  contentBytes: string // base64
}

interface SendMailParams {
  accessToken: string
  to: string
  subject: string
  body: string
  attachments?: Attachment[]
}

export async function sendMail({ accessToken, to, subject, body, attachments }: SendMailParams) {
  const message: Record<string, unknown> = {
    subject,
    body: {
      contentType: 'HTML',
      content: body,
    },
    toRecipients: [
      {
        emailAddress: { address: to },
      },
    ],
  }

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
