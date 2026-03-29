import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// GET /api/contacts/trash — 列出所有軟刪除聯絡人（僅 super_admin）
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await service
    .from('contacts')
    .select(`
      id, name, name_en, company, email, deleted_at,
      deleted_by_user:users!contacts_deleted_by_fkey(display_name)
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contacts: data ?? [] })
}
