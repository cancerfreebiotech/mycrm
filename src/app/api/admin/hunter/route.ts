import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { runHunterBatch } from '@/lib/hunter'
import { logAdminAction } from '@/lib/adminAudit'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so every
// handler here MUST self-guard. Super-admin only.
// Returns { error } on denial, else { email } of the authenticated super_admin.
async function requireSuperAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: user.email }
}

// GET — stats + api key presence
export async function GET() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const supabase = createServiceClient()
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [totalRes, neverRes, notFoundRes, thisMonthRes, apiKeyRes] = await Promise.all([
    db.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .is('deleted_at', null),
    db.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .is('hunter_searched_at', null)
      .is('deleted_at', null),
    db.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .not('hunter_searched_at', 'is', null)
      .is('deleted_at', null),
    db.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .gte('hunter_searched_at', startOfMonth)
      .is('deleted_at', null),
    supabase.from('system_settings')
      .select('value')
      .eq('key', 'hunter_api_key')
      .single(),
  ])

  // pending = never searched + searched > 30 days ago
  const pendingRes = await db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .is('email', null)
    .is('deleted_at', null)
    .or(`hunter_searched_at.is.null,hunter_searched_at.lt.${thirtyDaysAgo}`)

  // Fetch Hunter.io account credit info
  let credits: { used: number; available: number } | null = null
  const hunterKey = apiKeyRes.data?.value
  if (hunterKey) {
    try {
      const accountRes = await fetch(`https://api.hunter.io/v2/account?api_key=${hunterKey}`)
      if (accountRes.ok) {
        const accountData = await accountRes.json()
        const req = accountData?.data?.requests
        if (req) credits = { used: req.searches?.used ?? 0, available: req.searches?.available ?? 0 }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    totalNoEmail: totalRes.count ?? 0,
    neverSearched: neverRes.count ?? 0,
    searchedNotFound: notFoundRes.count ?? 0,
    searchedThisMonth: thisMonthRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
    hasApiKey: !!hunterKey,
    credits,
  })
}

// PATCH — save API key
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const { apiKey } = await req.json()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('system_settings')
    .update({ value: apiKey ?? '' })
    .eq('key', 'hunter_api_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(supabase, {
    actorEmail: auth.email,
    action: 'hunter_config_change',
    detail: { op: 'save_api_key' },
  })

  return NextResponse.json({ ok: true })
}

// POST — trigger Hunter Email Finder batch (up to 100 contacts per call)
export async function POST() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const result = await runHunterBatch({ maxContacts: 100 })
  if (result.skipped && result.skipReason === 'no_api_key') {
    return NextResponse.json({ error: 'no_api_key' }, { status: 400 })
  }

  await logAdminAction(createServiceClient(), {
    actorEmail: auth.email,
    action: 'hunter_config_change',
    detail: { op: 'run_batch' },
  })

  return NextResponse.json(result)
}

// DELETE — reset hunter_searched_at for all contacts without email
export async function DELETE() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const supabase = createServiceClient()
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  // select('id') on an update returns the affected rows — row count is data.length.
  const { data, error } = await db
    .from('contacts')
    .update({ hunter_searched_at: null })
    .is('email', null)
    .not('hunter_searched_at', 'is', null)
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(supabase, {
    actorEmail: auth.email,
    action: 'hunter_config_change',
    detail: { op: 'reset_searched', reset: data?.length ?? 0 },
  })

  return NextResponse.json({ ok: true, reset: data?.length ?? 0 })
}
