import { createServiceClient } from '@/lib/supabase'
import type { OrgDb } from '@/lib/orgContext'
import { createHmac } from 'crypto'
import { emailTokenSecret } from '@/lib/emailTokenSecret'
import { recordUsage } from '@/lib/usage'
import { getOrgSettings } from '@/lib/orgSettings'

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'

/**
 * Thrown by sendCampaign for pre-send validation / config failures (nothing has
 * been emailed yet). Carries the HTTP status + JSON payload the send route
 * returned before this logic was extracted, so the route can preserve its
 * exact 1:1 responses (404 / 400 / 409 / 500). Callers that aren't HTTP routes
 * (e.g. the scheduled-send cron) can catch it to distinguish "never sent" from
 * a partial failure.
 */
export class SendCampaignError extends Error {
  status: number
  payload: Record<string, unknown>
  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.error === 'string' ? payload.error : 'send error')
    this.name = 'SendCampaignError'
    this.status = status
    this.payload = payload
  }
}

// Sign a JWT-like token for per-recipient unsubscribe link. Verified by
// /api/newsletter/unsubscribe which shares the same secret + algorithm.
function signUnsubToken(email: string, campaignId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ email, campaignId, exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3600 })
  ).toString('base64url')
  const secret = emailTokenSecret()
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

interface Subscriber {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  contact_id: string | null
}

