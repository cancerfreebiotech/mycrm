import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// GET /api/me — returns current logged-in user's public.users profile.
// WARNING: auth.users.id does NOT equal public.users.id in this project,
// so we MUST look up by email (case-insensitive). Historical bug: querying
// by id returned empty profile → role was always empty → UI permission
// checks for super_admin all failed silently.
export async function GET() {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, display_name, role, ai_model_id')
    .ilike('email', user.email)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  return NextResponse.json({
    id: data.id as string,
    display_name: (data.display_name ?? '') as string,
    role: (data.role ?? '') as string,
    ai_model_id: (data.ai_model_id ?? null) as string | null,
  })
}
