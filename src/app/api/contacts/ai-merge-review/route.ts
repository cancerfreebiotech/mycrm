import { NextRequest, NextResponse } from 'next/server'
import Portkey from 'portkey-ai'
import { createClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

export const maxDuration = 60

// Routed through the Portkey config (loadbalance + fallback), same as newsletter-ai / gemini.ts.
const AI_MODEL = process.env.AI_REVIEW_MODEL ?? 'gemini-3.1-flash-lite'

const CONTACT_FIELDS =
  'id, name, name_en, name_local, company, company_en, company_local, job_title, department, ' +
  'email, second_email, phone, second_phone, address, website, linkedin_url, facebook_url, ' +
  'country_code, notes, met_at, met_date, created_at'

interface Verdict {
  verdict: 'same_person' | 'different' | 'unsure'
  confidence: number
  reason: string
  keepSuggestion: 'a' | 'b' | null
}

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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const pairId: string | undefined = body?.pairId
  let contactIdA: string | undefined = body?.contactIdA
  let contactIdB: string | undefined = body?.contactIdB

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  if (pairId) {
    const { data: pair, error } = await db
      .from('duplicate_pairs')
      .select('contact_id_a, contact_id_b')
      .eq('id', pairId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!pair) return NextResponse.json({ error: '找不到重複配對' }, { status: 404 })
    const pairRow = pair as unknown as { contact_id_a: string; contact_id_b: string }
    contactIdA = pairRow.contact_id_a
    contactIdB = pairRow.contact_id_b
  }

  if (!contactIdA || !contactIdB) {
    return NextResponse.json({ error: '缺少配對或聯絡人 ID' }, { status: 400 })
  }

  const [{ data: a }, { data: b }] = await Promise.all([
    db.from('contacts').select(CONTACT_FIELDS).eq('id', contactIdA).is('deleted_at', null).maybeSingle(),
    db.from('contacts').select(CONTACT_FIELDS).eq('id', contactIdB).is('deleted_at', null).maybeSingle(),
  ])
  if (!a || !b) return NextResponse.json({ error: '找不到聯絡人' }, { status: 404 })

  const prompt = `你是 CRM 去重審查助手。判斷以下兩筆聯絡人是否為同一個人。

【聯絡人 A】
${JSON.stringify(a, null, 2)}

【聯絡人 B】
${JSON.stringify(b, null, 2)}

【判斷規則】
- verdict：
  - same_person：明顯為同一人（如 email 相同，或姓名+公司/職稱高度一致）
  - different：明顯為不同人
  - unsure：資訊不足或互相矛盾，無法判定
- keepSuggestion：哪一筆資料較完整（欄位較齊全、資訊較新）就填 "a" 或 "b"；無法判斷填 null
- reason：用繁體中文一句話說明理由
- confidence：0 到 1 之間的信心值

【只回傳 JSON，不要 markdown、不要多餘文字】
{"verdict":"same_person|different|unsure","confidence":0.0,"reason":"繁中一句話","keepSuggestion":"a|b|null"}`

  let parsed: Verdict
  try {
    const raw = await generate(prompt)
    parsed = JSON.parse(stripJsonFence(raw)) as Verdict
  } catch (e) {
    return NextResponse.json({ error: `AI 判斷失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }

  const verdict: Verdict['verdict'] =
    parsed.verdict === 'same_person' || parsed.verdict === 'different' ? parsed.verdict : 'unsure'
  const confidence = typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0
  const keepSuggestion: Verdict['keepSuggestion'] =
    parsed.keepSuggestion === 'a' || parsed.keepSuggestion === 'b' ? parsed.keepSuggestion : null
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''

  return NextResponse.json({ verdict, confidence, reason, keepSuggestion })
}
