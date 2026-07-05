import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// Resolve the caller's public.users.id from their auth email.
// In this project auth.users.id !== public.users.id, so we always look up by email.
async function resolveUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data } = await service
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  return data?.id ?? null
}

// GET /api/saved-views — list the current user's saved views (newest first)
export async function GET() {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data, error } = await db
    .from('saved_views')
    .select('id, name, params, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ views: data ?? [] })
}

// POST /api/saved-views — create a named view for the current user
export async function POST(req: NextRequest) {
  const userId = await resolveUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, params } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name_required' }, { status: 400 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data, error } = await db
    .from('saved_views')
    .insert({ user_id: userId, name: name.trim(), params: params ?? {} })
    .select('id, name, params, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ view: data })
}
