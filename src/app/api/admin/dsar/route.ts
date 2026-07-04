import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'
import { checkSuppression } from '@/app/api/admin/suppressions/route'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so this
// handler MUST self-guard. Super-admin only. Mirrors /api/admin/hunter.
async function requireSuperAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: user.email }
}

// Basic email syntax — also guards the PostgREST .or() filter value below.
const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

// GET ?email=<addr> — DSAR (data subject access request) lookup.
// Finds every contact whose email OR second_email matches (case-insensitive
// exact) and reports the personal-data footprint of each, plus the shared
// suppression verdict for the queried address.
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const service = createServiceClient()

  const emailParam = req.nextUrl.searchParams.get('email')?.trim()
  if (!emailParam) return NextResponse.json({ error: 'email required' }, { status: 400 })
  if (!VALID_EMAIL.test(emailParam)) return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  const email = emailParam.toLowerCase()

  // Audit every lookup — DSARs touch personal data and must be traceable.
  await logAdminAction(service, { actorEmail: auth.email, action: 'dsar_lookup', target: email })

  // Include soft-deleted contacts: a data subject request must surface all
  // records tied to the address, trashed or not.
  const { data: contacts, error } = await service
    .from('contacts')
    .select('id, name, company, created_at, deleted_at, users!created_by(display_name)')
    .or(`email.ilike.${email},second_email.ilike.${email}`)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const verdict = await checkSuppression(service, email)

  const rows = await Promise.all((contacts ?? []).map(async (c) => {
    const [logs, cards, recips] = await Promise.all([
      service.from('interaction_logs').select('id', { count: 'exact', head: true }).eq('contact_id', c.id),
      service.from('contact_cards').select('id', { count: 'exact', head: true }).eq('contact_id', c.id),
      service.from('newsletter_recipients').select('id', { count: 'exact', head: true }).eq('contact_id', c.id),
    ])
    // users!created_by embed may come back as an object or a single-element array
    // depending on FK inference — normalize to a name string.
    const creatorRel = c.users as { display_name: string | null } | { display_name: string | null }[] | null
    const creator = Array.isArray(creatorRel) ? (creatorRel[0]?.display_name ?? null) : (creatorRel?.display_name ?? null)
    return {
      id: c.id,
      name: c.name,
      company: c.company,
      created_at: c.created_at,
      deleted: !!c.deleted_at,
      creator,
      counts: {
        interaction_logs: logs.count ?? 0,
        contact_cards: cards.count ?? 0,
        newsletter_recipients: recips.count ?? 0,
      },
      verdict,
    }
  }))

  return NextResponse.json({ email, verdict, contacts: rows })
}
