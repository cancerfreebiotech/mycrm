import { NextRequest, NextResponse } from 'next/server'
import Portkey from 'portkey-ai'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST /api/newsletter/ai-compose
//
// Input: Chinese outline + stories (title/outline/optional image/links).
// Output: 1-3 newsletter_campaigns drafts (zh-TW always; en + ja if translate=true).
// Each draft is rendered from the matching skeleton template with AI-generated
// section HTML injected. Tone is taken from newsletter_tone_samples (few-shot).
//
// Caller then redirects to /admin/newsletter/quick-send/<zh-id> to edit.

interface Story {
  title_zh: string
  outline_zh: string
  image_url?: string | null
  links?: { url: string; label: string }[]
}

interface ComposeRequest {
  period: string                   // "2026-05"
  period_label_zh?: string          // optional override
  intro_zh?: string                 // optional
  stories: Story[]
  translate?: boolean               // default true → also generate en + ja
}

type Lang = 'zh-TW' | 'en' | 'ja'

const SKELETON_TITLE: Record<Lang, string> = {
  'zh-TW': 'Newsletter Skeleton — 中文月報',
  'en': 'Newsletter Skeleton — English',
  'ja': 'Newsletter Skeleton — 日本語',
}

const PERIOD_LABEL_FMT: Record<Lang, (period: string) => string> = {
  'zh-TW': (p) => { const [y, m] = p.split('-'); return `${y} 年 ${Number(m)} 月` },
  'en': (p) => {
    const [y, m] = p.split('-')
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${months[Number(m) - 1]} ${y}`
  },
  'ja': (p) => { const [y, m] = p.split('-'); return `${y} 年 ${Number(m)} 月` },
}

const UI_LABELS: Record<Lang, { upcoming: string; detailed: string; links: string }> = {
  'zh-TW': { upcoming: '重點', detailed: '活動', links: '相關連結' },
  'en': { upcoming: 'Highlights', detailed: 'Events', links: 'Links' },
  'ja': { upcoming: 'ハイライト', detailed: 'イベント', links: '関連リンク' },
}

async function generateWithGemini(prompt: string): Promise<string> {
  const portkey = new Portkey({
    apiKey: process.env.PORTKEY_API_KEY!,
    config: process.env.PORTKEY_CONFIG_ID!,
  })
  const result = await portkey.chat.completions.create({
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = result.choices?.[0]?.message?.content
  return (typeof raw === 'string' ? raw : '').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:html)?\s*/, '').replace(/\s*```$/, '').trim()
}

function buildStoryPrompt(lang: Lang, story: Story, toneSamples: string[]): string {
  const targetLangName = lang === 'zh-TW' ? '繁體中文' : lang === 'en' ? 'English' : '日本語'
  const toneContext = toneSamples.length > 0
    ? `以下是過去的電子報段落，請模仿這個語氣（正式、友善、專業、不要過度行銷話術）:\n\n---\n${toneSamples.map((s, i) => `範例 ${i + 1}:\n${s}`).join('\n\n')}\n---\n\n`
    : ''
  return `${toneContext}請用上面語氣，以 ${targetLangName} 改寫並擴展下方「故事大綱」成電子報段落。

要求:
- 輸出純 HTML（不要 markdown、不要 code fence、不要 <html>/<body>）
- 只用 <p>、<strong>、<em>、<ul>/<li>、<br> 等基本標籤
- 段落之間用 <p> 分隔，不要用多個 <br>
- 字數 200-400 字（${targetLangName}），讓內容豐富但不冗長
- 不要加自己的 <h2> 標題或圖片標籤，那些會由系統另外插入
- 保持 CancerFree Biotech 的專業語氣

故事標題（參考，不要重複輸出）: ${story.title_zh}

故事大綱:
${story.outline_zh}`
}

function buildIntroPrompt(lang: Lang, period: string, introZh: string, toneSamples: string[]): string {
  const targetLangName = lang === 'zh-TW' ? '繁體中文' : lang === 'en' ? 'English' : '日本語'
  const toneContext = toneSamples.length > 0
    ? `過往電子報開場風格範例:\n${toneSamples.map((s) => s).join('\n---\n')}\n\n`
    : ''
  return `${toneContext}請以 ${targetLangName} 為 ${period} 電子報寫開場段落（200 字內）。風格請模仿上面範例，簡短介紹本月重點。

開場大綱:
${introZh}

輸出要求:
- 純 HTML，只用 <p>, <strong>, <em>, <br>
- 不要 <h1>/<h2> 標題
- 不要 markdown, code fence
- 不要重複故事細節（細節在下面的段落會寫）`
}

async function loadToneSamples(lang: Lang): Promise<string[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('newsletter_tone_samples')
    .select('plain_text')
    .eq('language', lang)
    .order('period', { ascending: false })
    .limit(2)
  return (data ?? [])
    .map((r: { plain_text: string }) => r.plain_text)
    .filter((t) => t && t.length > 100)
    .map((t) => t.slice(0, 3000)) // cap per sample to control token count
}

async function loadSkeleton(lang: Lang): Promise<string> {
  const service = createServiceClient()
  const { data } = await service
    .from('email_templates')
    .select('body_content')
    .eq('title', SKELETON_TITLE[lang])
    .single()
  if (!data?.body_content) throw new Error(`skeleton not found for ${lang}`)
  return data.body_content as string
}

