import type { ResolvedAi } from '@/lib/aiRouting'
import { createServiceClient } from '@/lib/supabase'
import { recordUsage } from '@/lib/usage'

// ============================================================================
// OpenAI 相容 function-calling 迴圈（v8.0.x）
//
// assistant / briefing 等功能被指派到 kind='openai' 端點時，用本模組執行多輪
// tool-calling。與 aiRouting 的 google 路 function calling 等價：模型要求呼叫工具
// → 執行 → 回結果 → 再問模型，直到模型回純文字或達到 maxRounds。
//
// 本檔不可 import '@/lib/gemini.ts'（避免循環）；只借用 aiRouting 的型別。
// ============================================================================

export interface OpenAiAgentResult {
  reply: string
  toolsUsed: string[]
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface AssistantMessage {
  role: 'assistant'
  content: unknown
  tool_calls?: ToolCall[]
}

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'tool'; tool_call_id: string; content: string }
  | AssistantMessage

// 達到 maxRounds 仍在要求呼叫工具時的固定回覆。
const MAX_ROUNDS_MESSAGE =
  '這個請求需要的操作步驟太多，已達上限。請把需求拆小一點或更明確一些再試一次。'

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

// Fire-and-forget 用量計量。比照 aiRouting 的 meter——絕不影響主呼叫。
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

/**
 * OpenAI 相容 /chat/completions 多輪 tool-calling 迴圈。
 * 每一輪 = 一次 HTTP 呼叫；模型回 tool_calls 就逐一 execute 並把結果餵回，
 * 回純文字則結束。非 2xx → throw；audit 失敗不中斷主流程。
 */
export async function runOpenAiToolLoop(opts: {
  resolved: ResolvedAi
  systemInstruction: string
  history: Array<{ role: 'user' | 'model'; content: string }>
  latest: string
  declarations: Array<{ name: string; description: string; parameters: unknown }>
  maxRounds: number
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>
  audit: (name: string, args: unknown, ok: boolean, errMsg: string | null) => Promise<void>
  /** 達 maxRounds 仍要求工具時的回覆（呼叫端可傳當地語言版本，預設繁中）。 */
  limitMessage?: string
}): Promise<OpenAiAgentResult> {
  const { resolved, systemInstruction, history, latest, declarations, maxRounds, execute, audit } = opts

  const messages: ChatMessage[] = [
    { role: 'system', content: systemInstruction },
    ...history.map(
      (h): ChatMessage => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content }),
    ),
    { role: 'user', content: latest },
  ]

  const tools = declarations.map((d) => ({
    type: 'function' as const,
    function: { name: d.name, description: d.description, parameters: d.parameters },
  }))

  const base = (resolved.baseUrl ?? '').replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (resolved.apiKey && resolved.apiKey !== 'placeholder') {
    headers['Authorization'] = `Bearer ${resolved.apiKey}`
  }

  const toolsUsed: string[] = []

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: resolved.modelId, messages, tools }),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 500)
      throw new Error(`[openaiAgent] openai endpoint returned ${res.status}: ${body}`)
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: AssistantMessage }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    meter(json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0)

    const message = json.choices?.[0]?.message
    const toolCalls = message?.tool_calls

    if (!message || !toolCalls || toolCalls.length === 0) {
      return { reply: extractText(message?.content).trim(), toolsUsed }
    }

    // 保留原始 assistant message（含 tool_calls）供下一輪脈絡。
    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls })

    for (const call of toolCalls) {
      const name = call.function.name
      toolsUsed.push(name)

      let args: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(call.function.arguments)
        if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
      } catch {
        args = {}
      }

      let ok = true
      let errMsg: string | null = null
      let result: unknown
      try {
        result = await execute(name, args)
      } catch (err) {
        ok = false
        errMsg = err instanceof Error ? err.message : String(err)
        result = { error: errMsg }
      }

      try {
        await audit(name, args, ok, errMsg)
      } catch {
        /* audit must never break the tool loop */
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  return { reply: opts.limitMessage ?? MAX_ROUNDS_MESSAGE, toolsUsed }
}
