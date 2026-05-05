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

// Cheap quoted-reply stripper. Removes obvious quote markers; not perfect
// for all email clients but good enough to keep email_body readable.
export function stripQuotedReply(text: string): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (/^On\s.+wrote:\s*$/i.test(line)) break
    if (/^-{3,}\s*Original Message\s*-{3,}/i.test(line)) break
    if (/^-{3,}\s*Forwarded message\s*-{3,}/i.test(line)) break
    if (/^>+\s/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim()
}
