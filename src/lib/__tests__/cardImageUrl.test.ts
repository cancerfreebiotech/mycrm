import { describe, it, expect } from 'vitest'
import { cardPathFromUrl } from '@/lib/cardImageUrl'

const BASE = 'https://gaxjgcztzfxokesiraai.supabase.co/storage/v1/object/public/cards'

describe('cardPathFromUrl', () => {
  it('extracts the relative object path from a public-form cards URL', () => {
    expect(cardPathFromUrl(`${BASE}/camcard/foo.jpg`)).toBe('camcard/foo.jpg')
  })

  it('strips the query string from a public-form cards URL', () => {
    expect(cardPathFromUrl(`${BASE}/camcard/foo.jpg?token=abc&t=123`)).toBe('camcard/foo.jpg')
  })

  it('keeps an {org}/ prefix inside the extracted path', () => {
    const org = '00000000-0000-0000-0000-000000000001'
    expect(cardPathFromUrl(`${BASE}/${org}/camcard/foo.jpg`)).toBe(`${org}/camcard/foo.jpg`)
  })

  it('returns a bare storage path (non-http) unchanged', () => {
    expect(cardPathFromUrl('camcard/foo.jpg')).toBe('camcard/foo.jpg')
  })

  it('strips the query string from a bare storage path', () => {
    expect(cardPathFromUrl('camcard/foo.jpg?x=1')).toBe('camcard/foo.jpg')
  })

  it('returns null for a full URL pointing at a different bucket', () => {
    expect(
      cardPathFromUrl('https://gaxjgcztzfxokesiraai.supabase.co/storage/v1/object/public/avatars/foo.jpg'),
    ).toBeNull()
  })

  it('returns null for an unrelated external http URL', () => {
    expect(cardPathFromUrl('https://example.com/some/image.jpg')).toBeNull()
  })

  it('returns null for null / undefined / empty input', () => {
    expect(cardPathFromUrl(null)).toBeNull()
    expect(cardPathFromUrl(undefined)).toBeNull()
    expect(cardPathFromUrl('')).toBeNull()
  })
})
