import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

// POST /api/newsletter/import
//
// Accepts JSON body { manifest, imageMap } produced by the import page after
// browser-side unzip + direct Supabase Storage upload. This bypasses Vercel's
// 4.5MB function body limit (which the previous multipart-zip flow hit when
// users uploaded zips with original-resolution photos).
//
// Body shape:
//   {
//     manifest: <validated against schema in skills/newsletter-composer/manifest-schema.json>,
//     imageMap: { "images/01-foo.jpg": "https://....supabase.co/storage/v1/object/public/...", ... }
//   }
//
// Behavior:
// 1. Auth + newsletter permission gate
// 2. Validate manifest (same rules as before)
// 3. Validate imageMap covers every referenced image_file
// 4. Detect which languages are present in manifest.intro
// 5. For each present lang:
//    - Load skeleton from email_templates
//    - Render stories into sections
//    - Substitute {{subject}}, {{period_label}}, {{intro_html}}, {{stories_html}}
//    - Insert newsletter_campaigns row, status=draft
// 6. Return { campaigns, image_count, story_count }

type Lang = 'zh-TW' | 'en' | 'ja'
type Section = 'last_month' | 'next_month'

type TrilingualText = Partial<Record<Lang, string>>

interface ManifestLink {
  url: string
  label: TrilingualText
}

interface ManifestStory {
  section: Section
  title: TrilingualText
  content_html: TrilingualText
  image_files: string[]
  links?: ManifestLink[]
}

interface Manifest {
  period: string
  intro: TrilingualText
  stories: ManifestStory[]
  promo?: TrilingualText
}

const SKELETON_TITLE: Record<Lang, string> = {
  'zh-TW': 'Newsletter Skeleton — 中文月報',
  'en': 'Newsletter Skeleton — English',
  'ja': 'Newsletter Skeleton — 日本語',
}

