import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext } from '@/lib/orgContext'

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
    .select('id, display_name, role')
    .ilike('email', user.email)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // 已完成 auth 且解析過 users → 傳入已知身分，省去 getOrgContext 內重複的
  // auth.getUser() + users 查詢（hot endpoint）
  const ctx = await getOrgContext({ email: user.email, userId: data.id as string })

  return NextResponse.json({
    id: data.id as string,
    display_name: (data.display_name ?? '') as string,
    role: (data.role ?? '') as string,
    org_id: ctx.orgId,
  })
}
