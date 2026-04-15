// Server-only: uses next/headers via supabase.ts — do NOT import from client components
import { createServiceClient } from '@/lib/supabase'

function isTokenExpiredOrSoon(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return (payload.exp * 1000) - Date.now() < 5 * 60 * 1000
  } catch {
    return true
  }
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const tenantId = process.env.TEAMS_TENANT_ID ?? 'common'
  const clientId = process.env.AZURE_OAUTH_CLIENT_ID ?? process.env.TEAMS_BOT_APP_ID!
  const clientSecret = process.env.AZURE_OAUTH_CLIENT_SECRET ?? process.env.TEAMS_BOT_APP_SECRET!

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid email profile Mail.Send Calendars.ReadWrite offline_access',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error_description ?? `Token refresh failed: ${res.status}`)
  }
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken }
}

export async function getValidProviderToken(userId: string): Promise<string> {
  const supabase = createServiceClient()
  const { data: user } = await supabase
    .from('users')
    .select('provider_token, provider_refresh_token')
    .eq('id', userId)
    .single()

  if (!user?.provider_token) throw new Error('找不到 Microsoft 存取憑證，請重新登入')
  if (!isTokenExpiredOrSoon(user.provider_token)) return user.provider_token
  if (!user.provider_refresh_token) throw new Error('存取憑證已過期，請重新登入以更新授權')

  const { accessToken, refreshToken } = await refreshMicrosoftToken(user.provider_refresh_token)
  await supabase.from('users').update({
    provider_token: accessToken,
    provider_refresh_token: refreshToken,
  }).eq('id', userId)

  return accessToken
}
