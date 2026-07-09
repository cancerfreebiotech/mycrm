import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { SUPPORTED_LOCALES } from '@/i18n/config'

// POST /api/profile
// The signed-in user updates their OWN profile preferences.
//
// Why this exists: the `users` table RLS UPDATE policy is `is_super_admin()`, which is
// row-independent — so a regular member updating their own row via the browser client
// matches 0 rows and (silently) saves nothing. Self-service settings therefore must go
// through a service-role write, scoped to the caller's own row by email, with a strict
// field whitelist so it can never be used to change role / email / granted_features.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  // Whitelist: only these self-service preference fields may be written here.
  const update: Record<string, unknown> = {}

  if ('telegramId' in body) {
    const raw = body.telegramId
    if (raw === null || raw === undefined || raw === '') {
      update.telegram_id = null
    } else {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: 'telegram_id must be a positive integer or null' }, { status: 400 })
      }
      update.telegram_id = n
    }
  }

  if ('theme' in body) {
    update.theme = body.theme === 'dark' ? 'dark' : 'light'
  }

  if ('locale' in body) {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(body.locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
    }
    update.locale = body.locale
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('users')
    .update(update)
    .eq('email', user.email)
    .select('id')

  if (error) {
    // telegram_id is UNIQUE — surface a friendly, translatable error key.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'telegram_id_taken' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No matching user row' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
