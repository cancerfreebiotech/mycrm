import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import {
  composeNewsletter,
  type NewsletterComposeInput,
} from '@/lib/newsletter-compose'

/**
 * POST /api/ai-newsletter-compose
 *
 * Render a newsletter from structured input using the skeleton templates
 * under `docs/newsletter-templates/`.
 *
 * Current state: skeleton substitution works end-to-end. The AI-driven
 * generation of section paragraphs from stories + photos + tone corpus is
 * NOT YET WIRED — the caller must pre-render `paragraphs_html` for each
 * story. Once the user supplies historical newsletter HTML as a tone
 * reference corpus, extend this endpoint to:
 *   1. Accept `{ outline, photos, tone_corpus }` per story instead of
 *      pre-rendered `paragraphs_html`.
 *   2. Call Gemini with a few-shot prompt that includes the corpus.
 *   3. Post-process the Gemini output into valid paragraphs_html.
 *   4. Optionally Gemini vision for photo captions.
 *
 * Until then this endpoint is useful for the "manual compose" flow: admin
 * writes the paragraphs in the UI, clicks render, the skeleton is filled.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: NewsletterComposeInput
  try {
    body = (await req.json()) as NewsletterComposeInput
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const required: (keyof NewsletterComposeInput)[] = [
    'language', 'subject', 'month_label',
    'upcoming_title', 'intro_html', 'upcoming_stories',
    'recap_title', 'recap_stories',
    'logo_url', 'substack_url',
    'facebook_url', 'linkedin_url', 'website_url',
  ]
  for (const k of required) {
    if (body[k] === undefined || body[k] === null) {
      return NextResponse.json({ error: `missing field: ${k}` }, { status: 400 })
    }
  }

  if (!['zh-TW', 'en', 'ja'].includes(body.language)) {
    return NextResponse.json({ error: `invalid language: ${body.language}` }, { status: 400 })
  }

  try {
    const result = await composeNewsletter(body)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
