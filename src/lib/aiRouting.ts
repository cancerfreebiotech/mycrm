import Portkey from 'portkey-ai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase'
import { orgScopedClient, systemOrgContext } from '@/lib/orgContext'
import { recordUsage } from '@/lib/usage'

// ============================================================================
// AI 功能路由層（v8.0.0）
//
// 各 AI 功能（feature）可由管理端指派到不同 endpoint/key/model（ai_feature_models
// 表）。未指派時，解析回「今日預設」——同模型、同執行路徑、同金鑰來源、同錯誤
// 行為，與指派系統上線前 100% 等價。
//
// 本檔不可 import '@/lib/gemini.ts'：gemini.ts 之後會反向 import 本模組，避免循環。
// ============================================================================

// ── Feature / Touchpoint 定義 ──────────────────────────────────────────────

export type AiFeature =
  | 'assistant'
  | 'briefing'
  | 'note_format'
  | 'feedback_triage'
  | 'ai_review'
  | 'newsletter_refine'
  | 'newsletter_translate'
  | 'card_ocr_default'

/**
 * 每個 feature 的能力約束。
 * googleOnly：建議跑在 google 端點（assistant 的 function calling、briefing 的
 * googleSearch grounding 在 google 路最完整）。此旗標**不再阻擋**指派——任何 feature
 * 都可指派到任何端點；旗標僅供 UI/API 顯示「此功能建議用 google」的警告。
 * 指到 openai 端點時：assistant 走 OpenAI 相容 function calling，briefing 照打但無
 * grounding。
 */
export const AI_FEATURES: Record<AiFeature, { googleOnly: boolean }> = {
  assistant: { googleOnly: true },
  briefing: { googleOnly: true },
  note_format: { googleOnly: false },
  feedback_triage: { googleOnly: false },
  ai_review: { googleOnly: false },
  newsletter_refine: { googleOnly: false },
  newsletter_translate: { googleOnly: false },
  card_ocr_default: { googleOnly: false },
}

export type AiTouchpoint =
  | 'assistant'
  | 'briefing'
  | 'note_format'
  | 'feedback_triage'
  | 'newsletter_compose'
  | 'ai_review'
  | 'newsletter_refine'
  | 'newsletter_translate'
  | 'card_ocr'
  | 'email_generate'

export interface AiDefault {
  via: 'google' | 'portkey'
  modelId: string
}

/**
 * 每個觸點 → 所屬 feature + 今日預設。
 * getDefault 於呼叫時讀 env（利於測試覆寫）。兩個觸點可共用同一 feature 但預設
 * 不同（card_ocr → portkey、email_generate → google），故預設不快取、每次由觸點
 * 現算。
 */
export const TOUCHPOINTS: Record<AiTouchpoint, { feature: AiFeature; getDefault: () => AiDefault }> = {
  assistant: {
    feature: 'assistant',
    getDefault: () => ({ via: 'google', modelId: 'gemini-2.5-flash' }),
  },
  briefing: {
    feature: 'briefing',
    getDefault: () => ({ via: 'google', modelId: 'gemini-2.5-flash' }),
  },
  note_format: {
    feature: 'note_format',
    getDefault: () => ({ via: 'google', modelId: 'gemini-2.5-flash' }),
  },
  feedback_triage: {
    feature: 'feedback_triage',
    getDefault: () => ({ via: 'google', modelId: 'gemini-2.5-flash' }),
  },
  newsletter_compose: {
    feature: 'newsletter_refine',
    getDefault: () => ({ via: 'portkey', modelId: 'gemini-2.5-flash' }),
  },
  ai_review: {
    feature: 'ai_review',
    getDefault: () => ({ via: 'portkey', modelId: process.env.AI_REVIEW_MODEL ?? 'gemini-3.1-flash-lite' }),
  },
  newsletter_refine: {
    feature: 'newsletter_refine',
    getDefault: () => ({ via: 'portkey', modelId: process.env.NEWSLETTER_MODEL_REFINE ?? 'gemini-3.1-pro-preview' }),
  },
  newsletter_translate: {
    feature: 'newsletter_translate',
    getDefault: () => ({ via: 'portkey', modelId: process.env.NEWSLETTER_MODEL_TRANSLATE ?? 'gemini-3.1-flash-lite' }),
  },
  // card_ocr / email_generate 皆掛 card_ocr_default feature：名片辨識、指令解析、
  // 郵件生成一律用組織層指派的模型（無個人層——users.ai_model_id 已停止讀寫）。
  card_ocr: {
    feature: 'card_ocr_default',
    getDefault: () => ({ via: 'portkey', modelId: 'gemini-3.1-flash-lite-preview' }),
  },
  email_generate: {
    feature: 'card_ocr_default',
    getDefault: () => ({ via: 'google', modelId: 'gemini-3.1-flash-lite-preview' }),
  },
}

