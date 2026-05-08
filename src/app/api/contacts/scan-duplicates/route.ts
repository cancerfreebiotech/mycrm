import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  // Delete previous non-ignored scan results
  const { error: delErr } = await supabase
    .from('duplicate_pairs')
    .delete()
    .eq('is_ignored', false)
  if (delErr) {
    return NextResponse.json({ error: `刪除舊記錄失敗：${delErr.message}` }, { status: 500 })
  }

  // 1. Exact email duplicates
  const { data: emailDups, error: emailErr } = await supabase.rpc('find_email_duplicates') as {
    data: Array<{ id_a: string; id_b: string }> | null
    error: { message: string } | null
  }
  if (emailErr) {
    return NextResponse.json({ error: `Email 掃描失敗：${emailErr.message}` }, { status: 500 })
  }

  // 2. Exact name duplicates (full table, no limit — finds same canonical name across all contacts)
  const { data: exactNameDups, error: exactNameErr } = await supabase.rpc('find_exact_name_duplicates') as {
    data: Array<{ id_a: string; id_b: string }> | null
    error: { message: string } | null
  }
  if (exactNameErr) {
    return NextResponse.json({ error: `完全相同名稱掃描失敗：${exactNameErr.message}` }, { status: 500 })
  }

  // 3. Similar name duplicates (pg_trgm, full table, excludes exact matches)
  const { data: nameDups, error: nameErr } = await supabase.rpc('find_name_duplicates') as {
    data: Array<{ id_a: string; id_b: string; score: number }> | null
    error: { message: string } | null
  }
  if (nameErr) {
    return NextResponse.json({ error: `相似名稱掃描失敗：${nameErr.message}` }, { status: 500 })
  }

  const seen = new Set<string>()
  const inserts: Array<{
    contact_id_a: string
    contact_id_b: string
    match_type: string
    similarity_score: number | null
  }> = []

  for (const r of emailDups ?? []) {
    const key = [r.id_a, r.id_b].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      inserts.push({ contact_id_a: r.id_a, contact_id_b: r.id_b, match_type: 'exact_email', similarity_score: null })
    }
  }
  for (const r of exactNameDups ?? []) {
    const key = [r.id_a, r.id_b].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      inserts.push({ contact_id_a: r.id_a, contact_id_b: r.id_b, match_type: 'similar_name', similarity_score: 1.0 })
    }
  }
  for (const r of nameDups ?? []) {
    const key = [r.id_a, r.id_b].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      inserts.push({ contact_id_a: r.id_a, contact_id_b: r.id_b, match_type: 'similar_name', similarity_score: r.score })
    }
  }

  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from('duplicate_pairs').insert(inserts)
    if (insertErr) {
      return NextResponse.json({ error: `寫入失敗：${insertErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ found: inserts.length })
}
