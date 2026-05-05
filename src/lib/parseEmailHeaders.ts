// Helpers for parsing forwarded/quoted email content. mailparser handles
// the MIME structure and address fields; these helpers cover the edge cases
// that live inside the body text — e.g., extracting the original sender
// from a forwarded reply, or stripping quoted reply chains.

const FORWARD_FROM_PATTERNS = [
  /^From:\s*(.+?)\s*<([^>]+)>/im,
  /^From:\s*([^\n\r<]+@[^\s<]+)/im,
  /^寄件者:\s*(.+?)\s*<([^>]+)>/im,
  /^寄件者:\s*([^\n\r<]+@[^\s<]+)/im,
  /^差出人:\s*(.+?)\s*<([^>]+)>/im,
  /^差出人:\s*([^\n\r<]+@[^\s<]+)/im,
]

// From a forwarded email body, extract the original sender's name + email.
// Returns null if no recognizable forwarded-From header is found.
export function extractForwardedFrom(text: string): { name?: string; email: string } | null {
  if (!text) return null
  for (const re of FORWARD_FROM_PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    if (m[2]) {
      return { name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: m[2].trim() }
    }
    return { email: m[1].trim() }
  }
  return null
}

const FORWARD_SUBJECT_PREFIX = /^(fwd?:|轉寄:|轉送:|fw:|転送:)\s*/i

export function isForwardedSubject(subject: string | null | undefined): boolean {
  return !!subject && FORWARD_SUBJECT_PREFIX.test(subject.trim())
}

// Strip the quoted-reply chain from an email body so the captured
// interaction_log shows only the newest content (the user's actual reply),
// not the entire conversation history.
//
// Cuts at the FIRST appearance of any quote marker, including Outlook's
// "________________ From: ... Sent: ... To: ..." block (in zh-TW / en / ja),
// Gmail-style "On <date>, X wrote:" lead-in, and explicit "Original message"
// dividers. Inline ">" quoted lines are removed but don't trigger a cut
// (they may appear interspersed in some clients).
export function stripQuotedReply(text: string): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Outlook divider: long underscore line (often followed by From: header block)
    if (/^_{5,}\s*$/.test(line)) break

    // Gmail-style: "On Mon, May 5, 2026 at 10:00 AM, John <john@x.com> wrote:"
    if (/^On\s.+wrote:\s*$/i.test(line)) break

    // Explicit dividers (multi-language)
    if (/^-{3,}\s*(Original Message|Forwarded message|原始郵件|転送メッセージ)\s*-{3,}/i.test(line)) break

    // Outlook reply quote: "From: ..." at start of line, with "Sent:" / "Date:"
    // appearing within the next 3 lines (header-style block, not a one-off mention)
    if (/^(From|寄件者|差出人):\s/.test(line)) {
      const next3 = lines.slice(i + 1, i + 4).join('\n')
      if (/^(Sent|傳送日期|送信日時|Date|日期):\s/m.test(next3)) break
    }

    // Inline ">" quoted lines: drop, don't cut
    if (/^>+\s?/.test(line)) continue

    out.push(line)
  }

  return out.join('\n').trim()
}

// Format an address as "Display Name <email>" if name present, else just email.
function formatAddress(entry: { name?: string; email: string }): string {
  return entry.name ? `${entry.name} <${entry.email}>` : entry.email
}

// Format a list of addresses comma-separated for header display.
export function formatAddressList(list: Array<{ name?: string; email: string }>): string {
  return list.map(formatAddress).join(', ')
}

// Build a human-readable header block showing From / To / Cc, to prepend
// to email_body so the user can see who else was on the email at a glance.
export function buildHeaderBlock(args: {
  from: { name?: string; email: string }
  to: Array<{ name?: string; email: string }>
  cc: Array<{ name?: string; email: string }>
}): string {
  const lines = [`From: ${formatAddress(args.from)}`]
  if (args.to.length > 0) lines.push(`To: ${formatAddressList(args.to)}`)
  if (args.cc.length > 0) lines.push(`Cc: ${formatAddressList(args.cc)}`)
  return lines.join('\n')
}
