import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ResolvedAi } from '@/lib/aiRouting'
import { runOpenAiToolLoop } from '@/lib/openaiAgent'

// createServiceClient / recordUsage are only touched by fire-and-forget metering.
vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/lib/usage', () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const RESOLVED: ResolvedAi = {
  via: 'openai',
  modelId: 'local-model',
  apiKey: 'sk-o',
  baseUrl: 'https://local.example/v1/',
  source: 'assigned',
}

const DECLARATIONS = [{ name: 'get_time', description: 'get the time', parameters: { type: 'object' } }]

// Build an OpenAI-style response body. Pass tool_calls (or null) plus optional content.
function response(opts: { content?: string | null; toolCalls?: Array<{ id: string; name: string; args: string }> }) {
  const tool_calls = opts.toolCalls?.map((t) => ({
    id: t.id,
    type: 'function',
    function: { name: t.name, arguments: t.args },
  }))
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: opts.content ?? null, tool_calls } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    text: async () => '',
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const baseOpts = (overrides: Partial<Parameters<typeof runOpenAiToolLoop>[0]> = {}) => ({
  resolved: RESOLVED,
  systemInstruction: 'you are helpful',
  history: [{ role: 'user' as const, content: 'hi' }, { role: 'model' as const, content: 'hello' }],
  latest: 'what time is it',
  declarations: DECLARATIONS,
  maxRounds: 3,
  execute: vi.fn(async () => ({ time: '12:00' })),
  audit: vi.fn(async () => {}),
  ...overrides,
})

describe('runOpenAiToolLoop', () => {
  it('returns text directly when the model calls no tools', async () => {
    fetchMock.mockResolvedValueOnce(response({ content: 'It is noon.' }))
    const execute = vi.fn(async () => ({}))
    const r = await runOpenAiToolLoop(baseOpts({ execute }))

    expect(r.reply).toBe('It is noon.')
    expect(r.toolsUsed).toEqual([])
    expect(execute).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Messages carry system + mapped history ('model'→'assistant') + user latest.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.messages).toEqual([
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'what time is it' },
    ])
    expect(body.tools[0].function.name).toBe('get_time')
    // apiKey present and not placeholder → Authorization header sent.
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBe('Bearer sk-o')
  })

  it('executes a tool then returns text on the second round', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ toolCalls: [{ id: 'c1', name: 'get_time', args: '{"tz":"utc"}' }] }))
      .mockResolvedValueOnce(response({ content: 'It is noon UTC.' }))
    const execute = vi.fn(async () => ({ time: '12:00' }))
    const audit = vi.fn(async () => {})

    const r = await runOpenAiToolLoop(baseOpts({ execute, audit }))

    expect(r.reply).toBe('It is noon UTC.')
    expect(r.toolsUsed).toEqual(['get_time'])
    expect(execute).toHaveBeenCalledWith('get_time', { tz: 'utc' })
    expect(audit).toHaveBeenCalledWith('get_time', { tz: 'utc' }, true, null)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Second request carries the assistant tool_calls msg + tool result.
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    const toolMsg = body2.messages.find((m: { role: string }) => m.role === 'tool')
    expect(toolMsg).toEqual({ role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ time: '12:00' }) })
  })

  it('captures an execute throw as an error result and audits ok=false', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ toolCalls: [{ id: 'c1', name: 'get_time', args: '{}' }] }))
      .mockResolvedValueOnce(response({ content: 'sorry, failed' }))
    const execute = vi.fn(async () => {
      throw new Error('boom')
    })
    const audit = vi.fn(async () => {})

    const r = await runOpenAiToolLoop(baseOpts({ execute, audit }))

    expect(r.reply).toBe('sorry, failed')
    expect(audit).toHaveBeenCalledWith('get_time', {}, false, 'boom')

    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    const toolMsg = body2.messages.find((m: { role: string }) => m.role === 'tool')
    expect(JSON.parse(toolMsg.content)).toEqual({ error: 'boom' })
  })

  it('returns the limit message when maxRounds is exhausted with tool_calls', async () => {
    fetchMock.mockResolvedValue(response({ toolCalls: [{ id: 'c1', name: 'get_time', args: '{}' }] }))
    const r = await runOpenAiToolLoop(baseOpts({ maxRounds: 2 }))

    expect(r.reply).toBe(
      '這個請求需要的操作步驟太多，已達上限。請把需求拆小一點或更明確一些再試一次。',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.toolsUsed).toEqual(['get_time', 'get_time'])
  })

  it('throws with status and body on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'upstream exploded',
      json: async () => ({}),
    })
    await expect(runOpenAiToolLoop(baseOpts())).rejects.toThrow(/500.*upstream exploded/)
  })
})
