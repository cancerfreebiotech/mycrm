import { createServiceClient } from './supabase'

export interface Contact {
  id: string
  name: string | null
  company: string | null
  email: string | null
}

export interface CheckDuplicatesInput {
  email?: string | null
  secondEmail?: string | null
  name?: string | null
  nameEn?: string | null
  nameLocal?: string | null
}

export interface DuplicateResult {
  exact: Contact[]   // Matches on email OR second_email (case-insensitive)
  similar: Contact[] // Matches via pg_trgm on name OR name_en OR name_local
}

const SIMILARITY_THRESHOLD = 0.6

/**
 * Escape SQL LIKE wildcards (%, _, \) from user input so that .ilike() behaves
 * as case-insensitive exact equality.
 */
function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&')
}

function normalizeEmail(e: string | null | undefined): string | null {
  if (!e) return null
  const t = e.trim()
  return t.length > 0 ? t : null
}

function normalizeName(n: string | null | undefined): string | null {
  if (!n) return null
  const t = n.trim()
  return t.length > 0 ? t : null
}

/**
 * Find duplicate contacts by:
 *   (A) email exact match — case-insensitive
 *   (B) second_email exact match — case-insensitive
 *   (E) name similarity >= threshold on name_en
 *   (F) name similarity >= threshold on name_local
 *   (base) name similarity >= threshold on name
 *
 * Returns exact matches (high confidence) and similar matches (fuzzy).
 * Similar excludes any IDs already in exact.
 */
export async function checkDuplicates(input: CheckDuplicatesInput): Promise<DuplicateResult> {
  const supabase = createServiceClient()

  // --- Exact match: email or second_email (case-insensitive) ---
  const emails: string[] = []
  const e1 = normalizeEmail(input.email)
  const e2 = normalizeEmail(input.secondEmail)
  if (e1) emails.push(e1)
  if (e2 && e2.toLowerCase() !== e1?.toLowerCase()) emails.push(e2)

  const exactMap = new Map<string, Contact>()
  if (emails.length > 0) {
    const orParts: string[] = []
    for (const e of emails) {
      const p = escapeLikePattern(e)
      orParts.push(`email.ilike.${p}`, `second_email.ilike.${p}`)
    }
    const { data } = await supabase
      .from('contacts')
      .select('id, name, company, email, second_email')
      .is('deleted_at', null)
      .or(orParts.join(','))
    for (const row of (data ?? []) as (Contact & { second_email: string | null })[]) {
      exactMap.set(row.id, { id: row.id, name: row.name, company: row.company, email: row.email })
    }
  }

  // --- Similar match: pg_trgm on name, name_en, name_local ---
  const names: string[] = []
  for (const n of [input.name, input.nameEn, input.nameLocal]) {
    const normalized = normalizeName(n)
    if (normalized && !names.includes(normalized)) names.push(normalized)
  }

  const similarMap = new Map<string, Contact>()
  for (const n of names) {
    const { data } = await supabase.rpc('find_similar_contacts', {
      input_name: n,
      threshold: SIMILARITY_THRESHOLD,
    })
    for (const row of (data ?? []) as Contact[]) {
      if (exactMap.has(row.id)) continue
      if (similarMap.has(row.id)) continue
      similarMap.set(row.id, row)
    }
  }

  return {
    exact: Array.from(exactMap.values()),
    similar: Array.from(similarMap.values()),
  }
}
