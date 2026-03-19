import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'cancerfree.io'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Enforce cancerfree.io domain only
  const email = data.user.email ?? ''
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`)
  }

  // Upsert user record (also persist provider_token for Graph API calls)
  const serviceClient = createServiceClient()
  await serviceClient.from('users').upsert(
    {
      email,
      display_name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
      last_login_at: new Date().toISOString(),
      ...(data.session?.provider_token ? { provider_token: data.session.provider_token } : {}),
      ...(data.session?.provider_refresh_token ? { provider_refresh_token: data.session.provider_refresh_token } : {}),
    },
    { onConflict: 'email' }
  )

  return NextResponse.redirect(`${origin}/`)
}
