import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

// POST /api/newsletter/campaigns/[id]/promo-batch
//
// Apply promo_text in three languages to the three sibling campaigns that
// were created together (e.g. by the newsletter-composer skill import).
// Siblings are detected by slug pattern: `<period>-<lang>-<stamp>`.
// Caller passes ANY of the 3 sibling campaign ids; we derive period + stamp
// from its slug and PATCH all three promo_text fields.

const LANG_TO_SLUG: Record<'zh-TW' | 'en' | 'ja', string> = {
  'zh-TW': 'zh-tw',
  'en': 'en',
  'ja': 'ja',
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('id, role, granted_features')
    .ilike('email', user.email)
    .maybeSingle()
  if (!me || !hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], 'newsletter')) {
    return NextResponse.json({ error: 'Forbidden — newsletter permission required' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    promo?: { 'zh-TW'?: string | null; en?: string | null; ja?: string | null }
  }
  const promo = body.promo
  if (!promo || (typeof promo['zh-TW'] !== 'string' && typeof promo.en !== 'string' && typeof promo.ja !== 'string')) {
    return NextResponse.json({ error: 'promo with at least one of zh-TW / en / ja required' }, { status: 400 })
  }

  // Fetch current campaign, derive period + stamp from slug
  const { data: current } = await service
    .from('newsletter_campaigns')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle()
  if (!current?.slug) return NextResponse.json({ error: 'campaign or slug not found' }, { status: 404 })

  // Slug shape: `${period}-${langKey}-${stamp}` e.g. "2026-05-zh-tw-moo2zn4z"
  // period = first 7 chars (YYYY-MM)
  // langKey = "zh-tw" | "en" | "ja"
  // stamp = remainder after the lang key
  const slug = current.slug as string
  const m = slug.match(/^(\d{4}-\d{2})-(zh-tw|en|ja)-(.+)$/i)
  if (!m) {
    return NextResponse.json({ error: `cannot parse slug "${slug}" — expected period-lang-stamp` }, { status: 400 })
  }
  const period = m[1]
  const stamp = m[3]

  // Update siblings per lang
  const results: { lang: string; updated: boolean; error?: string }[] = []
  for (const lang of ['zh-TW', 'en', 'ja'] as const) {
    const text = promo[lang]
    if (typeof text !== 'string') {
      results.push({ lang, updated: false })
      continue
    }
    const targetSlug = `${period}-${LANG_TO_SLUG[lang]}-${stamp}`
    const { error } = await service
      .from('newsletter_campaigns')
      .update({ promo_text: text.trim() || null })
      .eq('slug', targetSlug)
    if (error) {
      results.push({ lang, updated: false, error: error.message })
    } else {
      results.push({ lang, updated: true })
    }
  }

  return NextResponse.json({ ok: true, period, stamp, results })
}
