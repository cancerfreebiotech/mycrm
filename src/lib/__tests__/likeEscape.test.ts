import { describe, it, expect } from 'vitest'
import { escapeLikePattern, orQuote } from '@/lib/likeEscape'

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

describe('orQuote', () => {
  it('wraps a plain value in double quotes', () => {
    expect(orQuote('Acme')).toBe('"Acme"')
  })

  it('protects a comma (the reserved .or() delimiter)', () => {
    // A comma inside the quotes must not be treated as a filter separator.
    expect(orQuote('Acme, Inc')).toBe('"Acme, Inc"')
  })

  it('leaves parentheses intact inside the quotes', () => {
    expect(orQuote('Foo (Bar)')).toBe('"Foo (Bar)"')
  })

  it('backslash-escapes an embedded double quote', () => {
    expect(orQuote('a"b')).toBe('"a\\"b"')
  })

  it('backslash-escapes an embedded backslash', () => {
    expect(orQuote('a\\b')).toBe('"a\\\\b"')
  })

  it('composes with escapeLikePattern for an exact match term', () => {
    // john_doe -> LIKE-escaped \_  -> then the backslash is doubled for the
    // quoted context, so PostgREST unquotes it back to a literal \_.
    expect(orQuote(escapeLikePattern('john_doe'))).toBe('"john\\\\_doe"')
  })
})