// Automatic UTM tagging. Pure transform — appends utm_source/utm_medium/
// utm_campaign to every outbound http(s) href in the HTML. Existing query
// params (including pre-set utm_*) are preserved and never overwritten.
// Skipped: unsubscribe/opt-out links; mailto:/tel:/in-page anchors and the
// {{{unsubscribe}}} placeholders never match the http(s) pattern anyway.
export function addUtmTags(html: string, campaignTag: string): string {
  return html.replace(
    /(<a\b[^>]*?\shref=)(["'])(https?:\/\/[^"']+)\2/gi,
    (full, prefix: string, quote: string, href: string) => {
      if (/unsubscribe|opt-?out/i.test(href)) return full
      // Query separators inside HTML attributes may be entity-encoded (&amp;) —
      // decode before parsing, re-encode after so the document stays consistent.
      const hadAmp = href.includes('&amp;')
      let url: URL
      try {
        url = new URL(hadAmp ? href.replace(/&amp;/g, '&') : href)
      } catch {
        return full
      }
      if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'newsletter')
      if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', 'email')
      if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign', campaignTag)
      // Always emit '&' as the '&amp;' entity in the attribute value, not only
      // when the source already used it: a raw '&' in an HTML attribute is
      // invalid, and every client (incl. SendGrid's click-tracking rewriter)
      // decodes the entity back to '&' when extracting the URL. url.toString()
      // only produces '&' as query separators (a literal '&' inside a value is
      // percent-encoded), so a blanket replace is safe and never double-encodes.
      const out = url.toString().replace(/&/g, '&amp;')
      return `${prefix}${quote}${out}${quote}`
    },
  )
}

export interface SendCampaignOpts {
  testOnly?: boolean
  testEmail?: string
  resend?: boolean
  /** Second phase of an A/B holdout test (winner already stamped): bypasses the
   *  already-sent 409 guard so the cron can send the remainder with the winning
   *  subject. Resume-dedup still excludes everyone already emailed. */
  abFinal?: boolean
  actorUserId?: string | null
}

export interface SendCampaignResult {
  ok: boolean
  sent: number
  total: number
  errors: string[]
  invalidEmails: string[]
}

// Send a campaign via SendGrid to everyone in its list_ids.
//
// Strategy:
//   - Gather subscribers from newsletter_subscriber_lists (filter unsubscribed_at IS NULL)
//   - Chunk into groups of 1000 (SendGrid personalizations cap)
//   - One SendGrid API call per chunk, each recipient gets their own To: header
//   - After send, write interaction_logs for subscribers with linked contact_id
//     (type=email, send_method='newsletter', campaign_id=this campaign).
//     These logs are EXCLUDED from last_activity_at by our existing filter.
//   - Update campaign.sent_count / sent_at / status='sent'|'partial'
//
// Throws SendCampaignError for pre-send validation/config failures (nothing
// emailed). Once sending starts, per-chunk errors are collected and returned
// (ok=false) rather than thrown.
export async function sendCampaign(
  db: OrgDb,
  campaignId: string,
  opts: SendCampaignOpts = {},
): Promise<SendCampaignResult> {
  const userId = opts.actorUserId ?? null

  // getOrgSettings (system_settings, global) and recordUsage (increment_usage
  // RPC) require a raw SupabaseClient — the org-scoped `db` wrapper only exposes
  // .from(). Neither is org-scoped, so a plain service client is equivalent.
  const service = createServiceClient()

  const { data: campaign } = await db
    .from('newsletter_campaigns')
    .select('id, subject, subject_b, preview_text, content_html, list_ids, sent_at, slug, ab_test_pct, ab_winner')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) throw new SendCampaignError(404, { error: 'campaign not found' })
  if (!campaign.subject || !campaign.content_html) {
    throw new SendCampaignError(400, { error: 'campaign missing subject or content_html' })
  }
  // Guard against accidental re-send: a completed send stamps sent_at. Require an
  // explicit resend flag to send again. (People already sent are skipped below
  // regardless, so even a resend only reaches those who haven't received it.)
  // abFinal is the deliberate second phase of an A/B holdout test, so it passes.
  if (!opts.testOnly && campaign.sent_at && !opts.resend && !opts.abFinal) {
    throw new SendCampaignError(409, { error: 'campaign already sent — pass resend:true to send again', sent_at: campaign.sent_at })
  }

  // A/B subject test mode (null when no subject_b or a test send):
  //   'split'   — subject_b only: alternate a/b across the WHOLE list (legacy 50/50)
  //   'holdout' — subject_b + ab_test_pct, winner undecided: send only the test cohort
  //   'final'   — winner stamped: send the remainder with the winning subject (variant 'w')
  const abMode: 'split' | 'holdout' | 'final' | null =
    opts.testOnly || !campaign.subject_b?.trim()
      ? null
      : campaign.ab_test_pct == null
        ? 'split'
        : campaign.ab_winner ? 'final' : 'holdout'

  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!sgKey || !fromEmail) {
    throw new SendCampaignError(500, { error: 'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)' })
  }
  // Reply-To, sender display name and app base URL come from org settings (env
  // fallback baked in) so replies route to the configured address and links use
  // the configured host rather than SendGrid's from-only default.
  const { newsletter_reply_to: replyTo, sender_name: fromName, app_url: baseUrl } =
    await getOrgSettings(service, ['newsletter_reply_to', 'sender_name', 'app_url'])

  // ── Gather recipients ──
  let recipients: Subscriber[] = []
  const invalidEmails: string[] = []

  if (opts.testOnly) {
    if (!opts.testEmail) throw new SendCampaignError(400, { error: 'testEmail required' })
    recipients = [{ id: 'test', email: opts.testEmail, first_name: null, last_name: null, contact_id: null }]
  } else {
    const listIds = (campaign.list_ids as string[] | null) ?? []
    if (listIds.length === 0) throw new SendCampaignError(400, { error: 'campaign has no list_ids' })

    // Supabase default LIMIT is 1000 — paginate to grab the full membership.
    // For our scale (lists up to ~10k) this is fine; bigger lists would want
    // a server-side aggregation but we're far from that.
    const PAGE = 1000
    const allMembership: { subscriber_id: string }[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: page } = await db
        .from('newsletter_subscriber_lists')
        .select('subscriber_id')
        .in('list_id', listIds)
        .range(from, from + PAGE - 1)
      if (!page || page.length === 0) break
      allMembership.push(...(page as { subscriber_id: string }[]))
      if (page.length < PAGE) break
    }
    const subIds = [...new Set(allMembership.map((r) => r.subscriber_id))]
    if (subIds.length === 0) throw new SendCampaignError(400, { error: 'no subscribers in selected lists' })

    // PostgREST URL length cap (~32KB). Large lists (1000+ UUIDs/emails) in
    // a single .in() get silently truncated → empty result. Chunk every
    // .in() lookup to BATCH (200) to stay under the URL limit.
    const BATCH = 200
    // Supabase's PostgrestFilterBuilder generics are deeply nested. Typing
    // extraFilter against them triggers TS "excessively deep" (the previous
    // ReturnType<ReturnType<...>> chain did). The query builder is runtime-
    // chainable regardless of the static type, so we accept any here.
    async function chunkedIn<T>(
      table: string,
      select: string,
      column: string,
      values: string[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extraFilter?: (q: any) => any
    ): Promise<T[]> {
      const out: T[] = []
      for (let i = 0; i < values.length; i += BATCH) {
        let q = db.from(table).select(select).in(column, values.slice(i, i + BATCH))
        if (extraFilter) q = extraFilter(q)
        const { data } = await q
        if (data) out.push(...(data as T[]))
      }
      return out
    }

    const rawSubs = await chunkedIn<Subscriber>(
      'newsletter_subscribers',
      'id, email, first_name, last_name, contact_id',
      'id',
      subIds,
      (q) => q.is('unsubscribed_at', null)
    )

    // Filter out suppressed emails.
    // Sources checked (in priority order):
    //   1. contacts.email_status ∈ {bounced, invalid, unsubscribed} — canonical for CRM contacts
    //   2. newsletter_blacklist — for non-contact emails (external subscribers)
    //   3. newsletter_unsubscribes — global unsubscribe tracking
    const emails = [...new Set(rawSubs.map((s) => s.email.toLowerCase().trim()))]
    const contactIds = [...new Set(rawSubs.map((s) => s.contact_id).filter((x): x is string => !!x))]

    const [bl, unsubs, badContacts] = await Promise.all([
      chunkedIn<{ email: string }>('newsletter_blacklist', 'email', 'email', emails),
      chunkedIn<{ email: string }>('newsletter_unsubscribes', 'email', 'email', emails),
      contactIds.length > 0
        ? chunkedIn<{ id: string }>('contacts', 'id', 'id', contactIds, (q) =>
            q.not('email_status', 'is', null)
          )
        : Promise.resolve([] as { id: string }[]),
    ])

    const suppressed = new Set<string>([
      ...bl.map((r) => r.email.toLowerCase().trim()),
      ...unsubs.map((r) => r.email.toLowerCase().trim()),
    ])
    const suppressedContactIds = new Set<string>(badContacts.map((c) => c.id))

    // Email syntax check — SendGrid rejects the WHOLE chunk if any single
    // address in personalizations is malformed (e.g. has whitespace, missing
    // domain). Filter these out client-side and report them so the user can
    // clean up the source data.
    const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

    recipients = rawSubs.filter((r) => {
      const norm = r.email.toLowerCase().trim()
      if (suppressed.has(norm)) return false
      if (r.contact_id && suppressedContactIds.has(r.contact_id)) return false
      if (!VALID_EMAIL.test(r.email.trim())) {
        invalidEmails.push(r.email)
        return false
      }
      return true
    })

    // A/B holdout: send only a deterministic ab_test_pct% cohort now; the
    // remainder goes out later with the winning subject (decided by the
    // process-scheduled-campaigns cron). Sort by email + slice so the cohort is
    // stable across retries — the resume dedup below then keeps working, and
    // the 'final' phase reaches exactly the complement.
    if (abMode === 'holdout') {
      const sorted = [...recipients].sort((x, y) => {
        const a = x.email.toLowerCase().trim()
        const b = y.email.toLowerCase().trim()
        return a < b ? -1 : a > b ? 1 : 0
      })
      const cohortSize = Math.max(1, Math.round(sorted.length * (campaign.ab_test_pct as number) / 100))
      recipients = sorted.slice(0, cohortSize)
    }

    // Resume-safe dedup: exclude anyone who already has a 'sent' recipient row
    // for this campaign, so a re-send or a retry after a mid-loop timeout never
    // emails the same person twice.
    const alreadySent = await chunkedIn<{ email: string }>(
      'newsletter_recipients', 'email', 'email',
      [...new Set(recipients.map((r) => r.email.toLowerCase().trim()))],
      (q) => q.eq('campaign_id', campaignId).eq('status', 'sent')
    )
    if (alreadySent.length > 0) {
      const sentSet = new Set(alreadySent.map((r) => r.email.toLowerCase().trim()))
      recipients = recipients.filter((r) => !sentSet.has(r.email.toLowerCase().trim()))
    }

    if (invalidEmails.length > 0) {
      console.warn('[newsletter send] dropped invalid emails', invalidEmails)
    }
  }

  if (recipients.length === 0) throw new SendCampaignError(400, { error: 'no valid recipients after filters' })

  // ── Send via SendGrid + write interaction_logs PER CHUNK ──
  // SendGrid supports up to 1000 personalizations per API call.
  //
  // We write interaction_logs immediately after each chunk succeeds (rather
  // than batching all logs at the end). Reasoning: a Vercel function timeout
  // mid-loop loses the post-loop log write entirely — that's exactly what
  // happened on the 5/5 May ZH send (sent_count=966 but 0 logs in DB). Per-
  // chunk persistence guarantees logs match SendGrid reality even on timeout.
  const CHUNK = 1000
  let sent = 0
  const errors: string[] = []
  const cleanBody = campaign.content_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)

  // Top-level subject: in the A/B 'final' phase everyone gets the winning
  // subject; otherwise subject A (variant b overrides per-personalization).
  const sendSubject: string = abMode === 'final' && campaign.ab_winner === 'b'
    ? (campaign.subject_b as string).trim()
    : campaign.subject

  // Inbox preview text: inject a hidden preheader div right after <body> (the
  // standard technique — an X-Preview-Text header does nothing in any client).
  // Trailing &nbsp;&zwnj; padding stops clients from pulling body text after it.
  let htmlWithPreheader = campaign.content_html
  if (campaign.preview_text) {
    const preheaderDiv = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${campaign.preview_text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}${'&nbsp;&zwnj;'.repeat(40)}</div>`
    htmlWithPreheader = /<body[^>]*>/i.test(campaign.content_html)
      ? campaign.content_html.replace(/(<body[^>]*>)/i, `$1${preheaderDiv}`)
      : preheaderDiv + campaign.content_html
  }

  // Automatic UTM tagging on every outbound link (campaign slug preferred, id fallback).
  htmlWithPreheader = addUtmTags(htmlWithPreheader, (campaign.slug as string | null)?.trim() || campaignId)

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK)

    // Create a newsletter_recipients row per recipient BEFORE sending so we can
    // pass its id as X-Recipient-Id (SendGrid echoes custom_args back on open/
    // click events → the webhook attributes them to this row). Per-chunk so a
    // mid-loop timeout doesn't leave rows for chunks that never sent.
    const recipientIdByEmail = new Map<string, string>()
    const chunkRecipientIds: string[] = []
    // A/B subject test: in 'split' (whole list) and 'holdout' (test cohort)
    // modes, alternate variants a/b across recipients (deterministic 50/50 by
    // index). The 'final' phase marks everyone 'w' (winner). Test sends always
    // use subject A.
    const abAlternate = abMode === 'split' || abMode === 'holdout'
    const variantByEmail = new Map<string, 'a' | 'b'>()
    if (abAlternate) {
      slice.forEach((r, idx) => variantByEmail.set(r.email.toLowerCase().trim(), (i + idx) % 2 === 0 ? 'a' : 'b'))
    }
    if (!opts.testOnly) {
      const recipientRows = slice.map((r) => ({
        campaign_id: campaignId,
        contact_id: r.contact_id,
        email: r.email,
        status: 'sent',
        sent_at: new Date().toISOString(),
        variant: abMode === 'final' ? 'w' : abAlternate ? variantByEmail.get(r.email.toLowerCase().trim()) : null,
      }))
      const { data: inserted, error: recErr } = await db
        .from('newsletter_recipients')
        .insert(recipientRows)
        .select('id, email')
      if (recErr) {
        errors.push(`chunk ${i} recipient rows: ${recErr.message}`)
      } else {
        for (const row of inserted ?? []) {
          recipientIdByEmail.set((row.email as string).toLowerCase().trim(), row.id as string)
          chunkRecipientIds.push(row.id as string)
        }
      }
    }

    const personalizations = slice.map((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
      const token = signUnsubToken(r.email, campaignId)
      const unsubUrl = `${baseUrl}/unsubscribe?token=${token}`
      const rid = recipientIdByEmail.get(r.email.toLowerCase().trim())
      return {
        to: [name ? { email: r.email, name } : { email: r.email }],
        // SendGrid per-personalization substitutions: keys must match exactly
        // in the body/subject. Newsletter HTML from listmonk uses {{{unsubscribe}}}
        // and {{{unsubscribe_preferences}}} — map both to our mycrm unsubscribe URL.
        substitutions: {
          '{{optout_url}}': unsubUrl,
          '{{{unsubscribe}}}': unsubUrl,
          '{{{unsubscribe_preferences}}}': unsubUrl,
        },
        // X-Recipient-Id is echoed back on open/click webhook events for
        // per-recipient attribution. Omitted for test sends.
        ...(rid ? { custom_args: { 'X-Recipient-Id': rid } } : {}),
        // A/B: per-personalization subject overrides the top-level one for variant b.
        ...(abAlternate && variantByEmail.get(r.email.toLowerCase().trim()) === 'b'
          ? { subject: campaign.subject_b!.trim() }
          : {}),
      }
    })
    const payload = {
      from: { email: fromEmail, name: fromName },
      reply_to: { email: replyTo },
      subject: sendSubject,
      content: [{ type: 'text/html', value: htmlWithPreheader }],
      personalizations,
      // Force open + click tracking on so SendGrid emits the events the
      // webhook records (independent of account-level defaults).
      tracking_settings: {
        open_tracking: { enable: true },
        click_tracking: { enable: true, enable_text: false },
      },
    }
    try {
      const res = await fetch(SG_SEND_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errText = await res.text()
        errors.push(`chunk ${i}: ${res.status} ${errText.slice(0, 200)}`)
        // Roll back this chunk's pre-inserted 'sent' rows so counts/analytics stay
        // accurate and the resume dedup will retry these recipients next run.
        // error carries the SendGrid status + trimmed body for the 失敗明細 table.
        if (chunkRecipientIds.length > 0) {
          await db
            .from('newsletter_recipients')
            .update({ status: 'failed', error: `${res.status} ${errText.trim()}`.slice(0, 500) })
            .in('id', chunkRecipientIds)
        }
        continue
      }
      sent += slice.length

      // Write interaction_logs ONLY for this successful chunk — guarantees
      // logs match what SendGrid actually accepted, not what we attempted.
      if (!opts.testOnly) {
        const chunkLinkedContactIds = slice
          .filter((r) => r.contact_id)
          .map((r) => r.contact_id as string)
        if (chunkLinkedContactIds.length > 0) {
          const chunkLogs = chunkLinkedContactIds.map((cid) => ({
            contact_id: cid,
            type: 'email' as const,
            direction: 'outbound' as const,
            content: `電子報：${sendSubject}`,
            email_subject: sendSubject,
            email_body: cleanBody,
            created_by: userId,
            campaign_id: campaignId,
            send_method: 'newsletter' as const,
          }))
          // Insert logs in small sub-batches. A single failing row (e.g. the
          // contacts.last_activity trigger re-validating a contact that
          // violates contacts_has_name) rejects its whole INSERT statement —
          // sub-batching limits the blast radius to ~LOG_BATCH rows instead of
          // wiping the entire chunk's logs (this is what silently lost all 923
          // logs on the 6/1 JP send). Failures are console.error'd so they show
          // up in runtime logs, not just swallowed in the HTTP response.
          const LOG_BATCH = 200
          for (let j = 0; j < chunkLogs.length; j += LOG_BATCH) {
            const logSlice = chunkLogs.slice(j, j + LOG_BATCH)
            const { error: logErr } = await db.from('interaction_logs').insert(logSlice)
            if (logErr) {
              const msg = `chunk ${i} log write [${j}-${j + logSlice.length}]: ${logErr.message}`
              errors.push(msg)
              console.error('[newsletter send]', msg)
            }
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`chunk ${i}: ${msg}`)
      if (chunkRecipientIds.length > 0) {
        await db
          .from('newsletter_recipients')
          .update({ status: 'failed', error: msg.slice(0, 500) })
          .in('id', chunkRecipientIds)
      }
    }
  }


  // ── Update campaign state ──
  // 'partial' when any chunk failed (previously everything — even sent=0 — was
  // stamped 'sent', hiding real incidents). send_errors keeps the failure detail
  // so the campaigns page can show what went wrong; the resume dedup path is the
  // retry mechanism (resend:true skips already-sent recipients).
  if (!opts.testOnly) {
    const failed = recipients.length - sent
    // A normal send just records this run's numbers. The A/B 'final' phase must
    // reflect the holdout cohort PLUS this run — but a prev+increment sum
    // double-counts when 'final' is re-run (a manual retry after a partial
    // failure re-sends the recipients that previously failed, and they were
    // already tallied → total_recipients drifts past the real audience, e.g. 110
    // for a 100-person list). So for 'final' we derive the counters straight from
    // the newsletter_recipients rows, keyed by email, which makes repeated runs
    // idempotent. A first 'final' run (holdout fully sent) yields the same
    // numbers the increment path did.
    let sentCount = sent
    let totalRecipients = recipients.length
    let failedCount = failed > 0 ? failed : 0
    let countersKnown = true
    // A plain resend has the same double-count problem as A/B 'final': the dedup
    // above shrinks `recipients` to only the not-yet-sent people, so writing this
    // run's `sent`/`recipients.length` would clobber the cumulative counters
    // (e.g. a retry of 10 failures overwrites sent_count 90 → 10). Recount from
    // the recipient rows in both cases so repeated runs stay idempotent.
    if (abMode === 'final' || opts.resend) {
      const hasSentByEmail = new Map<string, boolean>()
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data: page, error: pageErr } = await db
          .from('newsletter_recipients')
          .select('email, status')
          .eq('campaign_id', campaignId)
          .range(from, from + PAGE - 1)
        if (pageErr) {
          // 讀取失敗不能把空 Map 當 0 寫回——略過本次計數更新，保留 DB 既有值
          console.error('[newsletter-send-worker] final recount read failed, keeping existing counters:', pageErr.message)
          countersKnown = false
          break
        }
        if (!page || page.length === 0) break
        for (const row of page as { email: string; status: string }[]) {
          const key = row.email.toLowerCase().trim()
          hasSentByEmail.set(key, (hasSentByEmail.get(key) ?? false) || row.status === 'sent')
        }
        if (page.length < PAGE) break
      }
      if (countersKnown) {
        // Dedup guarantees ≤1 'sent' row per email, so distinct sent emails ==
        // 'sent' row count (matching the analytics denominator). total is the real
        // audience (distinct emails); failed is everyone who never got a 'sent'.
        totalRecipients = hasSentByEmail.size
        sentCount = [...hasSentByEmail.values()].filter(Boolean).length
        failedCount = totalRecipients - sentCount
      }
    }
    await db
      .from('newsletter_campaigns')
      .update({
        status: errors.length > 0 || sent === 0 ? 'partial' : 'sent',
        sent_at: new Date().toISOString(),
        ...(countersKnown ? {
          sent_count: sentCount,
          total_recipients: totalRecipients,
          failed_count: failedCount,
        } : {}),
        send_errors: errors.length > 0 ? errors.slice(0, 50) : null,
      })
      .eq('id', campaignId)
  }

  if (!opts.testOnly && sent > 0) await recordUsage(service, { newsletter_sent: sent })

  return {
    ok: errors.length === 0,
    sent,
    total: recipients.length,
    errors,
    invalidEmails,
  }
}