function renderStoryBlock(story: Story, index: number, generatedHtml: string, lang: Lang, titleForLang: string): string {
  const labels = UI_LABELS[lang]
  let linksHtml = ''
  if (story.links && story.links.length > 0) {
    linksHtml = `<div style="padding-top:12px;font-size:14px;line-height:1.6;">
      <strong style="color:#555;">🔗 ${labels.links}</strong><br>
      ${story.links.map((l) => `<a href="${escapeHtml(l.url)}" style="color:#0D9488;text-decoration:underline;">${escapeHtml(l.label)}</a>`).join('<br>')}
    </div>`
  }
  const imageHtml = story.image_url
    ? `<div style="padding-top:16px;text-align:center;"><img src="${escapeHtml(story.image_url)}" alt="" style="max-width:100%;border:0;display:block;margin:0 auto;"></div>`
    : ''

  return `<div style="padding:0 24px 24px 24px;">
<h2 style="font-size:20px;font-weight:bold;padding-left:12px;border-left:6px solid #0D9488;line-height:1.4;margin:24px 0 16px 0;color:#262626;">${index + 1}｜${escapeHtml(titleForLang)}</h2>
<div style="font-size:16px;line-height:1.7;color:#262626;">${generatedHtml}</div>
${imageHtml}
${linksHtml}
</div>`
}

async function translateTitle(title_zh: string, lang: Lang): Promise<string> {
  if (lang === 'zh-TW') return title_zh
  const target = lang === 'en' ? 'natural English' : 'natural Japanese'
  const prompt = `Translate this newsletter section title from Traditional Chinese to ${target}. Output only the translated title, no quotes or extra text.\n\nTitle: ${title_zh}`
  const out = await generateWithGemini(prompt)
  return stripCodeFences(out).replace(/^["「『]|["」』]$/g, '').trim() || title_zh
}

async function generateLangCampaign(
  lang: Lang,
  req: ComposeRequest,
  userId: string | null,
): Promise<string> {
  const toneSamples = await loadToneSamples(lang)
  const skeleton = await loadSkeleton(lang)
  const periodLabel = lang === 'zh-TW' && req.period_label_zh
    ? req.period_label_zh
    : PERIOD_LABEL_FMT[lang](req.period)

  // Generate intro (if provided)
  let introHtml = ''
  if (req.intro_zh?.trim()) {
    const out = await generateWithGemini(buildIntroPrompt(lang, req.period, req.intro_zh, toneSamples))
    introHtml = stripCodeFences(out)
  }

  // Generate each story section; translate title if not zh-TW
  const storyBlocks: string[] = []
  for (let i = 0; i < req.stories.length; i++) {
    const s = req.stories[i]
    const titleForLang = await translateTitle(s.title_zh, lang)
    const storyHtml = stripCodeFences(await generateWithGemini(buildStoryPrompt(lang, s, toneSamples)))
    storyBlocks.push(renderStoryBlock(s, i, storyHtml, lang, titleForLang))
  }

  // Render skeleton with substitutions
  const subjectByLang: Record<Lang, string> = {
    'zh-TW': `【CancerFree Biotech】${periodLabel} 電子報`,
    'en': `CancerFree Biotech Newsletter — ${periodLabel}`,
    'ja': `CancerFree Biotech ニュースレター ${periodLabel}`,
  }
  const subject = subjectByLang[lang]

  const content = skeleton
    .replaceAll('{{subject}}', escapeHtml(subject))
    .replaceAll('{{period_label}}', escapeHtml(periodLabel))
    .replaceAll('{{intro_html}}', introHtml || '<p style="color:#888;font-style:italic;">（請在 quick-send 頁補充開場）</p>')
    .replaceAll('{{stories_html}}', storyBlocks.join('\n'))

  const titleByLang: Record<Lang, string> = {
    'zh-TW': `${req.period} 中文月報`,
    'en': `${req.period} English Newsletter`,
    'ja': `${req.period} 日本語ニュースレター`,
  }

  // Map language → default list (by seed keys)
  const listKeyByLang: Record<Lang, string> = { 'zh-TW': 'zh-TW', 'en': 'en', 'ja': 'ja' }
  const service = createServiceClient()
  const { data: listRow } = await service
    .from('newsletter_lists')
    .select('id')
    .eq('key', listKeyByLang[lang])
    .maybeSingle()
  const listIds = listRow?.id ? [listRow.id] : []

  const slug = `${req.period}-${lang === 'zh-TW' ? 'zh-tw' : lang}`

  const { data: inserted, error } = await service
    .from('newsletter_campaigns')
    .insert({
      title: titleByLang[lang],
      subject,
      preview_text: req.intro_zh?.slice(0, 120) ?? null,
      content_html: content,
      list_ids: listIds,
      status: 'draft',
      slug,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(`${lang} insert: ${error.message}`)
  return inserted!.id as string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ComposeRequest
  try {
    body = await req.json() as ComposeRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!body.period?.match(/^\d{4}-\d{2}$/)) {
    return NextResponse.json({ error: 'period required as YYYY-MM' }, { status: 400 })
  }
  if (!Array.isArray(body.stories) || body.stories.length === 0) {
    return NextResponse.json({ error: 'at least one story required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('id').ilike('email', user.email).maybeSingle()
  const userId = me?.id ?? null

  const langs: Lang[] = body.translate === false ? ['zh-TW'] : ['zh-TW', 'en', 'ja']
  const results: { lang: Lang; id: string; error?: string }[] = []

  for (const lang of langs) {
    try {
      const id = await generateLangCampaign(lang, body, userId)
      results.push({ lang, id })
    } catch (e) {
      results.push({ lang, id: '', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ results })
}
