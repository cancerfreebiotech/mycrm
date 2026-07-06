import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { ORG_SETTING_KEYS, ORG_SETTING_KEY_LIST, getOrgSettings } from '@/lib/orgSettings'

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

// GET — current effective value + fallback for each org setting key.
export async function GET() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const service = createServiceClient()
  const ctx = await getOrgContext()

  // Effective value walks the new resolution chain (org jsonb → system_settings → fallback).
  const values = await getOrgSettings(service, ORG_SETTING_KEY_LIST, ctx.orgId)

  const settings = Object.fromEntries(
    ORG_SETTING_KEY_LIST.map((key) => [key, {
      value: values[key],
      fallback: ORG_SETTING_KEYS[key],
    }])
  )

  return NextResponse.json({ settings })
}

// POST — merge submitted key/value pairs into organizations.settings (jsonb) for
// the caller's org. system_settings is no longer written; its legacy values remain
// as a read fallback. Unknown keys are ignored; a blank value falls back to the
// built-in default via the resolution chain.
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error

  let body: { settings?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = body.settings ?? {}

  const patch: Record<string, string> = {}
  for (const key of ORG_SETTING_KEY_LIST) {
    if (key in input) patch[key] = String(input[key] ?? '').trim()
  }
  const keys = Object.keys(patch)

  if (keys.length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  const ctx = await getOrgContext()
  const service = createServiceClient()

  // settings = settings || patch — read current jsonb, merge, write back.
  const { data: org, error: readError } = await service
    .from('organizations')
    .select('settings')
    .eq('id', ctx.orgId)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })

  const merged = { ...((org?.settings ?? {}) as Record<string, unknown>), ...patch }

  const { error } = await service
    .from('organizations')
    .update({ settings: merged })
    .eq('id', ctx.orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const db = orgScopedClient(ctx)
  await logAdminAction(db, {
    actorEmail: auth.email,
    action: 'org_settings_change',
    detail: { keys },
  })

  return NextResponse.json({ ok: true })
}
