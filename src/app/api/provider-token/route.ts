import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getValidProviderToken } from '@/lib/graph'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { createServiceClient } = await import('@/lib/supabase')
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('id').eq('email', user.email!).single()
  if (!profile?.id) return NextResponse.json({ error: '找不到使用者' }, { status: 404 })

  try {
    const token = await getValidProviderToken(profile.id)
    return NextResponse.json({ token })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '無法取得存取憑證' }, { status: 400 })
  }
}
