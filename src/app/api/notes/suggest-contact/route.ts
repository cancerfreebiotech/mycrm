import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { executeTool } from '@/lib/agent-tools'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { aiGenerate } from '@/lib/aiRouting'

export const maxDuration = 60

interface Candidate {
  id: string
  name: string | null
  name_en: string | null
  name_local: string | null
  company: string | null
  job_title: string | null
  email: string | null
}

interface Suggestion {
  contactId: string
  name: string | null
  company: string | null
  confidence: number
}

function stripJsonFence(t: string): string {
  return t.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
}

function cleanTerm(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && !['null', 'n/a', 'none', '無', '없음'].includes(s.toLowerCase()) ? s : ''
}

function displayName(c: Candidate): string | null {
  return c.name || c.name_en || c.name_local || null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const noteId: string | undefined = body?.noteId
  if (!noteId) return NextResponse.json({ error: '缺少 noteId' }, { status: 400 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data: note, error } = await db
    .from('interaction_logs')
    .select('id, content')
    .eq('id', noteId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!note) return NextResponse.json({ error: '找不到筆記' }, { status: 404 })

  const content = (note.content as string | null)?.trim() ?? ''
  if (!content) return NextResponse.json({ suggestions: [] })

  // 1. Extract searchable person / company from the note.
  let person = ''
  let company = ''
  try {
    const raw = await aiGenerate(
      ctx.orgId,
      'ai_review',
      `從以下 CRM 筆記中抽取可用來搜尋聯絡人的關鍵字。\n` +
      `筆記：${content}\n\n` +
      `只回傳 JSON（無 markdown）：{"person":"主要人名或 null","company":"公司名或 null"}`,
      { timeoutMs: 60_000 }
    )
    const parsed = JSON.parse(stripJsonFence(raw)) as { person?: unknown; company?: unknown }
    person = cleanTerm(parsed.person)
    company = cleanTerm(parsed.company)
  } catch (e) {
    return NextResponse.json({ error: `AI 抽取失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }

  const terms = [...new Set([person, company].filter(Boolean))]
  if (terms.length === 0) return NextResponse.json({ suggestions: [] })

  // 2. Search CRM contacts (shared agent tool) and dedupe by id.
  const byId = new Map<string, Candidate>()
  for (const term of terms) {
    const rows = (await executeTool('search_contacts', { query: term, limit: 6 }, null)) as Candidate[]
    for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r)
  }
  const candidates = [...byId.values()].slice(0, 10)
  if (candidates.length === 0) return NextResponse.json({ suggestions: [] })

  // 3. Score each candidate against the note; keep top 3.
  let scored: Array<{ contactId: string; confidence: number }>
  try {
    const raw = await aiGenerate(
      ctx.orgId,
      'ai_review',
      `筆記內容：${content}\n\n` +
      `候選聯絡人（JSON 陣列）：\n${JSON.stringify(candidates.map((c) => ({ id: c.id, name: displayName(c), company: c.company, job_title: c.job_title, email: c.email })))}\n\n` +
      `針對每個候選，評估其與筆記提到之人物/公司的吻合程度，回傳最多 3 個最可能的（由高到低排序），附 0 到 1 的信心值。\n` +
      `只回傳 JSON（無 markdown）：{"suggestions":[{"contactId":"<id>","confidence":0.0}]}`,
      { timeoutMs: 60_000 }
    )
    const parsed = JSON.parse(stripJsonFence(raw)) as { suggestions?: Array<{ contactId?: string; confidence?: number }> }
    scored = (parsed.suggestions ?? [])
      .filter((s) => typeof s.contactId === 'string' && byId.has(s.contactId))
      .map((s) => ({ contactId: s.contactId as string, confidence: typeof s.confidence === 'number' ? Math.min(Math.max(s.confidence, 0), 1) : 0 }))
  } catch (e) {
    return NextResponse.json({ error: `AI 評分失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }

  const suggestions: Suggestion[] = scored.slice(0, 3).map((s) => {
    const c = byId.get(s.contactId)!
    return { contactId: s.contactId, name: displayName(c), company: c.company, confidence: s.confidence }
  })

  return NextResponse.json({ suggestions })
}
