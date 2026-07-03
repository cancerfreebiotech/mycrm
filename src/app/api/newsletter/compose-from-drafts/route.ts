import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { refineProseZh, translateStory, generatePromoText } from '@/lib/newsletter-ai'
import { composeNewsletter, type NewsletterStory } from '@/lib/newsletter-compose'
import { fetchUrlContext } from '@/lib/fetch-url-context'

// POST /api/newsletter/compose-from-drafts
//   Body (preview): { period: 'YYYY-MM', action: 'preview' }
//   Body (commit):  { period: 'YYYY-MM', action: 'commit' }
//
// Flow:
//   action='preview':
//     1. Authz: newsletter feature or super_admin
//     2. Load drafts for period
//     3. AI refine zh + translate to en/ja + generate promo
//     4. Cache result in newsletter_compose_cache (so commit can re-use it)
//     5. Return HTML + metadata
//
//   action='commit':
//     1. Authz
//     2. Read latest cache row for this period (must be < 30 min old; otherwise 409)
//     3. INSERT 3 newsletter_campaigns from cached payload
//     4. Mark drafts status='used'
//     5. Delete the cache row
//
// Important: commit does NOT re-run AI — Gemini is non-deterministic so the
// committed content would diverge from what the user previewed.

const SECTION_LABELS = {
  'zh-TW': { last: '上月回顧', next: '本月預告' },
  en: { last: 'Last Month', next: 'This Month' },
  ja: { last: '先月の振り返り', next: '今月の予告' },
}

const MONTH_LABEL = {
  'zh-TW': (p: string) => {
    const [y, m] = p.split('-')
    return `${y}年${parseInt(m, 10)}月`
  },
  en: (p: string) => {
    const [y, m] = p.split('-')
    const month = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][parseInt(m, 10)]
    return `${y} ${month}`
  },
  ja: (p: string) => {
    const [y, m] = p.split('-')
    return `${y}年${parseInt(m, 10)}月号`
  },
} as const

type Lang = 'zh-TW' | 'en' | 'ja'

async function authorize() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('users').select('id, role, granted_features').eq('email', user.email).single()
  if (!profile) return null
  if (!hasFeature(profile.role, profile.granted_features ?? [], 'newsletter')) return null
  return { userId: profile.id }
}

type DraftSection = 'last_month' | 'next_month' | 'highlight'

interface DraftRow {
  id: string
  section: DraftSection
  title: string | null
  content: string | null
  event_date: string | null
  event_date_end: string | null
  photo_urls: string[]
  links: Array<{ url: string; label?: string }>
  position: number
}

interface StoryTrilingual {
  draftId: string
  section: DraftSection
  zh: { title: string; paragraphs_html: string }
  en: { title: string; paragraphs_html: string }
  ja: { title: string; paragraphs_html: string }
  image_url: string | null
  link_html: string | null
}

// Render a highlight story as standalone HTML (no number prefix, with optional
// image). Inlined here so we don't have to expand the public composeNewsletter API.
function renderHighlightHtml(story: StoryTrilingual, langKey: 'zh' | 'en' | 'ja'): string {
  const s = story[langKey]
  const title = s.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const imgHtml = story.image_url
    ? `<div style="padding:12px 0;text-align:center"><img src="${story.image_url.replace(/"/g, '&quot;')}" alt="${title}" style="max-width:100%;border:none;display:inline-block"/></div>`
    : ''
  return `<div style="margin:0 0 16px 0">
    <p style="margin:0 0 8px 0;font-size:18px;color:#0D9488"><strong>📌 ${title}</strong></p>
    ${s.paragraphs_html}
    ${story.link_html ?? ''}
    ${imgHtml}
  </div>`
}

function pickFirstLink(links: DraftRow['links']): string | null {
  if (!links || links.length === 0) return null
  const l = links[0]
  if (!l.url) return null
  return `<p style="margin:0">🔗｜<a href="${l.url}" target="_blank">${l.label ?? l.url}</a></p>`
}

