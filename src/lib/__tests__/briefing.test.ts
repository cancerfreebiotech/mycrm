import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ResolvedAi } from '@/lib/aiRouting'

const { resolveTouchpoint, routedGenerate } = vi.hoisted(() => ({
  resolveTouchpoint: vi.fn<(orgId: string, tp: string) => Promise<ResolvedAi>>(),
  routedGenerate: vi.fn<(resolved: ResolvedAi, content: unknown) => Promise<string>>(),
}))
vi.mock('@/lib/aiRouting', () => ({ resolveTouchpoint, routedGenerate }))
vi.mock('@/lib/orgContext', () => ({ systemOrgContext: () => ({ orgId: 'default' }) }))

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }))
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return { getGenerativeModel: vi.fn(() => ({ generateContent })) }
  }),
}))

import { generateContactBriefing, type BriefingContactInput } from '@/lib/briefing'

const CONTACT: BriefingContactInput = {
  name: '王小明',
  name_en: null,
  company: '測試公司',
  company_en: null,
  job_title: null,
  department: null,
  website: null,
  linkedin_url: null,
  country_code: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateContactBriefing', () => {
  it('via google: calls Gemini directly with googleSearch grounding and extracts sources', async () => {
    resolveTouchpoint.mockResolvedValue({
      via: 'google',
      modelId: 'gemini-2.5-flash',
      apiKey: 'gk',
      baseUrl: null,
      source: 'default',
    })
    generateContent.mockResolvedValue({
      response: {
        text: () => '  ## 人物近況\n...  ',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://a.example', title: 'A' } }],
            },
          },
        ],
      },
    })

    const result = await generateContactBriefing(CONTACT)

    expect(routedGenerate).not.toHaveBeenCalled()
    expect(result.markdown).toBe('## 人物近況\n...')
    expect(result.sources).toEqual([{ title: 'A', url: 'https://a.example' }])
    expect(result.modelUsed).toBe('gemini-2.5-flash')
  })

  it('via openai: uses routedGenerate, returns no sources, keeps modelUsed', async () => {
    resolveTouchpoint.mockResolvedValue({
      via: 'openai',
      modelId: 'local-model',
      apiKey: 'sk-o',
      baseUrl: 'https://local.example/v1',
      source: 'assigned',
    })
    routedGenerate.mockResolvedValue('## 人物近況\n查無公開資料')

    const result = await generateContactBriefing(CONTACT)

    expect(generateContent).not.toHaveBeenCalled()
    expect(routedGenerate).toHaveBeenCalledTimes(1)
    const [resolvedArg, promptArg] = routedGenerate.mock.calls[0]
    expect(resolvedArg.via).toBe('openai')
    expect(typeof promptArg).toBe('string')
    expect(result.markdown).toBe('## 人物近況\n查無公開資料')
    expect(result.sources).toEqual([])
    expect(result.modelUsed).toBe('local-model')
  })
})
