import type { SupabaseClient } from '@supabase/supabase-js'
import { generateContactBriefing, type BriefingContactInput } from './briefing'
import { sendTelegramMessage } from './telegram'

// 非同步處理 contact_briefings 佇列。複用 pending-ocr-worker 的三件事：
//   1. unstick：processing 超過 STUCK_MINUTES 視為卡住 → 退回 pending
//   2. 樂觀 claim：update ... where status='pending'，搶不到就跳過（防重複處理）
//   3. retry：失敗 retry_count++，達 MAX_RETRY 設 failed
const MAX_RETRY = 2
const STUCK_MINUTES = 10
const BATCH = 3 // 每次 cron 處理少量，避免逼近 maxDuration

const CONTACT_FIELDS = 'name, name_en, company, company_en, job_title, department, website, linkedin_url, country_code'

const NOTIFY_PREVIEW_CHARS = 400

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 去除常見 Markdown 語法，供 Telegram 純文字預覽使用
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')            // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // links → text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')         // headings
    .replace(/^\s{0,3}>\s?/gm, '')              // blockquotes
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')     // horizontal rules
    .replace(/^\s*[-*+]\s+/gm, '')              // bullet lists
    .replace(/^\s*\d+\.\s+/gm, '')              // ordered lists
    .replace(/(\*\*|__)(.*?)\1/g, '$2')         // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')            // italic
    .replace(/~~(.*?)~~/g, '$1')                // strikethrough
    .replace(/\n{3,}/g, '\n\n')                 // collapse blank lines
    .trim()
}

export interface BriefingBatchResult {
  processed: number
  failed: number
  requeued: number
}

export async function processPendingBriefings(supabase: SupabaseClient): Promise<BriefingBatchResult> {
  let processed = 0
  let failed = 0

  // 1. unstick 卡住的 processing 列
  const stuckCutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString()
  const { data: requeuedRows } = await supabase
    .from('contact_briefings')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('processed_at', stuckCutoff)
    .select('id')
  const requeued = requeuedRows?.length ?? 0

  // 2. 取一批 pending（最舊優先；pre_meeting 以 meeting_at 排序的需求可後續加）
  const { data: pending } = await supabase
    .from('contact_briefings')
    .select('id, contact_id, retry_count, notify_user_id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH)

  for (const row of pending ?? []) {
    // 樂觀 claim：只有仍是 pending 才搶得到
    const { data: claimed } = await supabase
      .from('contact_briefings')
      .update({ status: 'processing', processed_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    try {
      const { data: contact, error: cErr } = await supabase
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('id', row.contact_id)
        .single()
      if (cErr || !contact) throw new Error(cErr?.message ?? 'contact not found')

      const briefing = await generateContactBriefing(contact as unknown as BriefingContactInput)

      await supabase
        .from('contact_briefings')
        .update({
          status: 'done',
          result_md: briefing.markdown,
          sources: briefing.sources,
          model_used: briefing.modelUsed,
          error_message: null,
          processed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      processed++

      // 通知：done 之後若有指定通知對象，best-effort 推送到 Telegram。
      // 整段包在自己的 try/catch，任何失敗都不得影響 done 狀態或往外 throw。
      if (row.notify_user_id) {
        try {
          const { data: notifyUser } = await supabase
            .from('users')
            .select('telegram_id')
            .eq('id', row.notify_user_id)
            .maybeSingle()
          const telegramId = notifyUser?.telegram_id == null ? NaN : Number(notifyUser.telegram_id)
          if (Number.isFinite(telegramId) && telegramId !== 0) {
            const c = contact as unknown as { name?: string | null; name_en?: string | null }
            const name = c.name || c.name_en || '（姓名不詳）'
            const preview = stripMarkdown(briefing.markdown ?? '').slice(0, NOTIFY_PREVIEW_CHARS)
            const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
            const link = `${base}/contacts/${row.contact_id}`
            const text = `📋 <b>${esc(name)}</b> 的 briefing 完成\n\n${esc(preview)}\n\n${link}`
            await sendTelegramMessage(telegramId, text)
          }
        } catch (notifyErr) {
          console.error(
            '[social-briefing] notify failed',
            row.id,
            notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          )
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const nextRetry = (row.retry_count ?? 0) + 1
      const giveUp = nextRetry >= MAX_RETRY
      await supabase
        .from('contact_briefings')
        .update({
          status: giveUp ? 'failed' : 'pending',
          retry_count: nextRetry,
          error_message: msg.slice(0, 500),
        })
        .eq('id', row.id)
      if (giveUp) failed++
    }
  }

  return { processed, failed, requeued }
}
