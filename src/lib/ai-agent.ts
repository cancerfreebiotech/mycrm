import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { TOOLS, TOOL_BY_NAME, executeTool } from '@/lib/agent-tools'

// 非串流版的 Gemini function-calling agent loop。
// 與 web AI chatbot（src/app/api/ai-chat）共用工具定義（TOOLS）與執行器（executeTool），
// 但這裡只暴露共用 CRM 工具（不含 chatbot 專屬的 social-briefing 工具）。
// ai-chat route 保持原本行為不變，只是同樣 import 共用工具。

const AGENT_MODEL = 'gemini-2.5-flash'
const DEFAULT_MAX_TURNS = 6

export interface AgentMessage {
  role: 'user' | 'model'
  content: string
}

export interface RunAgentLoopArgs {
  service: SupabaseClient
  actingUserId: string
  messages: AgentMessage[]
  maxTurns?: number
}

// 把共用工具的 JSON schema 轉成 Gemini functionDeclarations（type 值皆小寫，與 SchemaType 相容）
function toGeminiDeclarations() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema }))
}

// 稽核到 agent_actions（欄位與 ai-chat / mcp 相同；agent_actions 無 source 欄位，
// 因此以 result_summary 標註來源為 bot）。永不讓稽核失敗中斷主流程。
async function auditBot(
  service: SupabaseClient,
  toolName: string,
  args: unknown,
  succeeded: boolean,
  errMsg: string | null,
  actingAs: string,
): Promise<void> {
  try {
    await service.from('agent_actions').insert({
      tool_name: toolName,
      arguments: args ?? null,
      result_summary: succeeded ? 'ok (bot)' : null,
      succeeded,
      error_message: errMsg,
      token_id: null,
      acting_as: actingAs,
    })
  } catch { /* never let logging break the call */ }
}

/**
 * Non-streaming Gemini function-calling agent loop for the Telegram bot.
 * Shares TOOLS + executeTool with the web AI chatbot (src/app/api/ai-chat);
 * only the shared CRM tools are exposed. Returns the final assistant text.
 *
 * @param actingUserId public.users.id — 用於工具寫入授權與 agent_actions.acting_as
 */
export async function runAgentLoop({
  service,
  actingUserId,
  messages,
  maxTurns = DEFAULT_MAX_TURNS,
}: RunAgentLoopArgs): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('AI 未設定（缺 GEMINI_API_KEY）')
  if (messages.length === 0) throw new Error('messages required')

  const { data: actingUser } = await service
    .from('users')
    .select('display_name, email')
    .eq('id', actingUserId)
    .maybeSingle()
  const who =
    (actingUser?.display_name as string | null) ??
    (actingUser?.email as string | null) ??
    actingUserId

  const today = new Date().toISOString().slice(0, 10)
  const systemInstruction = [
    '你是 myCRM 的 AI 助理，協助公司同仁查詢與維護 CRM 聯絡人、名單、標籤。',
    `目前使用者：${who}。今天日期：${today}。`,
    '可用工具：搜尋/讀取/更新聯絡人、加筆記、列出名單與標籤、加入名單、標記標籤。',
    '更新聯絡人或加筆記前，先用 search_contacts/get_contact 確認對象。回答用使用者的語言（預設繁體中文），精簡明確。',
    '需要寫入操作時，先在回覆中說明你做了什麼。',
  ].join('\n')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: AGENT_MODEL,
    systemInstruction,
    tools: [{ functionDeclarations: toGeminiDeclarations() }] as unknown as Parameters<typeof genAI.getGenerativeModel>[0]['tools'],
  })

  const history = messages.slice(0, -1).map((msg) => ({ role: msg.role, parts: [{ text: msg.content }] }))
  const latest = messages[messages.length - 1].content

  const chat = model.startChat({ history })
  let result = await chat.sendMessage(latest)

  for (let round = 0; round < maxTurns; round++) {
    const calls = result.response.functionCalls()
    if (!calls || calls.length === 0) break

    const responses = []
    for (const call of calls) {
      let out: unknown
      let ok = true
      let errMsg: string | null = null
      try {
        const tool = TOOL_BY_NAME.get(call.name)
        if (tool?.write && !actingUserId) throw new Error('write tool requires an acting user')
        out = await executeTool(call.name, (call.args ?? {}) as Record<string, unknown>, actingUserId)
      } catch (e) {
        ok = false
        errMsg = e instanceof Error ? e.message : String(e)
        out = { error: errMsg }
      }
      await auditBot(service, call.name, call.args, ok, errMsg, actingUserId)
      responses.push({ functionResponse: { name: call.name, response: { result: out } } })
    }
    result = await chat.sendMessage(responses)
  }

  // 跑滿 maxTurns 後若模型仍想呼叫工具，response 可能只含 functionCall、無文字，
  // 直接 .text() 會丟錯或回空字串 → 回一個明確訊息。
  const pending = result.response.functionCalls()
  if (pending && pending.length > 0) {
    return '這個請求需要的操作步驟太多，已達上限。請把需求拆小一點或更明確一些再試一次。'
  }

  try {
    return result.response.text()
  } catch {
    return '抱歉，這次沒有產生有效回覆，請再試一次。'
  }
}
