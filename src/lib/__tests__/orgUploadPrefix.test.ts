import { describe, it, expect, vi, afterEach } from 'vitest'
import { withOrgPrefix, fetchOrgId } from '@/lib/orgUploadPrefix'

describe('withOrgPrefix', () => {
  it('returns the path unchanged when orgId is null', () => {
    expect(withOrgPrefix(null, 'contacts/card.jpg')).toBe('contacts/card.jpg')
  })

  it('prefixes the path with orgId when provided', () => {
    expect(withOrgPrefix('org-1', 'contacts/card.jpg')).toBe('org-1/contacts/card.jpg')
  })
})

describe('fetchOrgId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns org_id from a 200 response and calls /api/me', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ org_id: 'org-123' }) }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchOrgId()).resolves.toBe('org-123')
    expect(fetchMock).toHaveBeenCalledWith('/api/me')
  })

  it('returns null when a 200 response omits org_id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    await expect(fetchOrgId()).resolves.toBeNull()
  })

  it('returns null when a 200 response has org_id null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ org_id: null }) })))
    await expect(fetchOrgId()).resolves.toBeNull()
  })

  it('returns null on a non-200 response without reading the body', async () => {
    const json = vi.fn(async () => ({ org_id: 'should-not-be-read' }))
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json })))

    await expect(fetchOrgId()).resolves.toBeNull()
    expect(json).not.toHaveBeenCalled()
  })

  it('returns null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    await expect(fetchOrgId()).resolves.toBeNull()
  })
})
