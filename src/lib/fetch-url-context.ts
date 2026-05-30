// Fetch text content from a URL for AI prompt context. Used by newsletter
// compose: stories whose only material is a link become useful when the AI
// can see the destination's actual content.
//
// Strategy:
//   - YouTube → oEmbed (title + author + description)
//   - Generic page → fetch HTML, strip scripts/styles, collapse whitespace,
//     truncate to ~2000 chars
//
// All errors swallowed → empty string fallback. The caller treats "no
// context" as "story has no link content to reference" and proceeds.

const MAX_CHARS = 2000
const TIMEOUT_MS = 10000

interface OEmbed {
  title?: string
  author_name?: string
  provider_name?: string
}

async function fetchYouTubeContext(url: string): Promise<string> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return ''
  const data = (await res.json()) as OEmbed
  const parts: string[] = []
  if (data.title) parts.push(`[YouTube] ${data.title}`)
  if (data.author_name) parts.push(`頻道：${data.author_name}`)
  return parts.join('\n')
}

async function fetchGenericPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mycrm-newsletter-bot/1.0)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  })
  if (!res.ok) return ''
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text/html') && !ct.includes('text/plain')) return ''
  const html = await res.text()
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch?.[1]?.trim() ?? ''
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  const parts: string[] = []
  if (title) parts.push(`[頁面標題] ${title}`)
  if (body) parts.push(body.slice(0, MAX_CHARS))
  return parts.join('\n')
}

export async function fetchUrlContext(url: string): Promise<string> {
  try {
    if (!/^https?:\/\//.test(url)) return ''
    if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
      return await fetchYouTubeContext(url)
    }
    return await fetchGenericPageText(url)
  } catch {
    return ''
  }
}
