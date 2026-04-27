import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

// Lightweight contact search for pickers (e.g. pending merge to existing).
// Returns up to 10 matches by name / name_en / company / email (ilike).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ results: [] })

  const escaped = q.replace(/[%_\\]/g, '\\$&')
  const { data } = await supabase
    .from('contacts')
    .select('id, name, name_en, company, email')
    .is('deleted_at', null)
    .or(`name.ilike.%${escaped}%,name_en.ilike.%${escaped}%,company.ilike.%${escaped}%,email.ilike.%${escaped}%`)
    .limit(10)
  return NextResponse.json({ results: data ?? [] })
}
