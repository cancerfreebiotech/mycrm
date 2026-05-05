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

// Strip the quoted-reply chain from an email body, but keep ONE level of
// quoted email so the user has context on what the reply was responding to.
//
// Algorithm: walk lines and count "quote start" triggers (start of a quoted
// email). Keep all lines through the first quoted email; cut at the second
// quote start. Underscore-only divider lines and "--- Original Message ---"
// labels are NOT counted as separate triggers because they typically precede
// a From:/Sent: block which is the actual structural marker.
//
// Triggers counted:
// - Outlook-style "From: ..." line followed by "Sent: ..." in next 3 lines
//   (multilingual: 寄件者/差出人, 傳送日期/送信日時/Date/日期)
// - Gmail-style "On <date>, X wrote:" line
export function stripQuotedReply(text: string): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let quoteLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    let isQuoteStart = false
    if (/^On\s.+wrote:\s*$/i.test(line)) {
      isQuoteStart = true
    } else if (/^(From|寄件者|差出人):\s/.test(line)) {
      const next3 = lines.slice(i + 1, i + 4).join('\n')
      if (/^(Sent|傳送日期|送信日時|Date|日期):\s/m.test(next3)) {
        isQuoteStart = true
      }
    }

    if (isQuoteStart) {
      quoteLevel++
      if (quoteLevel >= 2) break
    }

    // Inline ">" quoted lines: drop (keep the surrounding context but skip
    // the deeply-nested quoted text from older Gmail-style chains)
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
