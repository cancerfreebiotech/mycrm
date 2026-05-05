// Cloudflare Email Worker that receives mail to inbox@bcc.cancerfree.io,
// reads the raw RFC822 stream, and POSTs it to the mycrm webhook.
//
// Deploy: cd workers/inbound-email && wrangler deploy
// Set secret:  wrangler secret put INBOUND_PARSE_SECRET
//
// In Cloudflare dashboard → Email Routing → Routes, the destination for
// inbox@bcc.cancerfree.io must be set to "Send to a Worker" → this worker.

interface Env {
  MYCRM_WEBHOOK_URL: string
  INBOUND_PARSE_SECRET: string
}

interface ForwardableEmailMessage {
  readonly from: string
  readonly to: string
  readonly raw: ReadableStream
  readonly headers: Headers
  setReject(reason: string): void
  forward(rcptTo: string, headers?: Headers): Promise<void>
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const rawBody = await new Response(message.raw).text()

    const res = await fetch(env.MYCRM_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'message/rfc822',
        'X-Inbound-Secret': env.INBOUND_PARSE_SECRET,
        'X-Envelope-From': message.from,
        'X-Envelope-To': message.to,
      },
      body: rawBody,
    })

    if (res.status >= 500) {
      // Transient mycrm error → throw so Cloudflare retries
      throw new Error(`mycrm 5xx ${res.status}`)
    }
    // 2xx and 4xx are final — 4xx means mycrm rejected the email (bad secret,
    // unparseable, no org party). Don't retry; just drop.
  },
}
