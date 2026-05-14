import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { refineProseZh, translateStory, generatePromoText } from '@/lib/newsletter-ai'
import { composeNewsletter, type NewsletterStory } from '@/lib/newsletter-compose'

// POST /api/newsletter/compose-from-drafts
//   Body: { period: 'YYYY-MM', action: 'preview' | 'commit' }
//
// Flow:
//   1. Authz: newsletter feature or super_admin
//   2. Load drafts for period (sorted by section + event_date + position)
//   3. AI refine zh prose for each story (Pro model)
//   4. AI translate to en + ja (Lite model)
//   5. AI generate promo text x 3 langs (Lite model)
//   6. Compose 3 final HTMLs via existing newsletter-compose lib
//   7. action='preview' → return HTML + metadata
//      action='commit'  → INSERT 3 newsletter_campaigns + mark drafts status='used'

const SECTION_LABELS = {
  'zh-TW': { last: '上月回顧', next: '下月預告' },
  en: { last: 'Last Month', next: 'Next Month' },
  ja: { last: '先月の振り返り', next: '来月の予告' },
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

interface DraftRow {
  id: string
  section: 'last_month' | 'next_month'
  title: string | null
  content: string | null
  event_date: string | null
  photo_urls: string[]
  links: Array<{ url: string; label?: string }>
  position: number
}

interface StoryTrilingual {
  draftId: string
  section: 'last_month' | 'next_month'
  zh: { title: string; paragraphs_html: string }
  en: { title: string; paragraphs_html: string }
  ja: { title: string; paragraphs_html: string }
  image_url: string | null
  link_html: string | null
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

  const { period, action } = await req.json() as { period: string; action: 'preview' | 'commit' }
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period required (YYYY-MM)' }, { status: 400 })
  }
  if (action !== 'preview' && action !== 'commit') {
    return NextResponse.json({ error: "action must be 'preview' or 'commit'" }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: drafts, error } = await service
    .from('newsletter_drafts')
    .select('id, section, title, content, event_date, photo_urls, links, position')
    .eq('period', period)
    .in('status', ['draft', 'approved'])
    .order('section')
    .order('event_date', { nullsFirst: false })
    .order('position')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ error: 'No drafts for this period' }, { status: 400 })
  }

  // Filter out drafts missing title/content
  const valid = (drafts as DraftRow[]).filter((d) => d.title && d.content)
  if (valid.length === 0) {
    return NextResponse.json({ error: 'No drafts have both title and content yet' }, { status: 400 })
  }

  // AI pipeline: refine zh → translate to en + ja
  // Run stories in parallel for speed (each story = 3 sequential calls but stories parallel)
  const trilingual: StoryTrilingual[] = await Promise.all(
    valid.map(async (d) => {
      const zh = await refineProseZh({ title: d.title!, content: d.content!, event_date: d.event_date })
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
    const labels = SECTION_LABELS[lang]
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
      intro_html: '',
      upcoming_stories: upcoming,
      recap_title: labels.last,
      recap_stories: recap,
      logo_url: 'https://cancerfree.io/logo.png',
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

  if (action === 'preview') {
    return NextResponse.json({
      preview: { 'zh-TW': zh, en, ja },
      story_count: trilingual.length,
      story_titles: trilingual.map((s) => ({ zh: s.zh.title, en: s.en.title, ja: s.ja.title })),
    })
  }

  // ── action === 'commit' ───────────────────────────────────────────────────
  // INSERT 3 newsletter_campaigns rows
  const rows = ([
    ['zh-TW', zh],
    ['en', en],
    ['ja', ja],
  ] as Array<[Lang, { html: string; subject: string; promo: string }]>)
    .map(([lang, r]) => ({
      title: r.subject,
      subject: r.subject,
      content_html: r.html,
      promo_text: r.promo,
      status: 'draft' as const,
      created_by: auth.userId,
    }))

  const { data: created, error: insErr } = await service
    .from('newsletter_campaigns').insert(rows).select('id, title')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Mark drafts as used
  await service.from('newsletter_drafts').update({ status: 'used' })
    .in('id', valid.map((d) => d.id))

  return NextResponse.json({
    campaigns: created,
    story_count: trilingual.length,
  })
}
