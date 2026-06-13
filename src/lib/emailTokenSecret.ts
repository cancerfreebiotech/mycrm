// Backend-only HMAC secret for email tokens (opt-out / newsletter unsubscribe).
// NEVER fall back to a NEXT_PUBLIC_* value — those are bundled into the client and
// public, so signing/verifying with one lets anyone forge valid tokens.
export function emailTokenSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET is not set — refusing to sign/verify email tokens with a public key.'
    )
  }
  return secret
}
