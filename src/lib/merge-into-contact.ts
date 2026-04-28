import type { SupabaseClient } from '@supabase/supabase-js'

// Shared merge-card-into-existing-contact logic for three surfaces:
//   1. Telegram bot sync flow (src/app/api/bot/route.ts merge_/replace_ callbacks)
//   2. Pending review web (src/app/api/contacts-pending/[id]/route.ts)
//   3. Camcard admin (src/app/api/camcard/[id]/merge/route.ts)
//
// Two modes:
//   - 'fill'    : empty fields populated from new data; non-empty conflicts kept
//                 (existing value wins) and noted in interaction_log
//   - 'replace' : non-empty conflicts overwritten with new values; previous values
//                 archived in interaction_log so history isn't lost (career change scenario)

export type MergeMode = 'fill' | 'replace'

const MERGE_FIELDS: Record<string, string> = {
  name: '姓名',
  name_en: '英文名',
  name_local: '當地語名',
  company: '公司',
  company_en: '英文公司',
  company_local: '當地語公司',
  job_title: '職稱',
  department: '部門',
  email: 'Email',
  second_email: '備用 Email',
  phone: '電話',
  second_phone: '備用電話',
  fax: '傳真',
  address: '地址',
  address_en: '英文地址',
  website: '網站',
  linkedin_url: 'LinkedIn',
  facebook_url: 'Facebook',
  country_code: '國家',
}

export interface MergeIntoContactInput {
  targetId: string
  newData: Record<string, unknown>
  cardImgUrl?: string | null
  cardImgBackUrl?: string | null
  storagePath?: string | null
  cardLabel?: string
  mode: MergeMode
  userId: string | null
  tagIds?: string[]
  logPrefix?: string
}

export interface MergeIntoContactResult {
  ok: boolean
  contact_id: string
  contact_name?: string | null
  filled: number
  replaced: number
  conflicts: number
  error?: string
}

export async function mergeIntoContact(
  supabase: SupabaseClient,
  input: MergeIntoContactInput,
): Promise<MergeIntoContactResult> {
  const cols = ['id', 'name', ...Object.keys(MERGE_FIELDS).filter((c) => c !== 'name')].join(', ')
  const { data: existingRaw, error: fetchErr } = await supabase
    .from('contacts')
    .select(cols)
    .eq('id', input.targetId)
    .single()
  if (fetchErr || !existingRaw) {
    return { ok: false, error: fetchErr?.message ?? 'Contact not found', contact_id: input.targetId, filled: 0, replaced: 0, conflicts: 0 }
  }
  // Dynamic-string select() returns a generic type; cast via unknown for field access
  const existing = existingRaw as unknown as Record<string, string | null | undefined>

  const updates: Record<string, unknown> = {}
  const conflictsList: Array<{ key: string; label: string; newVal: string; oldVal: string }> = []
  let filled = 0
  let replaced = 0

  for (const [key, label] of Object.entries(MERGE_FIELDS)) {
    const newVal = input.newData[key] as string | null | undefined
    const oldVal = existing[key]
    if (!newVal) continue
    if (!oldVal) {
      updates[key] = newVal
      filled++
    } else if (oldVal !== newVal) {
      if (input.mode === 'replace') {
        updates[key] = newVal
        replaced++
        conflictsList.push({ key, label, newVal, oldVal })
      } else {
        conflictsList.push({ key, label, newVal, oldVal })
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('contacts').update(updates).eq('id', input.targetId)
  }

  if (input.cardImgUrl) {
    await supabase.from('contact_cards').insert({
      contact_id: input.targetId,
      card_img_url: input.cardImgUrl,
      card_img_back_url: input.cardImgBackUrl ?? null,
      storage_path: input.storagePath ?? null,
      label: input.cardLabel ?? null,
    })
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const { data: existingLinks } = await supabase
      .from('contact_tags')
      .select('tag_id')
      .eq('contact_id', input.targetId)
    const existingSet = new Set(((existingLinks ?? []) as { tag_id: string }[]).map((r) => r.tag_id))
    const toAdd = input.tagIds.filter((id) => !existingSet.has(id))
    if (toAdd.length > 0) {
      await supabase.from('contact_tags').insert(
        toAdd.map((tagId) => ({ contact_id: input.targetId, tag_id: tagId }))
      )
    }
  }

  if (conflictsList.length > 0) {
    const prefix = input.logPrefix ?? (input.mode === 'replace' ? '更新聯絡人資料' : '合併新名片資料')
    const lines = conflictsList.map((c) =>
      input.mode === 'replace'
        ? `${c.label}：原 ${c.oldVal}，更新為 ${c.newVal}`
        : `${c.label}：${c.newVal}（現有：${c.oldVal}）`
    ).join('\n')
    const subject = input.mode === 'replace' ? '變更欄位' : '與現有不同的欄位'
    await supabase.from('interaction_logs').insert({
      contact_id: input.targetId,
      type: 'system',
      content: `${prefix}（${subject}）：\n${lines}`,
      created_by: input.userId,
    })
  }

  return {
    ok: true,
    contact_id: input.targetId,
    contact_name: existing.name ?? null,
    filled,
    replaced,
    conflicts: conflictsList.length,
  }
}
