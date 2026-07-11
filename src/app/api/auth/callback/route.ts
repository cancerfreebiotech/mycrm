import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase'
import { getOrgSettings } from '@/lib/orgSettings'
import { encryptToken } from '@/lib/tokenCrypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Enforce allowed email domain(s). Source is org settings (allowed_email_domains,
  // comma-separated) with env/hardcoded fallback — same value, editable at runtime.
  const serviceClient = createServiceClient()
  const { allowed_email_domains } = await getOrgSettings(serviceClient, ['allowed_email_domains'])
  const allowedDomains = allowed_email_domains.split(',').map((d) => d.trim()).filter(Boolean)
  const email = data.user.email ?? ''
  if (!allowedDomains.some((d) => email.endsWith(`@${d}`))) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`)
  }

  // Upsert user record (also persist provider_token for Graph API calls).
  // Microsoft Graph tokens are encrypted at rest (AES-256-GCM, see tokenCrypto.ts);
  // getValidProviderToken() decrypts on read.
  const { data: upserted } = await serviceClient.from('users').upsert(
    {
      email,
      display_name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
      last_login_at: new Date().toISOString(),
      ...(data.session?.provider_token ? { provider_token: encryptToken(data.session.provider_token) } : {}),
      ...(data.session?.provider_refresh_token ? { provider_refresh_token: encryptToken(data.session.provider_refresh_token) } : {}),
    },
    { onConflict: 'email' }
  ).select('id').single()

  // Offboarding gate: a suspended member is denied access at login. Suspension is
  // stored on organization_members.status (user_id → public.users.id). This is the
  // ONLY enforcement point — an already-logged-in user who is suspended keeps their
  // session until it expires (≤7 days); suspension takes effect at their next login.
  if (upserted?.id) {
    const { data: suspended } = await serviceClient
      .from('organization_members')
      .select('status')
      .eq('user_id', upserted.id)
      .eq('status', 'suspended')
      .limit(1)
      .maybeSingle()
    if (suspended) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=suspended`)
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
