import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { escapeLikePattern, orQuote } from '@/lib/likeEscape'

// Lightweight contact search for pickers (e.g. pending merge to existing).
// Returns up to 10 matches by name / name_en / company / email (ilike).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ results: [] })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  // orQuote wraps the pattern so a comma/parenthesis in the query can't break
  // the .or() delimiter syntax; escapeLikePattern keeps %/_ literal.
  const pat = orQuote(`%${escapeLikePattern(q)}%`)
  const { data } = await db
    .from('contacts')
    .select('id, name, name_en, company, email')
    .is('deleted_at', null)
    .or(`name.ilike.${pat},name_en.ilike.${pat},company.ilike.${pat},email.ilike.${pat}`)
    .limit(10)
  return NextResponse.json({ results: data ?? [] })
}
