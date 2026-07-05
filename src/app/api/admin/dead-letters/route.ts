import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'
import type { SupabaseClient } from '@supabase/supabase-js'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so every
// handler here MUST self-guard. Super-admin only. Returns a response on denial, else null.
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

interface RecentItem { id: string; error: string | null; at: string | null; meta?: string }
interface TableReport { table: string; failed: number; recent: RecentItem[] }

async function pendingContacts(sb: OrgDb): Promise<TableReport> {
  const { count } = await sb
    .from('pending_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
  const { data } = await sb
    .from('pending_contacts')
    .select('id, error_message, processed_at, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(5)
  const recent: RecentItem[] = (data ?? []).map((r: { id: string; error_message: string | null; processed_at: string | null; created_at: string | null }) => ({
    id: r.id as string,
    error: (r.error_message as string | null) ?? null,
    at: (r.processed_at as string | null) ?? (r.created_at as string | null) ?? null,
  }))
  return { table: 'pending_contacts', failed: count ?? 0, recent }
}

async function contactBriefings(sb: OrgDb): Promise<TableReport> {
  const { count } = await sb
    .from('contact_briefings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
  const { data } = await sb
    .from('contact_briefings')
    .select('id, error_message, processed_at, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(5)
  const recent: RecentItem[] = (data ?? []).map((r: { id: string; error_message: string | null; processed_at: string | null; created_at: string | null }) => ({
    id: r.id as string,
    error: (r.error_message as string | null) ?? null,
    at: (r.processed_at as string | null) ?? (r.created_at as string | null) ?? null,
  }))
  return { table: 'contact_briefings', failed: count ?? 0, recent }
}

async function newsletterRecipients(sb: OrgDb): Promise<TableReport> {
  const { count } = await sb
    .from('newsletter_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
  // No error column on this table; email doubles as the human-readable id.
  const { data } = await sb
    .from('newsletter_recipients')
    .select('email, sent_at')
    .eq('status', 'failed')
    .order('sent_at', { ascending: false })
    .limit(5)
  const recent: RecentItem[] = (data ?? []).map((r: { email: string | null; sent_at: string | null }) => ({
    id: (r.email as string | null) ?? '',
    error: null,
    at: (r.sent_at as string | null) ?? null,
  }))
  return { table: 'newsletter_recipients', failed: count ?? 0, recent }
}

async function failedScans(sb: OrgDb): Promise<TableReport> {
  // failed_scans is itself the dead-letter table — every row is a failure.
  const { count } = await sb
    .from('failed_scans')
    .select('id', { count: 'exact', head: true })
  const { data } = await sb
    .from('failed_scans')
    .select('id, note, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  const recent: RecentItem[] = (data ?? []).map((r: { id: string; note: string | null; created_at: string | null }) => ({
    id: r.id as string,
    error: (r.note as string | null) ?? null,
    at: (r.created_at as string | null) ?? null,
  }))
  return { table: 'failed_scans', failed: count ?? 0, recent }
}

async function botErrors(sb: SupabaseClient): Promise<TableReport> {
  // bot_errors — Telegram webhook 處理失敗的 dead-letter；resolved=false 視為未處理。
  const { count } = await sb
    .from('bot_errors')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)
  const { data } = await sb
    .from('bot_errors')
    .select('id, error_message, update_type, chat_id, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(5)
  const recent: RecentItem[] = (data ?? []).map((r) => ({
    id: r.id as string,
    error: (r.error_message as string | null) ?? null,
    at: (r.created_at as string | null) ?? null,
    meta: `${(r.update_type as string | null) ?? 'other'} · chat_id ${(r.chat_id as number | null) ?? '—'}`,
  }))
  return { table: 'bot_errors', failed: count ?? 0, recent }
}

// GET — aggregate failed/dead-letter counts across the 5 async pipelines.
export async function GET() {
  const denied = await requireSuperAdmin(); if (denied) return denied
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const sb = createServiceClient()
  const tables = await Promise.all([
    pendingContacts(db),
    contactBriefings(db),
    newsletterRecipients(db),
    failedScans(db),
    botErrors(sb),
  ])
  return NextResponse.json({ tables })
}

// POST — requeue a table's failed rows back to 'pending' for the worker to retry.
export async function POST(req: NextRequest) {
  const denied = await requireSuperAdmin(); if (denied) return denied
  const { table } = (await req.json().catch(() => ({}))) as { table?: string }

  // newsletter_recipients has no safe requeue: 'failed' rows aren't reprocessed by
  // any worker, and the campaign send path only dedups on 'sent'. Flipping status
  // here would risk double-sends — the intended retry is the campaign resend flow.
  if (table === 'newsletter_recipients') {
    return NextResponse.json({ error: '請用 campaign 頁的續寄' }, { status: 400 })
  }
  if (table !== 'pending_contacts' && table !== 'contact_briefings') {
    return NextResponse.json({ error: '不支援的 table' }, { status: 400 })
  }

  const sb = createServiceClient()
  const { data, error } = await sb
    .from(table)
    .update({ status: 'pending', retry_count: 0, error_message: null })
    .eq('status', 'failed')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requeued: data?.length ?? 0 })
}