export interface ResolvedAi {
  /** portkey = 未指派且今日預設走 Portkey gateway。 */
  via: 'google' | 'openai' | 'portkey'
  modelId: string
  /** google：null → 執行時用 env GEMINI_API_KEY；openai：null/'placeholder' → 不帶 Authorization。 */
  apiKey: string | null
  /** 僅 openai 端點。 */
  baseUrl: string | null
  source: 'assigned' | 'default'
}

// ── 解析內部 ────────────────────────────────────────────────────────────────

interface EndpointJoin {
  kind: 'openai' | 'google'
  base_url: string | null
  api_key: string | null
  is_active: boolean
}

interface ModelJoin {
  model_id: string
  is_active: boolean
  ai_endpoints: EndpointJoin | EndpointJoin[] | null
}

interface FeatureModelRow {
  ai_model_id: string | null
  ai_models: ModelJoin | ModelJoin[] | null
}

// supabase-js 的嵌入關聯依版本可能回單物件或陣列——一律取第一筆。
function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null
  return x ?? null
}

/**
 * 把 ai_models（＋嵌入 ai_endpoints）列映射成 ResolvedAi。
 * 模型或端點 inactive、缺端點 → 回 null（呼叫端視同未指派、fallback 預設）。
 * 'placeholder' / 空字串 api_key → null。
 */
function mapModel(model: ModelJoin | null, source: ResolvedAi['source']): ResolvedAi | null {
  if (!model || model.is_active !== true) return null
  const ep = one(model.ai_endpoints)
  if (!ep || ep.is_active !== true) return null
  const apiKey = ep.api_key && ep.api_key !== 'placeholder' ? ep.api_key : null
  if (ep.kind === 'google') {
    return { via: 'google', modelId: model.model_id, apiKey, baseUrl: null, source }
  }
  return { via: 'openai', modelId: model.model_id, apiKey, baseUrl: ep.base_url ?? null, source }
}

/**
 * 查 ai_feature_models(org,feature) 的有效指派。回 ResolvedAi(source:'assigned')
 * 或 null（未指派 / 模型或端點 inactive）。googleOnly 不再阻擋——一律尊重有效指派。
 * 不快取。
 */
async function resolveAssignment(
  orgId: string,
  feature: AiFeature,
): Promise<ResolvedAi | null> {
  // orgScopedClient 對業務表自動追加 .eq('org_id', orgId)
  const db = orgScopedClient(systemOrgContext(orgId))
  const { data } = await db
    .from('ai_feature_models')
    .select('ai_model_id, ai_models(model_id, is_active, ai_endpoints(kind, base_url, api_key, is_active))')
    .eq('feature', feature)
    .maybeSingle()

  const row = data as unknown as FeatureModelRow | null
  return mapModel(one(row?.ai_models), 'assigned')
}

// ── 系統型解析（觸點）＋ 60s 快取 ────────────────────────────────────────────

const CACHE_TTL_MS = 60_000
// value: 有效指派的 ResolvedAi，或 null（無有效指派——預設由觸點現算）。
const cache = new Map<string, { value: ResolvedAi | null; expires: number }>()
const cacheKey = (orgId: string, feature: AiFeature) => `${orgId}:${feature}`

/**
 * 系統型解析：觸點 → 有效指派或今日預設。
 * 快取只記憶 DB 指派查詢結果（per org:feature）；預設每次由觸點的 getDefault()
 * 現算，故共用同一 feature 的兩觸點各自拿到正確預設。
 */
export async function resolveTouchpoint(orgId: string, tp: AiTouchpoint): Promise<ResolvedAi> {
  const { feature, getDefault } = TOUCHPOINTS[tp]
  const def = getDefault()
  const fallback: ResolvedAi = { via: def.via, modelId: def.modelId, apiKey: null, baseUrl: null, source: 'default' }

  const now = Date.now()
  const hit = cache.get(cacheKey(orgId, feature))
  if (hit && hit.expires > now) {
    return hit.value ? { ...hit.value } : fallback
  }

  try {
    const assigned = await resolveAssignment(orgId, feature)
    cache.set(cacheKey(orgId, feature), { value: assigned, expires: now + CACHE_TTL_MS })
    return assigned ? { ...assigned } : fallback
  } catch {
    // DB unreachable — serve default without caching so the next call retries.
    return fallback
  }
}

/** 清快取（測試 + 管理端改指派後 cache-busting）。 */
export function clearAiRoutingCache(): void {
  cache.clear()
}

// ── 統一單發執行 ──────────────────────────────────────────────────────────

export type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

