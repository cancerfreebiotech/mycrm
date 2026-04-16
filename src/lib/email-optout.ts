import { createHmac } from 'crypto'

const SECRET = () => process.env.NEXTAUTH_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

interface OptOutPayload {
  email: string
  contactId: string
  campaignId: string
}

export function generateOptOutToken(payload: OptOutPayload): string {
  const header = Buffer.from(JSON.stringify({ typ: 'email-optout', alg: 'HS256' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1 year
  })).toString('base64url')
  const sig = createHmac('sha256', SECRET()).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyOptOutToken(token: string): OptOutPayload | null {
  try {
    const [h, p, sig] = token.split('.')
    if (!h || !p || !sig) return null
    const expected = createHmac('sha256', SECRET()).update(`${h}.${p}`).digest('base64url')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as OptOutPayload & { exp?: number; typ?: string }
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return { email: payload.email, contactId: payload.contactId, campaignId: payload.campaignId }
  } catch {
    return null
  }
}
