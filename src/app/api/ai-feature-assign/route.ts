import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { AI_FEATURES, clearAiRoutingCache, type AiFeature } from '@/lib/aiRouting'

/**
 * POST /api/ai-feature-assign — super_admin 指派 / 清除某功能的 AI 模型。
 *
 * body { feature, aiModelId }（aiModelId null = 清除指派）
 *  → 200 { ok: true } ；401/403/400 { error }
 */

interface EndpointJoin {
  kind: 'openai' | 'google'
}

interface ModelJoin {
  is_active: boolean
  ai_endpoints: EndpointJoin | EndpointJoin[] | null
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
      .select('id, is_active, ai_endpoints(kind)')
      .eq('id', aiModelId)
      .maybeSingle()
    const row = data as unknown as ModelJoin | null
    if (!row || row.is_active !== true) {
      return NextResponse.json({ error: 'Model not found or inactive' }, { status: 400 })
    }
    if (AI_FEATURES[feat].googleOnly && one(row.ai_endpoints)?.kind !== 'google') {
      return NextResponse.json({ error: '此功能僅支援 Google 端點的模型' }, { status: 400 })
    }
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
