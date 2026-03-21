import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/contacts/scan-duplicates
 * Scans for duplicate contacts using:
 *   1. Exact email match
 *   2. Name similarity >= 0.6 (pg_trgm)
 * Writes results to duplicate_pairs table (clears previous non-ignored pairs first).
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  // Delete previous non-ignored scan results
  await supabase.from('duplicate_pairs').delete().eq('is_ignored', false)

  // 1. Exact email duplicates
  const { data: emailDups } = await supabase.rpc('find_email_duplicates') as { data: Array<{ id_a: string; id_b: string }> | null }

  // 2. Similar name duplicates (pg_trgm)
  const { data: nameDups } = await supabase.rpc('find_name_duplicates') as { data: Array<{ id_a: string; id_b: string; score: number }> | null }

  const inserts: Array<{
    contact_id_a: string
    contact_id_b: string
    match_type: string
    similarity_score: number | null
  }> = []

  const seen = new Set<string>()

  for (const r of emailDups ?? []) {
    const key = [r.id_a, r.id_b].sort().join('|')
    if (!seen.has(key)) { seen.add(key); inserts.push({ contact_id_a: r.id_a, contact_id_b: r.id_b, match_type: 'exact_email', similarity_score: null }) }
  }
  for (const r of nameDups ?? []) {
    const key = [r.id_a, r.id_b].sort().join('|')
    if (!seen.has(key)) { seen.add(key); inserts.push({ contact_id_a: r.id_a, contact_id_b: r.id_b, match_type: 'similar_name', similarity_score: r.score }) }
  }

  if (inserts.length > 0) {
    await supabase.from('duplicate_pairs').insert(inserts)
  }

  return NextResponse.json({ found: inserts.length })
}
