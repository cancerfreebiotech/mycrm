import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

// At-rest encryption for OAuth tokens stored in the DB (gmail_oauth).
// AES-256-GCM, key derived from NEXTAUTH_SECRET (backend-only — see
// emailTokenSecret.ts for why NEXT_PUBLIC_* values must never be used).
// Format: enc:v1:<iv>:<ciphertext>:<authTag>  (base64url parts)
// decryptToken() passes through values without the prefix, so rows written
// before encryption shipped keep working and get re-encrypted on next update.
//
// The send-report Supabase Edge Function implements the same scheme in Deno
// (webcrypto) — keep key derivation and format in sync if this changes.

const PREFIX = 'enc:v1:'

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set — refusing to encrypt/decrypt tokens.')
  return createHash('sha256').update(secret).digest()
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}:${ct.toString('base64url')}:${tag.toString('base64url')}`
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored // legacy plaintext row
  const [ivB64, ctB64, tagB64] = stored.slice(PREFIX.length).split(':')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8')
}