const PERIOD_LABEL_FMT: Record<Lang, (p: string) => string> = {
  'zh-TW': (p) => { const [y, m] = p.split('-'); return `${y} 年 ${Number(m)} 月` },
  'en': (p) => {
    const [y, m] = p.split('-')
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${months[Number(m) - 1]} ${y}`
  },
  'ja': (p) => { const [y, m] = p.split('-'); return `${y} 年 ${Number(m)} 月` },
}

const SUBJECT_FMT: Record<Lang, (label: string) => string> = {
  'zh-TW': (label) => `【CancerFree Biotech】${label} 電子報`,
  'en': (label) => `CancerFree Biotech Newsletter — ${label}`,
  'ja': (label) => `CancerFree Biotech ニュースレター ${label}`,
}

const SECTION_LABEL: Record<Section, Record<Lang, string>> = {
  last_month: { 'zh-TW': '上月回顧', 'en': 'Last Month', 'ja': '先月のまとめ' },
  next_month: { 'zh-TW': '下月預告', 'en': 'Coming Up', 'ja': '来月の予定' },
}

const LINKS_LABEL: Record<Lang, string> = {
  'zh-TW': '相關連結', 'en': 'Links', 'ja': '関連リンク',
}

const TITLE_BY_LANG: Record<Lang, (period: string) => string> = {
  'zh-TW': (p) => `${p} 中文月報`,
  'en': (p) => `${p} English Newsletter`,
  'ja': (p) => `${p} 日本語ニュースレター`,
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateTrilingual(v: unknown, fieldPath: string, errors: string[]): v is TrilingualText {
  if (!isPlainObject(v)) { errors.push(`${fieldPath}: expected object`); return false }
  const present = (['zh-TW', 'en', 'ja'] as Lang[]).filter(
    (lang) => typeof v[lang] === 'string' && (v[lang] as string).length > 0
  )
  if (present.length === 0) {
    errors.push(`${fieldPath}: at least one language (zh-TW / en / ja) must have non-empty content`)
    return false
  }
  return true
}

function normalizeImageFile(f: unknown): string | null {
  if (typeof f !== 'string') return null
  // Accept both "images/X" and "X" — normalize to "images/X"
  const stripped = f.replace(/^\.?\/?(images\/)?/, '')
  return `images/${stripped}`
}

function normalizeManifest(raw: unknown): unknown {
  // Accept either:
  //   { stories: [{section, ...}] }                              ← schema
  //   { last_month: [...], next_month: [...] }                   ← Claude.ai often emits this
  // Also normalize image_files to have "images/" prefix.
  if (!isPlainObject(raw)) return raw
  let stories = Array.isArray(raw.stories) ? [...raw.stories] : []
  if (!stories.length && (Array.isArray(raw.last_month) || Array.isArray(raw.next_month))) {
    if (Array.isArray(raw.last_month)) {
      for (const s of raw.last_month) if (isPlainObject(s)) stories.push({ ...s, section: 'last_month' })
    }
    if (Array.isArray(raw.next_month)) {
      for (const s of raw.next_month) if (isPlainObject(s)) stories.push({ ...s, section: 'next_month' })
    }
  }
  stories = stories.map((s) => {
    if (!isPlainObject(s)) return s
    const imgs = Array.isArray(s.image_files) ? s.image_files.map(normalizeImageFile).filter((x): x is string => !!x) : []
    return { ...s, image_files: imgs }
  })
  const out: Record<string, unknown> = { period: raw.period, intro: raw.intro, stories }
  return out
}

function validateManifest(raw: unknown): { ok: true; manifest: Manifest } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isPlainObject(raw)) return { ok: false, errors: ['manifest must be an object'] }

  if (typeof raw.period !== 'string' || !/^\d{4}-\d{2}$/.test(raw.period)) {
    errors.push('period: required, must match YYYY-MM')
  }
  validateTrilingual(raw.intro, 'intro', errors)

  // Optional promo (single-paragraph LINE/Slack promo). Validate if provided.
  if (raw.promo !== undefined && raw.promo !== null) {
    validateTrilingual(raw.promo, 'promo', errors)
  }

  if (!Array.isArray(raw.stories) || raw.stories.length === 0) {
    errors.push('stories: required non-empty array (or use last_month / next_month top-level arrays)')
  } else {
    raw.stories.forEach((s, i) => {
      const path = `stories[${i}]`
      if (!isPlainObject(s)) { errors.push(`${path}: expected object`); return }
      if (s.section !== 'last_month' && s.section !== 'next_month') {
        errors.push(`${path}.section: must be 'last_month' or 'next_month'`)
      }
      validateTrilingual(s.title, `${path}.title`, errors)
      validateTrilingual(s.content_html, `${path}.content_html`, errors)
      // image_files: allow 0-2 (some stories are link-only)
      if (!Array.isArray(s.image_files) || s.image_files.length > 2) {
        errors.push(`${path}.image_files: must be array with 0-2 entries`)
      } else {
        s.image_files.forEach((f, fi) => {
          if (typeof f !== 'string' || !/^images\/[a-z0-9][a-z0-9-_]{0,99}\.(jpg|jpeg|png|webp)$/i.test(f)) {
            errors.push(`${path}.image_files[${fi}]: must match images/<filename>.{jpg,jpeg,png,webp} (got: ${f})`)
          }
        })
      }
      if (s.links !== undefined) {
        if (!Array.isArray(s.links)) {
          errors.push(`${path}.links: must be array if present`)
        } else {
          s.links.forEach((l, li) => {
            if (!isPlainObject(l)) { errors.push(`${path}.links[${li}]: expected object`); return }
            if (typeof l.url !== 'string' || !/^https?:\/\//.test(l.url)) {
              errors.push(`${path}.links[${li}].url: must be http(s) URL`)
            }
            validateTrilingual(l.label, `${path}.links[${li}].label`, errors)
          })
        }
      }
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, manifest: raw as unknown as Manifest }
}

const CONTENT_TAG_ALLOW = /^<\/?(p|strong|em|ul|li|br|a)(\s[^<>]*)?\/?>$/i

function sanitizeContentHtml(html: string): string {
  return html.replace(/<\/?[^>]+>/g, (tag) => (CONTENT_TAG_ALLOW.test(tag) ? tag : ''))
}

function renderLinksHtml(links: ManifestLink[] | undefined, lang: Lang): string {
  if (!links || links.length === 0) return ''
  const items = links
    .map((l) => {
      const label = l.label[lang] ?? Object.values(l.label).find(Boolean) ?? ''
      return `<a href="${escapeHtml(l.url)}" style="color:#0D9488;text-decoration:underline;">${escapeHtml(label)}</a>`
    })
    .join('<br>')
  return `<div style="padding-top:12px;font-size:14px;line-height:1.6;">
<strong style="color:#555;">🔗 ${LINKS_LABEL[lang]}</strong><br>
${items}
</div>`
}

function renderImagesHtml(urls: string[]): string {
  if (urls.length === 0) return ''
  if (urls.length === 1) {
    return `<div style="padding-top:16px;text-align:center;"><img src="${escapeHtml(urls[0])}" alt="" style="max-width:100%;border:0;display:block;margin:0 auto;"></div>`
  }
  return `<div style="padding-top:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">${urls
    .map((u) => `<img src="${escapeHtml(u)}" alt="" style="flex:1;min-width:240px;max-width:48%;border:0;display:block;">`)
    .join('')}</div>`
}

function renderStoryBlock(
  story: ManifestStory,
  storyNumber: number,
  lang: Lang,
  imagePathToUrl: Map<string, string>,
): string {
  const titleForLang = story.title[lang] ?? Object.values(story.title).find(Boolean) ?? ''
  const contentSafe = sanitizeContentHtml(story.content_html[lang] ?? Object.values(story.content_html).find(Boolean) ?? '')
  const imageUrls = story.image_files
    .map((p) => imagePathToUrl.get(p))
    .filter((u): u is string => !!u)
  const imagesHtml = renderImagesHtml(imageUrls)
  const linksHtml = renderLinksHtml(story.links, lang)

  return `<div style="padding:0 24px 24px 24px;">
<h2 style="font-size:20px;font-weight:bold;padding-left:12px;border-left:6px solid #0D9488;line-height:1.4;margin:24px 0 16px 0;color:#262626;">${storyNumber}｜${escapeHtml(titleForLang)}</h2>
<div style="font-size:16px;line-height:1.7;color:#262626;">${contentSafe}</div>
${imagesHtml}
${linksHtml}
</div>`
}

function renderSectionHeading(section: Section, lang: Lang): string {
  return `<div style="padding:8px 24px 0 24px;">
<div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0D9488;border-bottom:1px solid #E5E7EB;padding-bottom:6px;margin-top:24px;">${escapeHtml(SECTION_LABEL[section][lang])}</div>
</div>`
}

function renderStoriesHtml(manifest: Manifest, lang: Lang, imagePathToUrl: Map<string, string>): string {
  const blocks: string[] = []
  let counter = 0
  for (const section of ['last_month', 'next_month'] as Section[]) {
    const storiesInSection = manifest.stories.filter((s) => s.section === section)
    if (storiesInSection.length === 0) continue
    blocks.push(renderSectionHeading(section, lang))
    for (const story of storiesInSection) {
      counter++
      blocks.push(renderStoryBlock(story, counter, lang, imagePathToUrl))
    }
  }
  return blocks.join('\n')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Permission check (same pattern as PermissionGate / src/lib/features.ts)
  const { data: me } = await service
    .from('users')
    .select('id, role, granted_features')
    .ilike('email', user.email)
    .maybeSingle()
  if (!me || !hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], 'newsletter')) {
    return NextResponse.json({ error: 'Forbidden — newsletter permission required' }, { status: 403 })
  }

  // Parse JSON body
  let body: unknown
  try {
    body = await req.json()
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 })
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 })
  }

  const validation = validateManifest(normalizeManifest(body.manifest))
  if (!validation.ok) {
    return NextResponse.json({ error: 'manifest validation failed', details: validation.errors }, { status: 400 })
  }
  const manifest = validation.manifest

  // Validate imageMap covers all referenced images
  const rawMap = body.imageMap
  if (!isPlainObject(rawMap)) {
    return NextResponse.json({ error: 'imageMap missing or not an object' }, { status: 400 })
  }
  const imagePathToUrl = new Map<string, string>()
  for (const [k, v] of Object.entries(rawMap)) {
    if (typeof v !== 'string' || !/^https?:\/\//.test(v)) {
      return NextResponse.json({ error: `imageMap[${k}]: expected http(s) URL` }, { status: 400 })
    }
    imagePathToUrl.set(k, v)
  }
  const referenced = new Set<string>()
  for (const s of manifest.stories) for (const f of s.image_files) referenced.add(f)
  const missing: string[] = []
  for (const f of referenced) if (!imagePathToUrl.has(f)) missing.push(f)
  if (missing.length > 0) {
    return NextResponse.json({ error: 'imageMap missing entries for referenced images', details: missing }, { status: 400 })
  }

  // Determine which languages are present in the manifest
  const ALL_LANGS: Lang[] = ['zh-TW', 'en', 'ja']
  const presentLangs = ALL_LANGS.filter(
    (lang) => typeof manifest.intro[lang] === 'string' && manifest.intro[lang]!.length > 0
  )

  // Load skeletons only for present langs
  const skeletonsByLang: Partial<Record<Lang, string>> = {}
  for (const lang of presentLangs) {
    const { data } = await service
      .from('email_templates')
      .select('body_content')
      .eq('title', SKELETON_TITLE[lang])
      .single()
    if (!data?.body_content) {
      return NextResponse.json({ error: `skeleton not found for ${lang} (title: ${SKELETON_TITLE[lang]})` }, { status: 500 })
    }
    skeletonsByLang[lang] = data.body_content as string
  }

  // Default lists per present lang
  const listIdsByLang: Partial<Record<Lang, string[]>> = {}
  for (const lang of presentLangs) {
    const { data: listRow } = await service
      .from('newsletter_lists')
      .select('id')
      .eq('key', lang)
      .maybeSingle()
    listIdsByLang[lang] = listRow?.id ? [listRow.id] : []
  }

  const results: { lang: Lang; id: string; slug: string; error?: string }[] = []
  const importStamp = Date.now().toString(36)
  // Fallback intro for preview_text: use first available lang's intro
  const firstIntro = manifest.intro[presentLangs[0]]?.replace(/<[^>]+>/g, '').slice(0, 120) ?? null
  for (const lang of presentLangs) {
    try {
      const periodLabel = PERIOD_LABEL_FMT[lang](manifest.period)
      const subject = SUBJECT_FMT[lang](periodLabel)
      const introHtml = sanitizeContentHtml(manifest.intro[lang]!)
      const storiesHtml = renderStoriesHtml(manifest, lang, imagePathToUrl)

      const content = skeletonsByLang[lang]!
        .replaceAll('{{subject}}', escapeHtml(subject))
        .replaceAll('{{period_label}}', escapeHtml(periodLabel))
        .replaceAll('{{intro_html}}', introHtml)
        .replaceAll('{{stories_html}}', storiesHtml)

      const slug = `${manifest.period}-${lang === 'zh-TW' ? 'zh-tw' : lang}-${importStamp}`

      const { data: inserted, error } = await service
        .from('newsletter_campaigns')
        .insert({
          title: TITLE_BY_LANG[lang](manifest.period),
          subject,
          preview_text: firstIntro,
          content_html: content,
          list_ids: listIdsByLang[lang] ?? [],
          status: 'draft',
          slug,
          promo_text: manifest.promo?.[lang] ?? null,
          created_by: me?.id ?? null,
        })
        .select('id, slug')
        .single()

      if (error) throw new Error(error.message)
      results.push({ lang, id: inserted!.id as string, slug: inserted!.slug as string })
    } catch (e) {
      results.push({ lang, id: '', slug: '', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    period: manifest.period,
    image_count: imagePathToUrl.size,
    story_count: manifest.stories.length,
    campaigns: results,
  })
}
