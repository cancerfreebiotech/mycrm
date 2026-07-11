/**
 * Escape SQL LIKE wildcards (%, _, \) from user input so that .ilike() behaves
 * as case-insensitive exact equality instead of a wildcard pattern match.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&')
}

/**
 * Wrap a value for safe embedding inside a PostgREST `.or()` filter string.
 *
 * PostgREST treats `,` `.` `(` `)` `:` as reserved delimiters inside an
 * `or=(...)` expression, so raw user input containing a comma (or parens)
 * breaks the whole filter. Wrapping the value in double quotes protects those
 * characters; inside the quotes only `"` and `\` need backslash-escaping.
 *
 * Returns the quoted token including surrounding quotes, e.g.
 *   `name.ilike.${orQuote('%' + q + '%')}`  →  name.ilike."%Acme, Inc%"
 *
 * Compose with escapeLikePattern() first when an exact match is wanted (the
 * added backslashes survive PostgREST's `\\`→`\` unquoting and reach SQL LIKE
 * as literal `\%` / `\_`).
 */
export function orQuote(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}