export interface RoutedOpts {
  /** Portkey SDK timeout（僅 portkey 路），預設 180_000。 */
  timeoutMs?: number
  /** 僅 portkey 路：失敗且有 env GEMINI_API_KEY → 直連 gemini-2.5-flash 兜底。預設 false。 */
  directFallback?: boolean
  systemInstruction?: string
  /** 僅 google 路，傳給 getGenerativeModel。 */
  safetySettings?: unknown
  /** 僅 google 路，generationConfig。 */
  responseMimeType?: string
}

const DIRECT_FALLBACK_MODEL = 'gemini-2.5-flash'

// OpenAI 風格 content → Gemini SDK parts（data URL 圖片 → inlineData）。
function toGeminiParts(
  content: MessageContent,
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (typeof content === 'string') return [{ text: content }]
  return content.map((p) => {
    if ('text' in p) return { text: p.text }
    const m = /^data:([^;]+);base64,(.*)$/s.exec(p.image_url.url)
    return m ? { inlineData: { mimeType: m[1], data: m[2] } } : { text: '' }
  })
}

// choices[].message.content 可能是字串或 parts 陣列。
function extractText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : ''))
      .join('')
  }
  return ''
}

// Fire-and-forget 用量計量。取不到 usage 就 0，try/catch 包住——絕不影響主呼叫。
function meter(tokensIn: number, tokensOut: number): void {
  try {
    void recordUsage(createServiceClient(), {
      ai_call: 1,
      ai_tokens_in: tokensIn,
      ai_tokens_out: tokensOut,
    })
  } catch {
    /* metering must never break the AI call */
  }
}

async function googleGenerate(resolved: ResolvedAi, content: MessageContent, opts?: RoutedOpts): Promise<string> {
  const apiKey = resolved.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[aiRouting] google route requires an api key (endpoint key or GEMINI_API_KEY)')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: resolved.modelId,
    ...(opts?.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
    ...(opts?.safetySettings ? { safetySettings: opts.safetySettings as never } : {}),
    ...(opts?.responseMimeType ? { generationConfig: { responseMimeType: opts.responseMimeType } } : {}),
  })
  const result = await model.generateContent(toGeminiParts(content))
  const usage = result.response.usageMetadata as
    | { promptTokenCount?: number; candidatesTokenCount?: number }
    | undefined
  meter(usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0)
  return (result.response.text() ?? '').trim()
}

async function openaiGenerate(resolved: ResolvedAi, content: MessageContent): Promise<string> {
  const base = (resolved.baseUrl ?? '').replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (resolved.apiKey) headers['Authorization'] = `Bearer ${resolved.apiKey}`
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: resolved.modelId, messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 500)
    throw new Error(`[aiRouting] openai endpoint returned ${res.status}: ${body}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  meter(json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0)
  return extractText(json.choices?.[0]?.message?.content).trim()
}

async function portkeyGenerate(resolved: ResolvedAi, content: MessageContent, opts?: RoutedOpts): Promise<string> {
  try {
    const portkey = new Portkey({
      apiKey: process.env.PORTKEY_API_KEY!,
      config: process.env.PORTKEY_CONFIG_ID!,
      timeout: opts?.timeoutMs ?? 180_000,
    })
    const result = await portkey.chat.completions.create({
      model: resolved.modelId,
      messages: [{ role: 'user', content }],
    })
    const usage = result.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    meter(usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0)
    return extractText(result.choices?.[0]?.message?.content).trim()
  } catch (err) {
    // Portkey 不可用（401、網路、misconfig）：可選直連 Gemini 兜底，維持核心流程存活。
    if (opts?.directFallback && process.env.GEMINI_API_KEY) {
      console.error(
        '[aiRouting] Portkey failed, using direct Gemini fallback:',
        err instanceof Error ? err.message : String(err),
      )
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: DIRECT_FALLBACK_MODEL })
      const result = await model.generateContent(toGeminiParts(content))
      return (result.response.text() ?? '').trim()
    }
    throw err
  }
}

/** 依 ResolvedAi.via 走對應執行路，回傳 .trim() 後文字。 */
export async function routedGenerate(
  resolved: ResolvedAi,
  content: MessageContent,
  opts?: RoutedOpts,
): Promise<string> {
  switch (resolved.via) {
    case 'google':
      return googleGenerate(resolved, content, opts)
    case 'openai':
      return openaiGenerate(resolved, content)
    case 'portkey':
      return portkeyGenerate(resolved, content, opts)
  }
}

/** 便利包裝：resolveTouchpoint + routedGenerate。 */
export async function aiGenerate(
  orgId: string,
  tp: AiTouchpoint,
  content: MessageContent,
  opts?: RoutedOpts,
): Promise<string> {
  const resolved = await resolveTouchpoint(orgId, tp)
  return routedGenerate(resolved, content, opts)
}
