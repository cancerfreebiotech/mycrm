// Newsletter AI: refine zh prose + translate to en/ja + generate promo text.
// Goes through Portkey to Gemini models (Pro for refine, Flash Lite for translation).
//
// Tone corpus = past newsletters at skills/newsletter-composer/tone-samples/
// most recent N samples in the target language are sent as few-shot reference.

import fs from 'node:fs/promises'
import path from 'node:path'
import { aiGenerate } from '@/lib/aiRouting'
import { systemOrgContext } from '@/lib/orgContext'

export type Lang = 'zh-TW' | 'en' | 'ja'

function stripJsonFence(t: string): string {
  return t.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
}

// Load past newsletter samples for tone reference. Files in
// skills/newsletter-composer/tone-samples/ follow naming "{YYYY-MM}-{suffix}.md"
// where suffix is 'zh' / 'en' / 'ja' (note: 'zh' on disk maps to 'zh-TW' Lang).
async function loadToneCorpus(lang: Lang, count = 2): Promise<string> {
  const suffix = lang === 'zh-TW' ? 'zh' : lang
  const dir = path.join(process.cwd(), 'skills', 'newsletter-composer', 'tone-samples')
  try {
    const all = await fs.readdir(dir)
    const matched = all.filter((f) => f.endsWith(`-${suffix}.md`)).sort().reverse().slice(0, count)
    const bodies = await Promise.all(matched.map((f) => fs.readFile(path.join(dir, f), 'utf8')))
    return bodies.join('\n\n---\n\n')
  } catch {
    return ''
  }
}

export interface DraftStoryInput {
  title: string
  content: string
  event_date?: string | null
}

export interface RefinedStory {
  title: string
  paragraphs_html: string
}

// ── Refine raw zh-TW content into polished paragraphs_html ──────────────────
export async function refineProseZh(story: DraftStoryInput, orgName = 'CancerFree Biotech'): Promise<RefinedStory> {
  const tone = await loadToneCorpus('zh-TW', 2)
  const prompt = `你是 ${orgName} 月電子報的文字編輯。把員工的原始素材潤稿成正式版段落。

【品牌語氣（過去電子報摘錄，僅供參考）】
${tone || '(無過往樣本，請按一般專業商業語氣)'}

【規則】
- 200-400 字
- 只能用以下 HTML：<p>, <strong>, <em>, <ul>, <li>, <br>, <a>
- 禁止 <h1>, <h2>, <img>, <html>, <body>, code fence, markdown
- 不要寫「革命性」「顛覆」「領先業界」這類用字
- 每段最多一個驚嘆號
- 句子簡短、主動語態、具體日期/地點/數字優先

【素材】
標題：${story.title}
${story.event_date ? `事件日期：${story.event_date}\n` : ''}原始內容：
${story.content}

【輸出 JSON】
{"title": "如有微調可改，否則保留原意", "paragraphs_html": "<p>...</p><p>...</p>"}`

  const orgId = systemOrgContext().orgId
  const raw = await aiGenerate(orgId, 'newsletter_refine', prompt)
  const cleaned = stripJsonFence(raw)
  try {
    const json = JSON.parse(cleaned) as { title?: string; paragraphs_html?: string }
    return {
      title: json.title ?? story.title,
      paragraphs_html: json.paragraphs_html ?? `<p>${story.content}</p>`,
    }
  } catch {
    // Fallback: wrap raw output in paragraphs
    const safe = raw.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')
    return { title: story.title, paragraphs_html: `<p>${safe}</p>` }
  }
}

