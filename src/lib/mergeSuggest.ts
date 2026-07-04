import Portkey from 'portkey-ai'

// AI 合併方向建議（duplicates 頁）。gemini.ts 沒有 export portkeyGenerate，
// 故比照 src/app/api/contacts/ai-merge-review/route.ts 的做法，在本檔保留一個
// 小型 Portkey 呼叫（同一組 Portkey config：loadbalance + fallback 由 dashboard 管理）。
const AI_MODEL = process.env.AI_REVIEW_MODEL ?? 'gemini-3.1-flash-lite'

export interface MergeFieldNote {
  field: string
  keep_value: string | null
  source_value: string | null
  note: string
}

export interface MergeSuggestion {
  recommended_keep_id: string
  confidence: number
  field_notes: MergeFieldNote[]
  rationale: string
}

export type ContactRow = Record<string, unknown> & { id: string }

function stripJsonFence(t: string): string {
  return t.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
}

async function generate(prompt: string): Promise<string> {
  const portkey = new Portkey({
    apiKey: process.env.PORTKEY_API_KEY!,
    config: process.env.PORTKEY_CONFIG_ID!,
    timeout: 60_000,
  })
  const r = await portkey.chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = r.choices?.[0]?.message?.content
  const text = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw.map((p) => ('text' in p ? p.text : '')).join('')
      : ''
  return text.trim()
}

function toStringOrNull(v: unknown): string | null {
  if (v == null || v === '') return null
  return typeof v === 'string' ? v : String(v)
}

// 依系統合併規則（/api/contacts/[id]/merge：保留方已有值的欄位不變、空欄位才從來源補入、
// 來源刪除）建議合併方向，並針對「雙方皆有值且不同」的欄位（來源值會遺失）逐一加註。
export async function suggestMergePlan(a: ContactRow, b: ContactRow): Promise<MergeSuggestion> {
  const prompt = `你是 CRM 聯絡人合併規劃助手。系統的合併規則：使用者選定一筆「保留」聯絡人後，另一筆（來源）會被刪除；保留聯絡人已有值的欄位不變，只有空白欄位才會從來源補入；名片、互動紀錄、標籤等關聯資料全部移到保留聯絡人。

【聯絡人 A】
${JSON.stringify(a, null, 2)}

【聯絡人 B】
${JSON.stringify(b, null, 2)}

【任務】
- recommended_keep_id：建議保留哪一筆，填該筆的 id（資料較完整、較新、較可信者優先）
- confidence：0 到 1 之間的信心值
- field_notes：列出「兩筆同一欄位皆有值且內容不同」的欄位；依合併規則，來源該欄位的值會遺失。keep_value 填建議保留那筆的值、source_value 填另一筆的值、note 用繁體中文簡短說明取捨（例如來源值較新、需人工手動搬移）。沒有衝突欄位則回傳空陣列
- rationale：用繁體中文 1-2 句話說明整體建議理由

【只回傳 JSON，不要 markdown、不要多餘文字】
{"recommended_keep_id":"uuid","confidence":0.0,"field_notes":[{"field":"","keep_value":"","source_value":"","note":""}],"rationale":""}`

  const raw = await generate(prompt)
  const parsed = JSON.parse(stripJsonFence(raw)) as Partial<MergeSuggestion>

  const keepId = parsed.recommended_keep_id
  if (keepId !== a.id && keepId !== b.id) throw new Error('AI 回傳的 recommended_keep_id 無效')
  const confidence = typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0
  const fieldNotes: MergeFieldNote[] = Array.isArray(parsed.field_notes)
    ? parsed.field_notes
        .filter((n): n is MergeFieldNote => !!n && typeof (n as { field?: unknown }).field === 'string')
        .map((n) => ({
          field: n.field,
          keep_value: toStringOrNull(n.keep_value),
          source_value: toStringOrNull(n.source_value),
          note: typeof n.note === 'string' ? n.note : '',
        }))
    : []
  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''

  return { recommended_keep_id: keepId, confidence, field_notes: fieldNotes, rationale }
}
