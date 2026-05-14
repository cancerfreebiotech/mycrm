import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

// GET /api/newsletter/drafts/export?period=2026-05
//
// Returns RAW (single-language zh-TW) draft data — for piping into the
// Claude.ai newsletter-composer skill, which will then do the trilingual
// refine/translate/zip. Phase 2 server-side AI uses the same data shape.

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('id, role, granted_features').eq('email', user.email).single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return true
}

export async function GET(req: NextRequest) {
  if (!await authorize()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const period = req.nextUrl.searchParams.get('period')
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('newsletter_drafts')
    .select('id, section, title, content, event_date, photo_urls, links, position')
    .eq('period', period)
    .in('status', ['draft', 'approved'])
    .order('section')
    .order('event_date', { nullsFirst: false })
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    period,
    exported_at: new Date().toISOString(),
    drafts: data ?? [],
    note: 'Single-language zh-TW raw drafts. Feed to Claude.ai newsletter-composer skill, which will do refine + translate + zip.',
  })
}
