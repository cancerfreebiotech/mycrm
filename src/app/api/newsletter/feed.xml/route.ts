import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/newsletter/feed.xml — public RSS 2.0 feed for Substack RSS importer
// Serves campaigns where published_at IS NOT NULL, newest first, up to 20.
// Substack polls this URL periodically; each new <item> becomes a draft post.

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cdata(s: string | null | undefined): string {
  // Wrap HTML in CDATA; if CDATA end token appears, split it
  return `<![CDATA[${(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

function toRFC822(d: Date): string {
  return d.toUTCString()
}

export async function GET() {
  const service = createServiceClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io'

  const { data, error } = await service
    .from('newsletter_campaigns')
    .select('id, title, subject, preview_text, content_html, published_at, slug')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(20)

  if (error) {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(error.message)}</error>`, {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  const items = (data ?? []).map((c) => {
    const slugOrId = c.slug ?? c.id
    const link = `${baseUrl}/newsletter/view/${slugOrId}`
    const pub = toRFC822(new Date(c.published_at as string))
    return `    <item>
      <title>${esc(c.subject ?? c.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(c.id as string)}</guid>
      <pubDate>${pub}</pubDate>
      ${c.preview_text ? `<description>${esc(c.preview_text)}</description>` : ''}
      <content:encoded>${cdata(c.content_html)}</content:encoded>
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CancerFree Biotech Newsletter</title>
    <link>${esc(baseUrl)}</link>
    <description>Monthly updates from CancerFree Biotech</description>
    <language>zh-TW</language>
    <atom:link href="${esc(baseUrl)}/api/newsletter/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
