import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// aiRouting imports createServiceClient at module load only for call-time use;
// stub the factory so the module tree loads under the node test environment and
// so we can hand back fake clients per test.
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))
// recordUsage is fire-and-forget; stub it so metering never touches a real client.
vi.mock('@/lib/usage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

type EndpointJoin = {
  kind: 'openai' | 'google'
  base_url: string | null
  api_key: string | null
  is_active: boolean
}
type ModelRow = { model_id: string; is_active: boolean; ai_endpoints: EndpointJoin | null }

/**
 * Fake service client covering the two reads aiRouting performs:
 *   from('ai_feature_models').select(..).eq('org_id',..).eq('feature',..).maybeSingle()
 *   from('ai_models').select(..).eq('id',..).maybeSingle()
 *
 * `featureModel` maps feature → the assigned model row (or null = no assignment).
 * `models` maps ai_models.id → the model row (or absent = no such row).
 */
function makeService(opts: {
  featureModel?: Record<string, ModelRow | null>
  models?: Record<string, ModelRow>
} = {}) {
  const from = vi.fn((table: string) => {
    // Record the eq() calls so the builder can resolve the right row.
    const eqs: Array<[string, unknown]> = []
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        eqs.push([col, val])
        return builder
      }),
      maybeSingle: vi.fn(() => {
        if (table === 'ai_feature_models') {
          const feature = eqs.find(([c]) => c === 'feature')?.[1] as string
          const model = opts.featureModel?.[feature] ?? null
          return Promise.resolve({ data: model ? { ai_model_id: 'x', ai_models: model } : null })
        }
        if (table === 'ai_models') {
          const id = eqs.find(([c]) => c === 'id')?.[1] as string
          return Promise.resolve({ data: opts.models?.[id] ?? null })
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    }
    return builder
  })
  return { service: { from } as unknown as SupabaseClient, from }
}

const googleEndpoint = (key: string | null = 'sk-google'): EndpointJoin => ({
  kind: 'google',
  base_url: null,
  api_key: key,
  is_active: true,
})
const openaiEndpoint = (key: string | null = 'sk-openai', active = true): EndpointJoin => ({
  kind: 'openai',
  base_url: 'https://local.example/v1/',
  api_key: key,
  is_active: active,
})

const model = (endpoint: EndpointJoin | null, active = true, id = 'gpt-x'): ModelRow => ({
  model_id: id,
  is_active: active,
  ai_endpoints: endpoint,
})

const ORG = 'org-1'

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
afterEach(() => {
  delete process.env.AI_REVIEW_MODEL
})

async function loadWith(service: SupabaseClient) {
  const supabase = await import('@/lib/supabase')
  vi.mocked(supabase.createServiceClient).mockReturnValue(
    service as unknown as ReturnType<typeof supabase.createServiceClient>,
  )
  return import('@/lib/aiRouting')
}

describe('resolveTouchpoint — unassigned falls back to touchpoint default', () => {
  it('returns the google default for assistant when nothing is assigned', async () => {
    const { service } = makeService({ featureModel: { assistant: null } })
    const { resolveTouchpoint, TOUCHPOINTS } = await loadWith(service)
    const r = await resolveTouchpoint(ORG, 'assistant')
    const def = TOUCHPOINTS.assistant.getDefault()
    expect(r).toEqual({ via: def.via, modelId: def.modelId, apiKey: null, baseUrl: null, source: 'default' })
  })

  it('gives card_ocr (portkey) and email_generate (google) distinct defaults for the same feature', async () => {
    const { service } = makeService({ featureModel: { card_ocr_default: null } })
    const { resolveTouchpoint } = await loadWith(service)
    const ocr = await resolveTouchpoint(ORG, 'card_ocr')
    const email = await resolveTouchpoint(ORG, 'email_generate')
    expect(ocr.via).toBe('portkey')
    expect(email.via).toBe('google')
    expect(ocr.source).toBe('default')
    expect(email.source).toBe('default')
  })
})

describe('resolveTouchpoint — valid assignment', () => {
  it('resolves a google endpoint assignment to via google with the endpoint key', async () => {
    const { service } = makeService({
      featureModel: { note_format: model(googleEndpoint('sk-live'), true, 'gemini-custom') },
    })
    const { resolveTouchpoint } = await loadWith(service)
    const r = await resolveTouchpoint(ORG, 'note_format')
    expect(r).toEqual({
      via: 'google',
      modelId: 'gemini-custom',
      apiKey: 'sk-live',
      baseUrl: null,
      source: 'assigned',
    })
  })

  it("treats a 'placeholder' api key as null", async () => {
    const { service } = makeService({
      featureModel: { note_format: model(googleEndpoint('placeholder')) },
    })
    const { resolveTouchpoint } = await loadWith(service)
    const r = await resolveTouchpoint(ORG, 'note_format')
    expect(r.apiKey).toBeNull()
  })

  it('resolves an openai endpoint assignment to via openai with baseUrl', async () => {
    const { service } = makeService({
      featureModel: { note_format: model(openaiEndpoint('sk-o'), true, 'local-model') },
    })
    const { resolveTouchpoint } = await loadWith(service)
    const r = await resolveTouchpoint(ORG, 'note_format')
    expect(r).toEqual({
      via: 'openai',
      modelId: 'local-model',
      apiKey: 'sk-o',
      baseUrl: 'https://local.example/v1/',
      source: 'assigned',
    })
  })
})

describe('resolveTouchpoint — invalid/ignored assignments fall back to default', () => {
  it('honours a google-only feature (assistant) assigned to an openai endpoint (no longer blocked)', async () => {
    const { service } = makeService({
      featureModel: { assistant: model(openaiEndpoint('sk-o'), true, 'local-assistant') },
    })
    const { resolveTouchpoint } = await loadWith(service)

    const r = await resolveTouchpoint(ORG, 'assistant')
    expect(r).toEqual({
      via: 'openai',
      modelId: 'local-assistant',
      apiKey: 'sk-o',
      baseUrl: 'https://local.example/v1/',
      source: 'assigned',
    })
  })

  it('falls back when the assigned model is inactive', async () => {
    const { service } = makeService({
      featureModel: { note_format: model(googleEndpoint(), false) },
    })
    const { resolveTouchpoint } = await loadWith(service)
    const r = await resolveTouchpoint(ORG, 'note_format')
    expect(r.source).toBe('default')
  })

  it('falls back when the assigned endpoint is inactive', async () => {
    const { service } = makeService({
      featureModel: { note_format: model(openaiEndpoint('sk', false)) },
    })
    const { resolveTouchpoint } = await loadWith(service)
    const r = await resolveTouchpoint(ORG, 'note_format')
    expect(r.source).toBe('default')
  })
})

describe('resolveTouchpoint — caching', () => {
  it('serves the second read from cache without touching the DB', async () => {
    const { service, from } = makeService({ featureModel: { note_format: null } })
    const { resolveTouchpoint } = await loadWith(service)

    await resolveTouchpoint(ORG, 'note_format')
    const callsAfterFirst = from.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    await resolveTouchpoint(ORG, 'note_format')
    expect(from.mock.calls.length).toBe(callsAfterFirst)
  })

  it('re-queries after clearAiRoutingCache', async () => {
    const { service, from } = makeService({ featureModel: { note_format: null } })
    const { resolveTouchpoint, clearAiRoutingCache } = await loadWith(service)

    await resolveTouchpoint(ORG, 'note_format')
    const callsAfterFirst = from.mock.calls.length

    clearAiRoutingCache()
    await resolveTouchpoint(ORG, 'note_format')
    expect(from.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})

describe('TOUCHPOINTS env-backed defaults', () => {
  it('reflects AI_REVIEW_MODEL at call time', async () => {
    process.env.AI_REVIEW_MODEL = 'custom-review-model'
    const { service } = makeService({})
    const { TOUCHPOINTS } = await loadWith(service)
    expect(TOUCHPOINTS.ai_review.getDefault()).toEqual({
      via: 'portkey',
      modelId: 'custom-review-model',
    })
  })

  it('uses the hardcoded ai_review default when the env is unset', async () => {
    const { service } = makeService({})
    const { TOUCHPOINTS } = await loadWith(service)
    expect(TOUCHPOINTS.ai_review.getDefault().modelId).toBe('gemini-3.1-flash-lite')
  })
})
