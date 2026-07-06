import { describe, it, expect } from 'vitest'
import { addUtmTags } from '@/lib/newsletter-send-worker'

// Helper: assert every '&' in the string is part of the '&amp;' entity, never a
// raw separator (raw '&' in an HTML attribute is invalid).
function noRawAmpersand(s: string): boolean {
  return !/&(?!amp;)/.test(s)
}

describe('addUtmTags', () => {
  it('appends utm_source/utm_medium/utm_campaign to a bare link', () => {
    expect(addUtmTags('<a href="https://example.com">L</a>', 'spring')).toBe(
      '<a href="https://example.com/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=spring">L</a>',
    )
  })

  it('does not overwrite a pre-set utm_source', () => {
    const out = addUtmTags('<a href="https://example.com/?utm_source=existing">L</a>', 'spring')
    expect(out).toContain('utm_source=existing')
    expect(out).not.toContain('utm_source=newsletter')
    expect(out).toContain('utm_medium=email')
    expect(out).toContain('utm_campaign=spring')
  })

  it('does not overwrite a pre-set utm_campaign', () => {
    const out = addUtmTags('<a href="https://example.com/page?utm_campaign=custom">L</a>', 'default')
    expect(out).toContain('utm_campaign=custom')
    expect(out).not.toContain('utm_campaign=default')
  })

  it('skips unsubscribe links', () => {
    const html = '<a href="https://example.com/unsubscribe?token=x">Unsub</a>'
    expect(addUtmTags(html, 'spring')).toBe(html)
  })

  it('skips opt-out links (both opt-out and optout spellings)', () => {
    const dash = '<a href="https://example.com/opt-out">x</a>'
    const nodash = '<a href="https://example.com/optout">x</a>'
    expect(addUtmTags(dash, 'spring')).toBe(dash)
    expect(addUtmTags(nodash, 'spring')).toBe(nodash)
  })

  it('emits &amp; (not raw &) even when the source had a single param / no entity', () => {
    const out = addUtmTags('<a href="https://example.com">L</a>', 'spring')
    expect(out).toContain('&amp;')
    expect(noRawAmpersand(out)).toBe(true)
  })

  it('keeps &amp; consistency for a multi-param source that already used the entity', () => {
    const out = addUtmTags('<a href="https://example.com/?a=1&amp;b=2">L</a>', 'spring')
    // pre-existing params survive
    expect(out).toContain('a=1')
    expect(out).toContain('b=2')
    // and every separator is the entity form
    expect(out).toBe(
      '<a href="https://example.com/?a=1&amp;b=2&amp;utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=spring">L</a>',
    )
    expect(noRawAmpersand(out)).toBe(true)
  })

  it('leaves non-http(s) hrefs untouched (mailto / tel / anchor / placeholder)', () => {
    for (const html of [
      '<a href="mailto:foo@bar.com">mail</a>',
      '<a href="tel:+886123456">call</a>',
      '<a href="#section">jump</a>',
      '<a href="{{{unsubscribe}}}">unsub placeholder</a>',
    ]) {
      expect(addUtmTags(html, 'spring')).toBe(html)
    }
  })

  it('returns the original href unchanged when the URL is malformed', () => {
    // matches the http(s) regex but new URL() throws (unterminated IPv6 literal)
    const html = '<a href="https://[bad">broken</a>'
    expect(addUtmTags(html, 'spring')).toBe(html)
  })

  it('tags multiple links in one document independently', () => {
    const html = '<a href="https://a.example">A</a> and <a href="https://b.example">B</a>'
    const out = addUtmTags(html, 'promo')
    expect(out).toContain('https://a.example/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=promo')
    expect(out).toContain('https://b.example/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=promo')
  })
})
