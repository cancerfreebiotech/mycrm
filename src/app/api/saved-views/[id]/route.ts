import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// DELETE /api/saved-views/[id] — delete a saved view (owner only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data: profile } = await service
    .from('users')
    .select('id')
    .eq('email', user.email)
    .single()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership check: only the owner may delete their view.
  const { data: view } = await db
    .from('saved_views')
    .select('id, user_id')
    .eq('id', id)
    .single()
  if (!view) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (view.user_id !== profile.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('saved_views').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
