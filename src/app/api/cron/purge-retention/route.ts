import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { recordCronRun } from '@/lib/cronHeartbeat'

/**
 * Vercel Cron — daily data-retention purge.
 *
 * Deletes expired/soft-deleted rows across several tables so they don't grow
 * unbounded. Runs once a day, offset from the other crons to avoid overlap.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/purge-retention", "schedule": "30 19 * * *" }
 */

// ── Retention windows (天) ──────────────────────────────────────────────────
const TRASH_CONTACT_DAYS = 90        // 垃圾桶聯絡人：軟刪除逾 90 天 → 永久刪除
const BOT_SESSION_DAYS = 30          // bot_sessions：updated_at 逾 30 天 → 刪除
const TELEGRAM_DEDUP_DAYS = 7        // telegram_dedup：processed_at 逾 7 天 → 刪除
const AGENT_TOKEN_EXPIRED_DAYS = 30  // agent_tokens：expires_at 過期逾 30 天 → 刪除
const COMPOSE_CACHE_DAYS = 1         // newsletter_compose_cache：created_at 逾 1 天 → 刪除
const MAX_CONTACTS_PER_RUN = 50      // 每次最多永久刪除 50 個聯絡人（避免超時）

const DAY_MS = 24 * 60 * 60 * 1000
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startMs = Date.now()
  const service = createServiceClient()
  const result = {
    contacts_purged: 0,
    storage_files_removed: 0,
    bot_sessions_deleted: 0,
    telegram_dedup_deleted: 0,
    agent_tokens_deleted: 0,
    compose_cache_deleted: 0,
  }

  // ── 1. 垃圾桶聯絡人 > 90 天 ────────────────────────────────────────────────
  // 重用 src/app/api/contacts/[id]/permanent/route.ts 的模式：
  // 先讀出 contact_cards + contact_photos 的 storage_path（皆存於 'cards' bucket）
  // → 刪 storage 檔案 → 再刪 contacts 列（CASCADE 清子表）。
  // 一次最多 MAX_CONTACTS_PER_RUN 筆，剩餘的留待隔日續清。
  {
    const { data: stale, error } = await service
      .from('contacts')
      .select('id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', daysAgo(TRASH_CONTACT_DAYS))
      .limit(MAX_CONTACTS_PER_RUN)
    if (error) {
      console.error('[purge-retention] load stale contacts failed:', error.message)
      await recordCronRun(service, 'purge-retention', 'error', { error: error.message }, Date.now() - startMs)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const ids = (stale ?? []).map((c) => c.id as string)
    if (ids.length > 0) {
      const [{ data: cards }, { data: photos }] = await Promise.all([
        service.from('contact_cards').select('storage_path').in('contact_id', ids),
        service.from('contact_photos').select('storage_path').in('contact_id', ids),
      ])
      const paths = [...(cards ?? []), ...(photos ?? [])]
        .map((c: { storage_path: string | null }) => c.storage_path)
        .filter(Boolean) as string[]
      if (paths.length > 0) {
        const { error: rmErr } = await service.storage.from('cards').remove(paths)
        if (rmErr) console.error('[purge-retention] storage remove failed:', rmErr.message)
        else result.storage_files_removed = paths.length
      }
      const { error: delErr } = await service.from('contacts').delete().in('id', ids)
      if (delErr) {
        console.error('[purge-retention] delete contacts failed:', delErr.message)
        await recordCronRun(service, 'purge-retention', 'error', { error: delErr.message }, Date.now() - startMs)
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
      result.contacts_purged = ids.length
    }
  }

  // ── 2. bot_sessions：updated_at 逾 30 天 ───────────────────────────────────
  // schema: scripts/supabase-migration/artifacts/source-migrations.json
  //   → create table bot_sessions (... updated_at timestamptz default now())
  {
    const { count, error } = await service
      .from('bot_sessions')
      .delete({ count: 'exact' })
      .lt('updated_at', daysAgo(BOT_SESSION_DAYS))
    if (error) console.error('[purge-retention] bot_sessions delete failed:', error.message)
    else result.bot_sessions_deleted = count ?? 0
  }

  // ── 3. telegram_dedup：processed_at 逾 7 天 ────────────────────────────────
  // schema: scripts/supabase-migration/artifacts/source-migrations.json
  //   → create table telegram_dedup (update_id bigint pk, processed_at timestamptz ...)
  {
    const { count, error } = await service
      .from('telegram_dedup')
      .delete({ count: 'exact' })
      .lt('processed_at', daysAgo(TELEGRAM_DEDUP_DAYS))
    if (error) console.error('[purge-retention] telegram_dedup delete failed:', error.message)
    else result.telegram_dedup_deleted = count ?? 0
  }

  // ── 4. agent_tokens：expires_at 過期逾 30 天 ───────────────────────────────
  // schema: supabase/mcp_v2_agent_tokens.sql → expires_at TIMESTAMPTZ (NULL = never).
  // NULL 的 token 不會被 .lt 命中，故永不刪除。
  {
    const { count, error } = await service
      .from('agent_tokens')
      .delete({ count: 'exact' })
      .lt('expires_at', daysAgo(AGENT_TOKEN_EXPIRED_DAYS))
    if (error) console.error('[purge-retention] agent_tokens delete failed:', error.message)
    else result.agent_tokens_deleted = count ?? 0
  }

  // ── 5. newsletter_compose_cache：created_at 逾 1 天 ────────────────────────
  // schema: src/app/api/newsletter/compose-from-drafts/route.ts 使用 created_at 過濾。
  {
    const { count, error } = await service
      .from('newsletter_compose_cache')
      .delete({ count: 'exact' })
      .lt('created_at', daysAgo(COMPOSE_CACHE_DAYS))
    if (error) console.error('[purge-retention] compose_cache delete failed:', error.message)
    else result.compose_cache_deleted = count ?? 0
  }

  await recordCronRun(service, 'purge-retention', 'ok', result, Date.now() - startMs)
  return NextResponse.json({ ok: true, ...result })
}

export const maxDuration = 300
