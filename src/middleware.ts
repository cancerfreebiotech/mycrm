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
    pathname.startsWith('/docs') ||
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

  // Redirect unauthenticated users to login
  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from login page
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Pass authenticated user ID to route handlers via request header
  // (response headers are not readable by route handlers — must modify the request)
  if (user) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.id)
    const finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
    // Preserve Supabase session cookies set during auth.getUser()
    supabaseResponse.headers.getSetCookie().forEach((cookie) => {
      finalResponse.headers.append('Set-Cookie', cookie)
    })
    return finalResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
