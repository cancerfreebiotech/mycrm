import type { SupabaseClient } from '@supabase/supabase-js'

// The `cards` bucket is private. The DB keeps the public-form URL
// (`.../storage/v1/object/public/cards/<path>`) as an identifier — never rewrite
// what's stored. On read/render/outbound, convert it to a short-lived signed URL.

const CARDS_PUBLIC_RE = /\/storage\/v1\/object\/public\/cards\/(.+)$/

/**
 * Extract the object path inside the `cards` bucket from a public-form URL.
 * - Public cards URL → the path with querystring stripped (may include a
 *   `camcard/` prefix), e.g. `camcard/foo.jpg`.
 * - A bare storage path (not an http URL) → returned as-is (querystring stripped).
 * - Any other full URL (different bucket / external) → null.
 */
export function cardPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(CARDS_PUBLIC_RE)
  if (m) return m[1].split('?')[0]
  if (/^https?:\/\//i.test(url)) return null
  return url.split('?')[0]
}

/**
 * Turn a public-form cards URL into a short-lived signed URL. Works with any
 * Supabase client (browser anon or service). Falls back to the original URL when
 * a path can't be extracted or signing fails — never throws.
 */
export async function signCardUrl(
  client: SupabaseClient,
  url: string | null | undefined,
  ttl = 3600,
): Promise<string> {
  if (!url) return ''
  const path = cardPathFromUrl(url)
  if (!path) return url
  const { data, error } = await client.storage.from('cards').createSignedUrl(path, ttl)
  if (error || !data?.signedUrl) return url
  return data.signedUrl
}

/**
 * Batch variant using createSignedUrls to avoid N round-trips. Returns a Map
 * keyed by the original URL → signed URL. Blank inputs and non-cards URLs are
 * skipped (callers should fall back to the original URL on a miss).
 */
export async function signCardUrls(
  client: SupabaseClient,
  urls: (string | null | undefined)[],
  ttl = 3600,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const pathToUrls = new Map<string, string[]>()
  for (const url of urls) {
    if (!url) continue
    const path = cardPathFromUrl(url)
    if (!path) continue
    const list = pathToUrls.get(path)
    if (list) list.push(url)
    else pathToUrls.set(path, [url])
  }
  const paths = [...pathToUrls.keys()]
  if (paths.length === 0) return result
  const { data } = await client.storage.from('cards').createSignedUrls(paths, ttl)
  if (data) {
    for (const item of data) {
      if (!item.path || !item.signedUrl) continue
      const originals = pathToUrls.get(item.path)
      if (!originals) continue
      for (const original of originals) result.set(original, item.signedUrl)
    }
  }
  return result
}
