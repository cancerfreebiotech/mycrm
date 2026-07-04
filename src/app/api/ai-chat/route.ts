import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient, createServiceClient } from '@/lib/supabase'
import { TOOLS, TOOL_BY_NAME, executeTool } from '@/lib/agent-tools'
import { getOrgSetting } from '@/lib/orgSettings'

export const maxDuration = 60

const CHAT_MODEL = 'gemini-2.5-flash'
const MAX_TOOL_ROUNDS = 6

interface ChatMessage { role: 'user' | 'model'; content: string }

// chatbot 額外工具：排程 social briefing（不在 MCP scope 系統內，僅 chatbot 用）
const REQUEST_BRIEFING_TOOL = {
  name: 'request_social_briefing',
  description: '為某位聯絡人排程一份「會議前 briefing」（背景搜尋此人與公司的最新公開動態）。回傳 briefing_id；結果稍後產生。當使用者說「我要跟某人開會 / 幫我了解某人近況」時用。',
  parameters: { type: 'object', properties: { contact_id: { type: 'string', description: '聯絡人 UUID（先用 search_contacts 找）' } }, required: ['contact_id'] },
}

// 把共用工具的 JSON schema 轉成 Gemini functionDeclarations（type 值與 SchemaType 相容，皆小寫）
function toGeminiDeclarations() {
  const fromShared = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }))
  return [...fromShared, REQUEST_BRIEFING_TOOL]
}

async function resolveActingUser(email: string): Promise<{ id: string; display_name: string | null } | null> {
  const service = createServiceClient()
  const { data } = await service.from('users').select('id, display_name').ilike('email', email.trim()).maybeSingle()
  return data ? { id: data.id as string, display_name: (data.display_name as string) ?? null } : null
}

async function auditChat(toolName: string, args: unknown, succeeded: boolean, errMsg: string | null, actingAs: string) {
  try {
    const service = createServiceClient()
    await service.from('agent_actions').insert({
      tool_name: toolName,
      arguments: args ?? null,
      result_summary: succeeded ? 'ok (chatbot)' : null,
      succeeded,
      error_message: errMsg,
      token_id: null,
      acting_as: actingAs,
    })
  } catch { /* never let logging break the call */ }
}

// chatbot 端工具執行：request_social_briefing 自己處理，其餘委派共用 executeTool。
// authUserId = auth.users.id：contact_briefings.created_by 的 FK 指向 auth.users，
// 不可用 actingAs（那是 public.users.id，與 FK 不符會 insert 失敗）。
async function executeChatTool(name: string, args: Record<string, unknown>, actingAs: string, authUserId: string): Promise<unknown> {
  if (name === 'request_social_briefing') {
    const contactId = args.contact_id as string | undefined
    if (!contactId) throw new Error('contact_id required')
    const service = createServiceClient()
    const { data, error } = await service
      .from('contact_briefings')
      .insert({ contact_id: contactId, trigger: 'nl_command', created_by: authUserId })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { briefing_id: data.id, status: 'pending', note: 'briefing 已排程，稍後於聯絡人頁查看結果' }
  }
  // 寫入工具強制有 acting user（此處一律來自 web session，必定非空）
  const tool = TOOL_BY_NAME.get(name)
  if (tool?.write && !actingAs) throw new Error('write tool requires an acting user')
  return await executeTool(name, args, actingAs)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Module kill-switch (org-settings). 60s-cached, so this read is near-free.
  if ((await getOrgSetting(createServiceClient(), 'ai_assistant_enabled')) === 'false') {
    return NextResponse.json({ error: 'AI 助理目前停用' }, { status: 503 })
  }

  const acting = await resolveActingUser(user.email)
  if (!acting) return NextResponse.json({ error: 'No mycrm profile for this user' }, { status: 403 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI 未設定（缺 GEMINI_API_KEY）' }, { status: 500 })

  const body = await req.json().catch(() => null)
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : []
  if (messages.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const systemInstruction = [
    '你是 myCRM 的 AI 助理，協助公司同仁查詢與維護 CRM 聯絡人、名單、標籤，並可排程會議前 briefing。',
    `目前使用者：${acting.display_name ?? user.email}（${user.email}）。今天日期：${today}。`,
    '可用工具：搜尋/讀取/更新聯絡人、加筆記、列出名單與標籤、加入名單、標記標籤、排程 social briefing。',
    '更新聯絡人或加筆記前，先用 search_contacts/get_contact 確認對象。回答用使用者的語言（預設繁體中文），精簡明確。',
    '需要破壞性或寫入操作時，先在回覆中說明你做了什麼。',
  ].join('\n')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: CHAT_MODEL,
    systemInstruction,
    tools: [{ functionDeclarations: toGeminiDeclarations() }] as unknown as Parameters<typeof genAI.getGenerativeModel>[0]['tools'],
  })

  const history = messages.slice(0, -1).map((m) => ({ role: m.role, parts: [{ text: m.content }] }))
  const latest = messages[messages.length - 1].content

  try {
    const chat = model.startChat({ history })
    let result = await chat.sendMessage(latest)
    const toolsUsed: string[] = []

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const calls = result.response.functionCalls()
      if (!calls || calls.length === 0) break

      const responses = []
      for (const call of calls) {
        toolsUsed.push(call.name)
        let out: unknown
        let ok = true
        let errMsg: string | null = null
        try {
          out = await executeChatTool(call.name, (call.args ?? {}) as Record<string, unknown>, acting.id, user.id)
        } catch (e) {
          ok = false
          errMsg = e instanceof Error ? e.message : String(e)
          out = { error: errMsg }
        }
        await auditChat(call.name, call.args, ok, errMsg, acting.id)
        responses.push({ functionResponse: { name: call.name, response: { result: out } } })
      }
      result = await chat.sendMessage(responses)
    }

    // 跑滿 MAX_TOOL_ROUNDS 後若模型仍想呼叫工具，response 可能只含 functionCall、無文字，
    // 直接 .text() 會丟錯或回空字串 → 回一個明確訊息而非讓使用者看到空白。
    const pending = result.response.functionCalls()
    if (pending && pending.length > 0) {
      return NextResponse.json({
        reply: '這個請求需要的操作步驟太多，已達上限。請把需求拆小一點或更明確一些再試一次。',
        tools_used: toolsUsed,
      })
    }

    let reply: string
    try {
      reply = result.response.text()
    } catch {
      reply = '抱歉，這次沒有產生有效回覆，請再試一次。'
    }
    return NextResponse.json({ reply, tools_used: toolsUsed })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai-chat] error', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
