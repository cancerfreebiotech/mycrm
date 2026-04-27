import type { SupabaseClient } from '@supabase/supabase-js'
import { analyzeBusinessCard } from '@/lib/gemini'
import { checkDuplicates } from '@/lib/duplicate'
import { sendTelegramMessage } from '@/lib/telegram'

interface PendingRow {
  id: string
  storage_path: string | null
  data: Record<string, unknown>
  status: string
  retry_count: number
  created_by: string
}

const MAX_RETRY = 3
const PER_USER_BATCH_SIZE = 10

function countryToLanguage(code: string | null | undefined): string {
  if (code === 'TW' || code === 'CN') return 'chinese'
  if (code === 'JP') return 'japanese'
  return 'english'
}

function getPublicUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from('cards').getPublicUrl(path).data.publicUrl
}

export async function processOnePending(
  supabase: SupabaseClient,
  row: PendingRow,
  aiModelId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!row.storage_path) {
    await supabase
      .from('pending_contacts')
      .update({ status: 'failed', error_message: 'no storage_path' })
      .eq('id', row.id)
    return { ok: false, error: 'no storage_path' }
  }

  // Optimistic mark to prevent double-processing
  const { error: claimErr, data: claimed } = await supabase
    .from('pending_contacts')
    .update({ status: 'processing' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (claimErr || !claimed) return { ok: false, error: 'already claimed' }

  try {
    const { data: file, error: dlErr } = await supabase.storage
      .from('cards')
      .download(row.storage_path)
    if (dlErr || !file) throw new Error(dlErr?.message ?? 'storage download failed')

    const imgBuffer = Buffer.from(await file.arrayBuffer())
    const cardData = await analyzeBusinessCard(imgBuffer, aiModelId)

    if (!cardData.name && cardData.name_en) cardData.name = cardData.name_en
    if (!cardData.name && cardData.name_local) cardData.name = cardData.name_local

    if (!cardData.name) {
      // No name → move image to failed_scans, drop pending row
      await supabase.from('failed_scans').insert({
        user_id: row.created_by,
        storage_path: row.storage_path,
        card_img_url: getPublicUrl(supabase, row.storage_path),
      })
      await supabase.from('pending_contacts').delete().eq('id', row.id)
      return { ok: false, error: 'no name detected' }
    }

    const { exact, similar } = await checkDuplicates({
      email: cardData.email,
      secondEmail: cardData.second_email,
      name: cardData.name,
      nameEn: cardData.name_en,
      nameLocal: cardData.name_local,
    })
    let mergeTargetId: string | null = null
    let mergeTargetName: string | null = null
    if (exact.length > 0) {
      mergeTargetId = exact[0].id
      mergeTargetName = exact[0].name
    } else if (similar.length > 0) {
      mergeTargetId = similar[0].id
      mergeTargetName = similar[0].name
    }

    const cardImgUrl = getPublicUrl(supabase, row.storage_path)
    // Preserve fields already set on the row (e.g. met_at / met_date / referred_by
    // carried in from /b 描述). Spread existing first so OCR fields override only
    // OCR-tracked keys (CardData has no met_*).
    const existingData = (row.data ?? {}) as Record<string, unknown>
    const updatedData = {
      ...existingData,
      ...cardData,
      card_img_url: cardImgUrl,
      language: countryToLanguage(cardData.country_code),
      _merge_target_id: mergeTargetId,
      _merge_target_name: mergeTargetName,
    }

    await supabase
      .from('pending_contacts')
      .update({
        data: updatedData,
        status: 'done',
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const newRetryCount = row.retry_count + 1
    const finalStatus = newRetryCount >= MAX_RETRY ? 'failed' : 'pending'
    await supabase
      .from('pending_contacts')
      .update({
        status: finalStatus,
        retry_count: newRetryCount,
        error_message: msg.slice(0, 500),
      })
      .eq('id', row.id)
    return { ok: false, error: msg }
  }
}

export async function processPendingForUser(
  supabase: SupabaseClient,
  userId: string,
  telegramId: number | null,
): Promise<{ done: number; failed: number; total: number }> {
  const { data: rows } = await supabase
    .from('pending_contacts')
    .select('id, storage_path, data, status, retry_count, created_by')
    .eq('created_by', userId)
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRY)
    .order('created_at', { ascending: true })
    .limit(PER_USER_BATCH_SIZE)

  if (!rows || rows.length === 0) return { done: 0, failed: 0, total: 0 }

  const { data: user } = await supabase
    .from('users')
    .select('ai_model_id')
    .eq('id', userId)
    .single()
  const aiModelId = (user?.ai_model_id as string | null) ?? null

  let done = 0
  let failed = 0
  for (const row of rows as PendingRow[]) {
    const result = await processOnePending(supabase, row, aiModelId)
    if (result.ok) done++
    else failed++
  }

  if (telegramId) {
    const total = done + failed
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
    const link = appUrl ? `\n\n👉 <a href="${appUrl}/contacts/pending">前往審核</a>` : ''
    const failedNote = failed > 0 ? `\n❌ 失敗 ${failed} 張（已移到「我的失敗辨識」）` : ''
    await sendTelegramMessage(
      telegramId,
      `✅ 已完成辨識 ${done}/${total} 張${failedNote}${link}`
    )
  }

  return { done, failed, total: done + failed }
}

export async function processPendingBatchAcrossUsers(
  supabase: SupabaseClient
): Promise<{ users_processed: number; total: number }> {
  // Cron-mode: pick stale pending rows (>2 min old) across all users, group by user
  const cutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: rows } = await supabase
    .from('pending_contacts')
    .select('created_by')
    .eq('status', 'pending')
    .lt('retry_count', MAX_RETRY)
    .lt('created_at', cutoffIso)
    .limit(100)

  if (!rows || rows.length === 0) return { users_processed: 0, total: 0 }

  const uniqueUsers = Array.from(
    new Set(rows.map((r) => r.created_by as string | null).filter((id): id is string => !!id))
  )

  let total = 0
  for (const userId of uniqueUsers) {
    const { data: u } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('id', userId)
      .single()
    const telegramId = (u?.telegram_id as number | null) ?? null
    const result = await processPendingForUser(supabase, userId, telegramId)
    total += result.total
  }

  return { users_processed: uniqueUsers.length, total }
}
