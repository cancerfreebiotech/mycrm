import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import {
  AI_FEATURES,
  clearAiRoutingCache,
  resolveTouchpoint,
  type AiFeature,
  type AiTouchpoint,
} from '@/lib/aiRouting'

/**
 * POST /api/ai-feature-assign — super_admin 指派 / 清除某功能的 AI 模型。
 *
 * body { feature, aiModelId }（aiModelId null = 清除指派）
 *  → 200 { ok: true } ；401/403/400 { error }
 *
 * GET /api/ai-feature-assign — super_admin 讀 8 功能當下實際生效的路由（見下方合約）。
 */

interface ModelJoin {
  is_active: boolean
}

interface EndpointNameJoin {
  name: string | null
}

interface ModelNameJoin {
  ai_endpoints: EndpointNameJoin | EndpointNameJoin[] | null
}

interface AssignRow {
  feature: string
  ai_model_id: string | null
  ai_models: ModelNameJoin | ModelNameJoin[] | null
}

interface FeatureRow {
  feature: string
  source: 'assigned' | 'default'
  via: 'google' | 'openai' | 'portkey'
  modelId: string
  endpointName: string | null
  aiModelId: string | null
  googleOnly: boolean
}

function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null
  return x ?? null
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
  const feature = typeof body.feature === 'string' ? body.feature : null
  const aiModelId = typeof body.aiModelId === 'string' ? body.aiModelId : body.aiModelId === null ? null : undefined

  if (!feature || !(feature in AI_FEATURES)) {
    return NextResponse.json({ error: 'Invalid feature' }, { status: 400 })
  }
  if (aiModelId === undefined) {
    return NextResponse.json({ error: 'Invalid aiModelId' }, { status: 400 })
  }
  const feat = feature as AiFeature

  if (aiModelId !== null) {
    const { data } = await service
      .from('ai_models')
      .select('id, is_active')
      .eq('id', aiModelId)
      .maybeSingle()
    const row = data as unknown as ModelJoin | null
    if (!row || row.is_active !== true) {
      return NextResponse.json({ error: 'Model not found or inactive' }, { status: 400 })
    }
    // googleOnly 不再阻擋——任何功能可指派任何端點；UI/API 僅顯示建議警告。
  }

  const ctx = await getOrgContext({ email: user.email, userId: me.id })
  const db = orgScopedClient(ctx)

  if (aiModelId === null) {
    const { error } = await db.from('ai_feature_models').delete().eq('feature', feat)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  } else {
    const { error } = await db.from('ai_feature_models').upsert(
      {
        org_id: ctx.orgId,
        feature: feat,
        ai_model_id: aiModelId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,feature' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 本實例即時生效；其他 serverless 實例 60 秒內快取過期
  clearAiRoutingCache()

  return NextResponse.json({ ok: true })
}

// feature → 代表觸點（其解析 source/via/modelId 即該功能的實際生效路由）。
// card_ocr_default 對應觸點 'card_ocr'，其餘同名。
const FEATURE_TOUCHPOINTS: Record<AiFeature, AiTouchpoint> = {
  assistant: 'assistant',
  briefing: 'briefing',
  note_format: 'note_format',
  feedback_triage: 'feedback_triage',
  ai_review: 'ai_review',
  newsletter_refine: 'newsletter_refine',
  newsletter_translate: 'newsletter_translate',
  card_ocr_default: 'card_ocr',
}

/**
 * GET /api/ai-feature-assign — super_admin 讀 8 功能當下實際生效的路由。
 * 每列：source（assigned=指派生效 / default=系統預設）、via 通道、modelId、
 * 指派時的 endpointName + aiModelId（預設時為 null）、googleOnly 建議旗標。
 */
export async function GET() {
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

  // 讀取前清快取，確保拿到其他實例的最新指派
  clearAiRoutingCache()

  const ctx = await getOrgContext({ email: user.email, userId: me.id })
  const db = orgScopedClient(ctx)

  const { data: assignData } = await db
    .from('ai_feature_models')
    .select('feature, ai_model_id, ai_models(ai_endpoints(name))')
  const assignMap = new Map<string, { aiModelId: string | null; endpointName: string | null }>()
  for (const raw of (assignData ?? []) as unknown as AssignRow[]) {
    const ep = one(one(raw.ai_models)?.ai_endpoints)
    assignMap.set(raw.feature, { aiModelId: raw.ai_model_id, endpointName: ep?.name ?? null })
  }

  const features: FeatureRow[] = []
  for (const feat of Object.keys(AI_FEATURES) as AiFeature[]) {
    const resolved = await resolveTouchpoint(ctx.orgId, FEATURE_TOUCHPOINTS[feat])
    const assigned = resolved.source === 'assigned'
    const detail = assignMap.get(feat)
    features.push({
      feature: feat,
      source: assigned ? 'assigned' : 'default',
      via: resolved.via,
      modelId: resolved.modelId,
      endpointName: assigned ? (detail?.endpointName ?? null) : null,
      aiModelId: assigned ? (detail?.aiModelId ?? null) : null,
      googleOnly: AI_FEATURES[feat].googleOnly,
    })
  }

  return NextResponse.json({ features })
}
