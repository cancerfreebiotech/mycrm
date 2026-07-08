import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import {
  AI_FEATURES,
  clearAiRoutingCache,
  resolveTouchpoint,
  routedGenerate,
  type AiFeature,
  type AiTouchpoint,
  type ResolvedAi,
} from '@/lib/aiRouting'

/**
 * POST /api/ai-test — super_admin 測試 AI 端點 / 模型 / 功能指派的連通性。
 *
 * body 三選一：{ endpointId } | { modelId } | { feature }
 *  → 200 { ok, latencyMs, testedAt, persisted, error? }（測試失敗仍是 200——失敗是正常結果）
 *  → 401/403/400 { error }
 */

export const maxDuration = 60

const TEST_PROMPT = '請只回覆 OK'

interface EndpointRow {
  id: string
  kind: 'openai' | 'google'
  base_url: string | null
  api_key: string | null
  is_active: boolean
}

interface ModelRow {
  id: string
  model_id: string
  is_active: boolean
  ai_endpoints: EndpointRow | EndpointRow[] | null
}

interface TestResult {
  ok: boolean
  latencyMs: number
  testedAt: string
  error: string | null
}

function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null
  return x ?? null
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(msg)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(t))
}

function buildResolved(ep: EndpointRow, modelId: string): ResolvedAi {
  const apiKey = ep.api_key && ep.api_key !== 'placeholder' ? ep.api_key : null
  if (ep.kind === 'google') {
    return { via: 'google', modelId, apiKey, baseUrl: null, source: 'assigned' }
  }
  return { via: 'openai', modelId, apiKey, baseUrl: ep.base_url ?? null, source: 'assigned' }
}

/** 執行一次路由生成測試——任何 throw / 逾時皆化為 ok:false，不上拋。 */
async function runGenerate(resolved: ResolvedAi): Promise<TestResult> {
  const started = Date.now()
  let ok = false
  let error: string | null = null
  try {
    await withTimeout(routedGenerate(resolved, TEST_PROMPT, { timeoutMs: 25_000 }), 30_000, '測試逾時（30 秒）')
    ok = true
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 500)
  }
  return { ok, latencyMs: Date.now() - started, testedAt: new Date().toISOString(), error }
}

/** 端點連通性測試（無 active 模型時）：HTTP 有回應（含 4xx）即通道可用。 */
async function runConnectivity(ep: EndpointRow): Promise<TestResult> {
  const started = Date.now()
  const key = ep.api_key && ep.api_key !== 'placeholder' ? ep.api_key : null
  let ok = false
  let error: string | null = null
  try {
    let url: string
    const headers: Record<string, string> = {}
    if (ep.kind === 'google') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models'
      const gkey = key ?? process.env.GEMINI_API_KEY
      if (gkey) headers['x-goog-api-key'] = gkey
    } else {
      const base = (ep.base_url ?? '').replace(/\/+$/, '')
      url = `${base}/models`
      if (key) headers['Authorization'] = `Bearer ${key}`
    }
    await withTimeout(fetch(url, { method: 'GET', headers }), 30_000, '連線逾時（30 秒）')
    ok = true // 任何 HTTP 回應（含 4xx）代表通道可達
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 500)
  }
  return { ok, latencyMs: Date.now() - started, testedAt: new Date().toISOString(), error }
}

async function loadModel(
  service: ReturnType<typeof createServiceClient>,
  modelId: string,
): Promise<{ id: string; resolved: ResolvedAi } | null> {
  const { data } = await service
    .from('ai_models')
    .select('id, model_id, is_active, ai_endpoints(id, kind, base_url, api_key, is_active)')
    .eq('id', modelId)
    .maybeSingle()
  const row = data as unknown as ModelRow | null
  if (!row) return null
  const ep = one(row.ai_endpoints)
  if (!ep) return null
  return { id: row.id, resolved: buildResolved(ep, row.model_id) }
}

async function persist(
  service: ReturnType<typeof createServiceClient>,
  table: 'ai_models' | 'ai_endpoints',
  id: string,
  r: TestResult,
): Promise<void> {
  await service
    .from(table)
    .update({ last_tested_at: r.testedAt, last_test_ok: r.ok, last_test_error: r.error })
    .eq('id', id)
}

function respond(r: TestResult, persisted: boolean) {
  return NextResponse.json({
    ok: r.ok,
    latencyMs: r.latencyMs,
    testedAt: r.testedAt,
    persisted,
    ...(r.error ? { error: r.error } : {}),
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('id, role')
    .eq('email', user.email)
    .single()
  if (me?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const endpointId = typeof body.endpointId === 'string' ? body.endpointId : null
  const modelId = typeof body.modelId === 'string' ? body.modelId : null
  const feature = typeof body.feature === 'string' ? body.feature : null
  const provided = [endpointId, modelId, feature].filter((v) => v !== null)
  if (provided.length !== 1) {
    return NextResponse.json({ error: 'Provide exactly one of endpointId, modelId, feature' }, { status: 400 })
  }

  // 拿到最新指派（其他實例的改動、本次請求前的變更）
  clearAiRoutingCache()

  // ── { modelId } ───────────────────────────────────────────────────────────
  if (modelId) {
    const model = await loadModel(service, modelId)
    if (!model) return NextResponse.json({ error: 'Model not found' }, { status: 400 })
    const r = await runGenerate(model.resolved)
    await persist(service, 'ai_models', model.id, r)
    return respond(r, true)
  }

  // ── { endpointId } ──────────────────────────────────────────────────────────
  if (endpointId) {
    const { data: epData } = await service
      .from('ai_endpoints')
      .select('id, kind, base_url, api_key, is_active')
      .eq('id', endpointId)
      .maybeSingle()
    const ep = epData as unknown as EndpointRow | null
    if (!ep) return NextResponse.json({ error: 'Endpoint not found' }, { status: 400 })

    const { data: activeModel } = await service
      .from('ai_models')
      .select('model_id')
      .eq('endpoint_id', endpointId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    const r = activeModel
      ? await runGenerate(buildResolved(ep, (activeModel as { model_id: string }).model_id))
      : await runConnectivity(ep)
    await persist(service, 'ai_endpoints', ep.id, r)
    return respond(r, true)
  }

  // ── { feature } ──────────────────────────────────────────────────────────────
  if (!(feature! in AI_FEATURES)) {
    return NextResponse.json({ error: 'Invalid feature' }, { status: 400 })
  }
  const feat = feature as AiFeature

  const ctx = await getOrgContext({ email: user.email, userId: me.id })
  const db = orgScopedClient(ctx)
  const { data: assignment } = await db
    .from('ai_feature_models')
    .select('ai_model_id')
    .eq('feature', feat)
    .maybeSingle()

  const assignedModelId = (assignment as { ai_model_id: string | null } | null)?.ai_model_id ?? null
  if (assignedModelId) {
    const model = await loadModel(service, assignedModelId)
    if (!model) {
      const testedAt = new Date().toISOString()
      return respond({ ok: false, latencyMs: 0, testedAt, error: 'Assigned model not found' }, false)
    }
    const r = await runGenerate(model.resolved)
    await persist(service, 'ai_models', model.id, r)
    return respond(r, true)
  }

  // 無指派 → 測「系統預設」路徑（不持久化）
  const tp: AiTouchpoint = feat === 'card_ocr_default' ? 'card_ocr' : (feat as AiTouchpoint)
  const resolved = await resolveTouchpoint(ctx.orgId, tp)
  const r = await runGenerate(resolved)
  return respond(r, false)
}
