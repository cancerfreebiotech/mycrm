import type { OrgDb } from '@/lib/orgContext'

// Serialize a JS string[] into a Postgres text[] literal for a PostgREST filter,
// e.g. ['a','b'] → {"a","b"}. Elements are double-quoted with " and \ escaped.
function pgTextArrayLiteral(items: string[]): string {
  return `{${items.map((s) => `"${s.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`
}

/**
 * Atomically append `url` to newsletter_drafts.photo_urls.
 *
 * Telegram media-group (album) photos and rapid web uploads arrive as
 * concurrent requests; a plain read → JS append → write loses all but the last.
 * photo_urls is a text[] (typed string[] in code) with no version/updated_at
 * column, so we compare-and-swap on the array value itself: the UPDATE is
 * guarded on the pre-image array and retried on contention. The final attempt
 * drops the guard as a safety net, so a persistent CAS miss degrades to
 * last-write-wins (no worse than the original) rather than dropping the URL.
 *
 * Returns the resulting photo_urls, or null if the draft no longer exists.
 */
export async function appendDraftPhotoUrl(db: OrgDb, draftId: string, url: string): Promise<string[] | null> {
  const MAX_ATTEMPTS = 15
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: cur } = await db
      .from('newsletter_drafts')
      .select('photo_urls')
      .eq('id', draftId)
      .maybeSingle()
    if (!cur) return null
    const current: string[] = (cur.photo_urls as string[] | null) ?? []
    if (current.includes(url)) return current // already appended (idempotent)
    const updated = [...current, url]
    const lastResort = attempt === MAX_ATTEMPTS - 1
    let q = db.from('newsletter_drafts').update({ photo_urls: updated }).eq('id', draftId)
    if (!lastResort) q = q.filter('photo_urls', 'eq', pgTextArrayLiteral(current))
    const { data: rows } = await q.select('photo_urls').maybeSingle()
    if (rows) return (rows.photo_urls as string[] | null) ?? updated
    // Lost the CAS to a concurrent write — brief backoff, then re-read and retry.
    await new Promise((r) => setTimeout(r, 15 * (attempt + 1)))
  }
  return null
}