export async function POST(req: NextRequest) {
  const auth = await authorize()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { period: string; action: 'preview' | 'commit'; force?: boolean }
  const { period, action, force } = body
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }
  if (action !== 'preview' && action !== 'commit') {
    return NextResponse.json({ error: "action must be 'preview' or 'commit'" }, { status: 400 })
  }

  const service = createServiceClient()

  // ── action='commit': read cached preview, INSERT campaigns, mark drafts used
  if (action === 'commit') {
    // Atomically CLAIM the freshest recent cache row (delete-returning) so two
    // concurrent commits can't both insert campaigns from the same preview.
    const { data: claimedRows, error: cacheErr } = await service
      .from('newsletter_compose_cache')
      .delete()
      .eq('period', period)
      .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())  // < 30 min old
      .select('id, payload, created_at')
    if (cacheErr) return NextResponse.json({ error: cacheErr.message }, { status: 500 })
    const cached = (claimedRows ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
    if (!cached) {
      return NextResponse.json({ error: 'No recent preview to commit. Run preview first.' }, { status: 409 })
    }
    const payload = cached.payload as {
      story_ids: string[]
      preview: Record<Lang, { html: string; subject: string; promo: string }>
    }
    // Re-check the drafts: refuse to commit if any story was deleted or removed
    // since the preview (otherwise deleted content ships and its status flips to used).
    const { data: liveDrafts } = await service
      .from('newsletter_drafts').select('id, status').in('id', payload.story_ids)
    const liveOk = new Set((liveDrafts ?? []).filter((d) => d.status !== 'deleted').map((d) => d.id as string))
    if (payload.story_ids.some((id) => !liveOk.has(id))) {
      return NextResponse.json({ error: 'Some stories were deleted or changed since the preview — re-generate before committing.' }, { status: 409 })
    }
    const langs: Lang[] = ['zh-TW', 'en', 'ja']
    const rows = langs.map((lang) => ({
      title: payload.preview[lang].subject,
      subject: payload.preview[lang].subject,
      content_html: payload.preview[lang].html,
      promo_text: payload.preview[lang].promo,
      status: 'draft' as const,
      created_by: auth.userId,
    }))
    const { data: created, error: insErr } = await service
      .from('newsletter_campaigns').insert(rows).select('id, title')
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    const { error: usedErr } = await service
      .from('newsletter_drafts').update({ status: 'used' }).in('id', payload.story_ids).neq('status', 'deleted')
    if (usedErr) console.error('[compose commit] mark-used failed:', usedErr.message)
    return NextResponse.json({ campaigns: created, story_count: payload.story_ids.length })
  }

  // ── action='preview' ────────────────────────────────────────────────────
  const { data: drafts, error } = await service
    .from('newsletter_drafts')
    .select('id, section, title, content, event_date, event_date_end, photo_urls, links, position')
    .eq('period', period)
    .in('status', ['draft', 'approved'])
    .order('section')
    .order('position')
    .order('event_date', { nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ error: 'No drafts for this period' }, { status: 400 })
  }

  // Filter out drafts missing title/content
  const valid = (drafts as DraftRow[]).filter((d) => d.title && d.content)
  // Drafts with a title but no content are dropped (the model has nothing to write
  // from). Report them so the UI can tell the user which stories were left out,
  // instead of a section silently going missing.
  const skipped = (drafts as DraftRow[])
    .filter((d) => !(d.title && d.content))
    .map((d) => ({ title: d.title, section: d.section }))
  if (valid.length === 0) {
    return NextResponse.json({ error: 'No drafts have both title and content yet' }, { status: 400 })
  }

  // Load period meta (custom section labels). Falls back to defaults below.
  const { data: meta } = await service
    .from('newsletter_period_meta')
    .select('label_last, label_next')
    .eq('period', period)
    .maybeSingle()
  const customLabelLast = meta?.label_last?.trim() || ''
  const customLabelNext = meta?.label_next?.trim() || ''

  // Check cache: if a fresh preview exists with the exact same story set, reuse it.
  // This avoids re-running Gemini (21+ calls) when user cancels and re-opens.
  // `force: true` bypasses the cache for explicit "regenerate".
  if (!force) {
    const validIdsSorted = valid.map((d) => d.id).sort().join(',')
    const { data: existingCache } = await service
      .from('newsletter_compose_cache')
      .select('id, payload, created_at')
      .eq('period', period)
      .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingCache) {
      const cached = existingCache.payload as {
        story_ids: string[]
        preview: Record<Lang, { html: string; subject: string; promo: string }>
      }
      const cachedIdsSorted = [...cached.story_ids].sort().join(',')
      if (cachedIdsSorted === validIdsSorted) {
        // Refresh timestamp so commit (which also requires < 30 min) sees a
        // fresh row even if the user takes their time reviewing the preview.
        await service.from('newsletter_compose_cache')
          .update({ created_at: new Date().toISOString() })
          .eq('id', existingCache.id)
        return NextResponse.json({
          preview: cached.preview,
          story_count: cached.story_ids.length,
          from_cache: true,
          cached_at: existingCache.created_at,
          skipped,
        })
      }
    }
  }

  // AI pipeline: refine zh → translate to en + ja
  // Run stories in parallel for speed (each story = 3 sequential calls but stories parallel)
  const trilingual: StoryTrilingual[] = await Promise.all(
    valid.map(async (d) => {
      // If story has a link, fetch its content and prepend to the AI prompt
      // so the model has actual destination material to write from (instead
      // of seeing only "見以下連結" with no substance).
      const firstUrl = d.links?.[0]?.url
      const linkContext = firstUrl ? await fetchUrlContext(firstUrl) : ''
      const enrichedContent = linkContext
        ? `【連結內容參考（自動抓取）】\n${linkContext}\n\n【原始素材】\n${d.content!}`
        : d.content!

      const dateLabel = d.event_date_end && d.event_date && d.event_date_end > d.event_date
        ? `${d.event_date} – ${d.event_date_end}`
        : d.event_date
      const zh = await refineProseZh({ title: d.title!, content: enrichedContent, event_date: dateLabel })
      const [en, ja] = await Promise.all([
        translateStory(zh, 'en'),
        translateStory(zh, 'ja'),
      ])
      return {
        draftId: d.id,
        section: d.section,
        zh, en, ja,
        image_url: d.photo_urls?.[0] ?? null,
        link_html: pickFirstLink(d.links),
      }
    })
  )

  // Split out the (at most one) highlight story — it renders at the very top
  // of the newsletter, not in the upcoming/recap columns.
  const highlightStory = trilingual.find((s) => s.section === 'highlight') ?? null

  // Build per-lang inputs to composeNewsletter
  async function buildOneLang(lang: Lang): Promise<{ html: string; subject: string; promo: string }> {
    const langKey = lang === 'zh-TW' ? 'zh' : lang
    const upcoming = trilingual.filter((s) => s.section === 'next_month').map((s): NewsletterStory => ({
      title: s[langKey as 'zh' | 'en' | 'ja'].title,
      paragraphs_html: s[langKey as 'zh' | 'en' | 'ja'].paragraphs_html,
      link_html: s.link_html ?? undefined,
      image: s.image_url ? { url: s.image_url, alt: s[langKey as 'zh' | 'en' | 'ja'].title } : undefined,
    }))
    const recap = trilingual.filter((s) => s.section === 'last_month').map((s): NewsletterStory => ({
      title: s[langKey as 'zh' | 'en' | 'ja'].title,
      paragraphs_html: s[langKey as 'zh' | 'en' | 'ja'].paragraphs_html,
      link_html: s.link_html ?? undefined,
      image: s.image_url ? { url: s.image_url, alt: s[langKey as 'zh' | 'en' | 'ja'].title } : undefined,
    }))
    const monthLabel = MONTH_LABEL[lang](period)
    const defaults = SECTION_LABELS[lang]
    // Custom labels (if set on newsletter_period_meta) apply to ALL languages —
    // we only store one label per section, not 3-language translations.
    const labels = {
      last: customLabelLast || defaults.last,
      next: customLabelNext || defaults.next,
    }
    const promoTitles = trilingual.slice(0, 3).map((s) => s[langKey as 'zh' | 'en' | 'ja'].title)
    const promo = await generatePromoText(period, promoTitles, lang)
    const subject = lang === 'zh-TW'
      ? `CancerFree 電子報 ${monthLabel}`
      : lang === 'en'
        ? `CancerFree Newsletter — ${monthLabel}`
        : `CancerFree ニュースレター ${monthLabel}`

    const { html } = await composeNewsletter({
      language: lang,
      subject,
      month_label: monthLabel,
      upcoming_title: labels.next,
      intro_html: highlightStory ? renderHighlightHtml(highlightStory, langKey as 'zh' | 'en' | 'ja') : '',
      upcoming_stories: upcoming,
      recap_title: labels.last,
      recap_stories: recap,
      logo_url: process.env.NEWSLETTER_LOGO_URL ?? 'https://gaxjgcztzfxokesiraai.supabase.co/storage/v1/object/public/newsletter-assets/branding/cancerfree-logo.png',
      substack_url: '',
      facebook_url: 'https://www.facebook.com/cancerfreebio',
      linkedin_url: 'https://www.linkedin.com/company/cancerfree-biotech',
      website_url: 'https://www.cancerfree.io',
    })
    return { html, subject, promo }
  }

  const [zh, en, ja] = await Promise.all([
    buildOneLang('zh-TW'),
    buildOneLang('en'),
    buildOneLang('ja'),
  ])

  // Cache the AI result so commit doesn't re-run (Gemini is non-deterministic
  // and the user would commit a different output than what they previewed).
  const previewPayload = {
    story_ids: valid.map((d) => d.id),
    preview: { 'zh-TW': zh, en, ja },
  }
  const { error: cacheInsertErr } = await service
    .from('newsletter_compose_cache')
    .insert({
      period,
      created_by: auth.userId,
      payload: previewPayload,
    })
  if (cacheInsertErr) {
    // Don't fail the whole preview — user still sees the result. But surface
    // the error in logs so silent FK / schema issues don't hide again.
    console.error('newsletter_compose_cache insert failed:', cacheInsertErr.message)
  }

  return NextResponse.json({
    preview: { 'zh-TW': zh, en, ja },
    story_count: trilingual.length,
    story_titles: trilingual.map((s) => ({ zh: s.zh.title, en: s.en.title, ja: s.ja.title })),
    skipped,
  })
}

export const maxDuration = 300
