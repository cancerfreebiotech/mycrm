import { describe, it, expect } from 'vitest'
import { escapeLikePattern } from '@/lib/likeEscape'

describe('escapeLikePattern', () => {
  it('escapes % wildcard', () => {
    // '%' -> backslash + '%'
    expect(escapeLikePattern('%')).toBe('\\%')
  })

  it('escapes _ wildcard', () => {
    // '_' -> backslash + '_'
    expect(escapeLikePattern('_')).toBe('\\_')
  })

  it('escapes a lone backslash', () => {
    // '\' -> two backslashes
    expect(escapeLikePattern('\\')).toBe('\\\\')
  })

  it('escapes every special char in a mixed string', () => {
    // input:  100%_off\   ->   100\%\_off\\
    expect(escapeLikePattern('100%_off\\')).toBe('100\\%\\_off\\\\')
  })

  it('leaves an ordinary email unchanged', () => {
    expect(escapeLikePattern('john.doe@example.com')).toBe('john.doe@example.com')
  })

  it('does not touch other regex-significant but non-LIKE chars', () => {
    // '.', '+', '*', '(', ')' are NOT LIKE wildcards -> untouched
    expect(escapeLikePattern('a.b+c*(d)')).toBe('a.b+c*(d)')
  })

  it('returns empty string for empty input', () => {
    expect(escapeLikePattern('')).toBe('')
  })
})
