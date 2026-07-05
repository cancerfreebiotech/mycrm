import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

// POST — toggle published_at; body: { published: boolean }
// Published campaigns appear in /api/newsletter/feed.xml for Substack RSS importer.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { published?: boolean }
  const published = body.published !== false // default true

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data, error } = await db
    .from('newsletter_campaigns')
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id, published_at, slug')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
