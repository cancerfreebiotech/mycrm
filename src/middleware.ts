import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Early return BEFORE Supabase for routes that don't need auth
  if (
    pathname.startsWith('/api/bot') ||
    pathname.startsWith('/api/teams-bot') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/sendgrid') ||
    pathname === '/api/set-locale' ||
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/unsubscribe')
  ) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/login'
  const isMaintenancePage = pathname === '/maintenance'

  // Redirect unauthenticated users to login
  if (!user && !isLoginPage && !isMaintenancePage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from login page
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Maintenance mode check for authenticated non-super_admin users
  if (user && !isLoginPage && !isMaintenancePage) {
    const { data: setting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .single()

    if (setting?.value === 'true') {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('email', user.email!)
        .single()

      if (profile?.role !== 'super_admin') {
        return NextResponse.redirect(new URL('/maintenance', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