// ── Translate refined zh story to target language ───────────────────────────
export async function translateStory(refined: RefinedStory, target: 'en' | 'ja'): Promise<RefinedStory> {
  const tone = await loadToneCorpus(target, 2)
  const langName = target === 'en' ? 'English' : 'Japanese'
  const jaRule = target === 'ja'
    ? '- 使用敬語 (です/ます). 敬語層級對齊 brand voice reference.\n'
    : '- Active voice, professional but warm, fact-based.\n'

  const prompt = `Translate the Traditional Chinese newsletter story below into ${langName}.

[Brand voice reference (past newsletter excerpts)]
${tone || '(no samples — use professional business tone)'}

[Rules]
- Natural prose, NOT literal translation
- Keep paragraph structure
- Allowed HTML: <p>, <strong>, <em>, <ul>, <li>, <br>, <a>
- No <h1>, <h2>, <img>, code fences, markdown
${jaRule}
[Source title]
${refined.title}

[Source paragraphs_html]
${refined.paragraphs_html}

[Output JSON]
{"title": "translated title", "paragraphs_html": "<p>...</p>"}`

  const orgId = systemOrgContext().orgId
  const raw = await aiGenerate(orgId, 'newsletter_translate', prompt)
  const cleaned = stripJsonFence(raw)
  try {
    const json = JSON.parse(cleaned) as { title?: string; paragraphs_html?: string }
    return {
      title: json.title ?? refined.title,
      paragraphs_html: json.paragraphs_html ?? refined.paragraphs_html,
    }
  } catch {
    return { title: refined.title, paragraphs_html: `<p>${raw}</p>` }
  }
}

// ── Translate a standalone HTML block (used for per-period highlight) ───────
export async function translateHtml(html: string, target: 'en' | 'ja'): Promise<string> {
  if (!html.trim()) return ''
  const langName = target === 'en' ? 'English' : 'Japanese'
  const prompt = `Translate the Traditional Chinese HTML block below into ${langName}.

[Rules]
- Natural prose, NOT literal
- Preserve HTML structure exactly (same <p>, <strong>, <em>, <ul>, <li>, <br>, <a> tags)
- No <h1>, <h2>, <img>, code fences, markdown
${target === 'ja' ? '- Use 敬語 (です/ます)\n' : '- Active voice, professional but warm\n'}
[Source HTML]
${html}

[Output]
Translated HTML only, no JSON wrapper, no explanation, no quotes.`
  const orgId = systemOrgContext().orgId
  const raw = await aiGenerate(orgId, 'newsletter_translate', prompt)
  return stripJsonFence(raw).trim()
}

// ── Promo text (LINE / Slack / chat share) ──────────────────────────────────
export async function generatePromoText(
  period: string,
  titles: string[],   // up to 3 highlight story titles in the target lang
  lang: Lang,
  orgName = 'CancerFree Biotech',
): Promise<string> {
  const limits = lang === 'en' ? '100-200 chars' : '80-150 chars'
  const langName = lang === 'zh-TW' ? '繁體中文' : lang === 'en' ? 'English' : '日本語'

  const examples: Record<Lang, string> = {
    'zh-TW': 'CancerFree 2026 年 5 月電子報出爐！本期重點：Prometheus Lab AI 沖繩首次部署、EVA Select 紐約研討會發表。完整內容請查收 email 或聯絡我們。',
    'en':    "CancerFree's May 2026 newsletter is out! Highlights: Prometheus Lab AI deploys in Okinawa, EVA Select presents in NYC. Check your inbox or reach out for the full edition.",
    'ja':    'CancerFree 2026年5月号ニュースレター配信開始！今号の注目：Prometheus Lab AI 沖縄初導入、EVA Select ニューヨーク発表。詳細はメールをご確認ください。',
  }

  const prompt = `Write a short PLAIN-TEXT promo for ${orgName}'s ${period} newsletter.

Language: ${langName}
Length: ${limits}
Tone: casual but professional, action-oriented
Include: period reference + 1-2 highlights + brief call-to-action ("check inbox" / "see full newsletter")

Highlights: ${titles.slice(0, 3).join(' / ')}

Example shape (do NOT copy, just for tone):
${examples[lang]}

Output: PLAIN TEXT only. NO markdown, NO HTML, NO quotes around the output.`

  const orgId = systemOrgContext().orgId
  const raw = await aiGenerate(orgId, 'newsletter_translate', prompt)
  return raw.replace(/^["「『]/, '').replace(/["」』]$/, '').trim()
}
