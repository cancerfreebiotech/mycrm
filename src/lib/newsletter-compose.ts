/**
 * Newsletter compose utility.
 *
 * Renders the docs/newsletter-templates/skeleton-{lang}.html into a final HTML
 * string by substituting {{placeholders}}. AI-generated section content is
 * passed in as pre-rendered HTML (generated elsewhere, e.g. by the
 * `/api/ai-newsletter-compose` endpoint which calls Gemini with the user's
 * tone corpus).
 *
 * Scope of this file:
 *   - ✅ deterministic template rendering (well-defined, unit-testable)
 *   - ✅ block-section substitution (each story → HTML fragment)
 *   - ❌ AI content generation (deferred: endpoint wires Gemini separately
 *        once user provides historical newsletters as tone corpus)
 *
 * {{optout_url}} is intentionally NOT substituted here — it stays as a
 * placeholder and the per-recipient send code substitutes it at mail time
 * (same pattern as `src/app/api/email/send/route.ts` already uses).
 */

import fs from 'node:fs/promises'
import path from 'node:path'

export type NewsletterLanguage = 'zh-TW' | 'en' | 'ja'

export interface NewsletterStory {
  title: string                                  // "AACR Annual Meeting 2026"
  paragraphs_html: string                        // pre-rendered <p>...</p><br>... inner HTML
  link_html?: string                             // e.g. `<p>🔗｜<a href="...">...</a></p>`
  image?: { url: string; alt?: string; href?: string }  // optional image block
}

export interface NewsletterComposeInput {
  language: NewsletterLanguage
  subject: string
  month_label: string                            // "2026年5月" / "2026 May" / "2026年5月号"
  upcoming_title: string                         // e.g. "5月重點"
  intro_html: string                             // innerHTML for the intro block
  upcoming_stories: NewsletterStory[]
  recap_title: string                            // e.g. "4月回顧"
  recap_stories: NewsletterStory[]
  logo_url: string
  substack_url: string
  facebook_url: string
  linkedin_url: string
  website_url: string
}

export interface NewsletterComposeResult {
  html: string
}

const SKELETON_DIR = path.join(process.cwd(), 'docs', 'newsletter-templates')

async function loadSkeleton(lang: NewsletterLanguage): Promise<string> {
  const file = path.join(SKELETON_DIR, `skeleton-${lang}.html`)
  return fs.readFile(file, 'utf8')
}

/**
 * Renders one story into the block-section HTML shape.
 * Returns HTML fragment suitable for concatenating into {{upcoming_blocks}} /
 * {{recap_blocks}}.
 *
 * Shape matches docs/newsletter-templates/block-section.html.
 */
export function renderStoryBlock(story: NewsletterStory, index: number): string {
  const number = index + 1
  const contentBlock = `
<div style="font-weight:normal;padding:0 24px 16px 32px">
  <p style="margin:0 0 8px 0"><strong>${number}｜${escapeHtml(story.title)}</strong></p>
  ${story.paragraphs_html}
  ${story.link_html ?? ''}
</div>`

  if (!story.image?.url) return contentBlock

  const imgTag = `<img alt="${escapeHtml(story.image.alt ?? story.title)}" src="${escapeHtml(story.image.url)}" style="outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"/>`
  const imageBlock = story.image.href
    ? `
<div style="padding:16px 24px 16px 24px;text-align:center">
  <a href="${escapeHtml(story.image.href)}" style="text-decoration:none" target="_blank">${imgTag}</a>
</div>`
    : `
<div style="padding:16px 24px 16px 24px;text-align:center">
  ${imgTag}
</div>`

  return contentBlock + imageBlock
}

/**
 * Substitute a named {{placeholder}} with a value. Used narrowly so that
 * accidental braces in content don't cause cascading substitutions.
 */
function substitute(template: string, key: string, value: string): string {
  const needle = `{{${key}}}`
  return template.split(needle).join(value)
}

/**
 * Full compose: skeleton + stories → final HTML.
 * Does NOT substitute {{optout_url}} (kept as literal for per-recipient
 * substitution at send time).
 */
export async function composeNewsletter(input: NewsletterComposeInput): Promise<NewsletterComposeResult> {
  let html = await loadSkeleton(input.language)

  const upcomingBlocks = input.upcoming_stories.map((s, i) => renderStoryBlock(s, i)).join('\n')
  const recapBlocks = input.recap_stories.map((s, i) => renderStoryBlock(s, i)).join('\n')

  const replacements: Record<string, string> = {
    subject: input.subject,
    month_label: input.month_label,
    substack_url: input.substack_url,
    upcoming_title: input.upcoming_title,
    intro_html: input.intro_html,
    upcoming_blocks: upcomingBlocks,
    recap_title: input.recap_title,
    recap_blocks: recapBlocks,
    logo_url: input.logo_url,
    facebook_url: input.facebook_url,
    linkedin_url: input.linkedin_url,
    website_url: input.website_url,
  }

  for (const [key, value] of Object.entries(replacements)) {
    html = substitute(html, key, value)
  }

  return { html }
}

/**
 * Minimal HTML-attribute escape. We intentionally don't escape the bodies of
 * paragraphs/intro_html — those are trusted, user-confirmed HTML (produced by
 * AI compose or admin authoring), and double-escaping would break their
 * intentional tags.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
