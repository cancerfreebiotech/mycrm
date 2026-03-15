import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const service = createServiceClient()
  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/admin/reports?error=no_code', req.url))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/admin/reports?error=token_exchange', req.url))
  }

  const tokens = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  // Get Gmail email address
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo = await userInfoRes.json() as { email: string }

  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Upsert into gmail_oauth (keep only one row)
  const { data: existing } = await service.from('gmail_oauth').select('id').limit(1).single()

  if (existing?.id) {
    await service
      .from('gmail_oauth')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry,
        email: userInfo.email,
      })
      .eq('id', existing.id)
  } else {
    await service.from('gmail_oauth').insert({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry,
      email: userInfo.email,
    })
  }

  return NextResponse.redirect(new URL('/admin/reports?gmail=connected', req.url))
}
