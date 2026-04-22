import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runHunterBatch } from '@/lib/hunter'

// GET — stats + api key presence
export async function GET() {
  const supabase = createServiceClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [totalRes, neverRes, notFoundRes, thisMonthRes, apiKeyRes] = await Promise.all([
    supabase.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .is('deleted_at', null),
    supabase.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .is('hunter_searched_at', null)
      .is('deleted_at', null),
    supabase.from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('email', null)
      .not('hunter_searched_at', 'is', null)
      .is('deleted_at', null),
    supabase.from('contacts')
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
  const pendingRes = await supabase
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
  const { apiKey } = await req.json()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('system_settings')
    .update({ value: apiKey ?? '' })
    .eq('key', 'hunter_api_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST — trigger Hunter Email Finder batch (up to 100 contacts per call)
export async function POST() {
  const result = await runHunterBatch({ maxContacts: 100 })
  if (result.skipped && result.skipReason === 'no_api_key') {
    return NextResponse.json({ error: 'no_api_key' }, { status: 400 })
  }
  return NextResponse.json(result)
}

// DELETE — reset hunter_searched_at for all contacts without email
export async function DELETE() {
  const supabase = createServiceClient()
  // select('id') on an update returns the affected rows — row count is data.length.
  const { data, error } = await supabase
    .from('contacts')
    .update({ hunter_searched_at: null })
    .is('email', null)
    .not('hunter_searched_at', 'is', null)
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, reset: data?.length ?? 0 })
}
