import { describe, it, expect } from 'vitest'
import { hasFeature } from '@/lib/features'

describe('hasFeature', () => {
  it('super_admin always has the feature, even with no grants', () => {
    expect(hasFeature('super_admin', [], 'tags')).toBe(true)
  })

  it('super_admin has a feature that is not in its granted list', () => {
    expect(hasFeature('super_admin', ['newsletter'], 'tags')).toBe(true)
  })

  it('regular user with the feature granted returns true', () => {
    expect(hasFeature('member', ['tags'], 'tags')).toBe(true)
  })

  it('regular user without the feature granted returns false', () => {
    expect(hasFeature('member', ['newsletter'], 'tags')).toBe(false)
  })

  it('regular user with an empty grant list returns false', () => {
    expect(hasFeature('member', [], 'tags')).toBe(false)
  })

  it('unknown role behaves like a regular user (granted -> true)', () => {
    expect(hasFeature('some_future_role', ['tags'], 'tags')).toBe(true)
  })

  it('unknown role behaves like a regular user (not granted -> false)', () => {
    expect(hasFeature('some_future_role', [], 'tags')).toBe(false)
  })

  it('matches the exact feature key, not a partial/substring', () => {
    // granting 'user_management' must not satisfy a check for 'export_contacts'
    expect(hasFeature('member', ['user_management'], 'export_contacts')).toBe(false)
    expect(hasFeature('member', ['user_management'], 'user_management')).toBe(true)
  })
})
