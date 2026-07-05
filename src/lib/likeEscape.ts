/**
 * Escape SQL LIKE wildcards (%, _, \) from user input so that .ilike() behaves
 * as case-insensitive exact equality instead of a wildcard pattern match.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&')
}
