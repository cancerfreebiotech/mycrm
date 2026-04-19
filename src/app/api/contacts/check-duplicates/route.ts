import { NextRequest, NextResponse } from 'next/server'
import { checkDuplicates, type CheckDuplicatesInput } from '@/lib/duplicate'

/**
 * POST /api/contacts/check-duplicates
 *
 * Server-side duplicate check. Replaces ad-hoc client-side Supabase queries in
 * `contacts/new` and `batch-upload`, so the logic stays in one place and cannot
 * be bypassed by tweaking the browser.
 *
 * Body: { email?, secondEmail?, name?, nameEn?, nameLocal? }
 * Returns: { exact: Contact[], similar: Contact[] }
 */
export async function POST(req: NextRequest) {
  let body: CheckDuplicatesInput
  try {
    body = (await req.json()) as CheckDuplicatesInput
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const hasAny =
    body.email?.trim() ||
    body.secondEmail?.trim() ||
    body.name?.trim() ||
    body.nameEn?.trim() ||
    body.nameLocal?.trim()
  if (!hasAny) {
    return NextResponse.json({ exact: [], similar: [] })
  }

  try {
    const result = await checkDuplicates(body)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
