import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'
import { ORG_SETTING_KEYS, ORG_SETTING_KEY_LIST, type OrgSettingKey } from '@/lib/orgSettings'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so this
// handler MUST self-guard. Super-admin only.
async function requireSuperAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: user.email }
}

// GET — current stored value + fallback for each org setting key.
export async function GET() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ORG_SETTING_KEY_LIST)
  const stored = new Map<string, unknown>((data ?? []).map((r) => [r.key as string, r.value]))

  const settings = Object.fromEntries(
    ORG_SETTING_KEY_LIST.map((key) => {
      const raw = stored.get(key)
      return [key, {
        value: typeof raw === 'string' ? raw : '',
        fallback: ORG_SETTING_KEYS[key],
      }]
    })
  )

  return NextResponse.json({ settings })
}

// POST — upsert org settings. Body: { settings: { [key]: string } }.
// Unknown keys are ignored; a blank value falls back to the built-in default.
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error

  let body: { settings?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = body.settings ?? {}

  const rows = ORG_SETTING_KEY_LIST
    .filter((key): key is OrgSettingKey => key in input)
    .map((key) => ({
      key,
      value: String(input[key] ?? '').trim(),
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(supabase, {
    actorEmail: auth.email,
    action: 'org_settings_change',
    detail: { keys: rows.map((r) => r.key) },
  })

  return NextResponse.json({ ok: true })
}
