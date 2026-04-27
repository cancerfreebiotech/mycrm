import Portkey from 'portkey-ai'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase'
import { getPrompt } from '@/lib/prompts'

export interface CardData {
  name: string
  name_en: string
  name_local: string
  company: string
  company_en: string
  company_local: string
  job_title: string
  email: string
  second_email: string
  phone: string
  second_phone: string
  address: string
  website: string
  linkedin_url: string
  facebook_url: string
  country_code: string | null
  rotation: 0 | 90 | 180 | 270
}

interface ModelConfig {
  modelId: string
  apiKey: string
}

// Portkey gateway: routing strategy (loadbalance across virtual keys) and retry
// are defined in the Portkey Config referenced by PORTKEY_CONFIG_ID. This keeps
// the strategy tunable from the dashboard without redeploying the app.
//
// timeout (180s) is the SDK-level fetch cap. It must be larger than the worst
// case Portkey strategy chain (per-target timeouts × retries × fallback layers),
// otherwise the SDK gives up before fallback finishes.
function makePortkey(): Portkey {
  return new Portkey({
    apiKey: process.env.PORTKEY_API_KEY!,
    config: process.env.PORTKEY_CONFIG_ID!,
    timeout: 180_000,
  })
}

type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

async function portkeyGenerate(
  modelId: string,
  content: MessageContent
): Promise<string> {
  const portkey = makePortkey()
  const result = await portkey.chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content }],
  })
  const raw = result.choices?.[0]?.message?.content
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => ('text' in p ? p.text : '')).join('') : ''
  return text.trim()
}

function stripJsonFence(text: string): string {
  return text.replace(/^```json\s*/, '').replace(/\s*```$/, '')
}

function imageParts(buffers: Buffer[]): Array<{ type: 'image_url'; image_url: { url: string } }> {
  return buffers.map((buf) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
  }))
}

// Resolve ai_model_id (UUID) → { modelId, apiKey }
// Falls back to env GEMINI_API_KEY + default model string if aiModelId is a plain model string or null
async function resolveModelConfig(aiModelId: string | null): Promise<ModelConfig> {
  // If it looks like a UUID, query the DB
  if (aiModelId && /^[0-9a-f-]{36}$/i.test(aiModelId)) {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('ai_models')
      .select('model_id, ai_endpoints(api_key)')
      .eq('id', aiModelId)
      .single()

    if (data) {
      const ep = data.ai_endpoints as unknown as { api_key: string } | null
      const apiKey = ep?.api_key && ep.api_key !== 'placeholder'
        ? ep.api_key
        : process.env.GEMINI_API_KEY!
      return { modelId: data.model_id, apiKey }
    }
  }

  // Fallback: treat as plain model string (legacy) or use default
  return {
    modelId: aiModelId ?? 'gemini-3.1-flash-lite-preview',
    apiKey: process.env.GEMINI_API_KEY!,
  }
}

export async function analyzeBusinessCard(
  imageBuffers: Buffer | Buffer[],
  aiModelId: string | null = null,
  userId?: string
): Promise<CardData> {
  const { modelId } = await resolveModelConfig(aiModelId)
  const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers]
  const systemPrompt = await getPrompt('ocr_card', userId)

  const text = await portkeyGenerate(modelId, [
    { type: 'text', text: systemPrompt },
    ...imageParts(buffers),
  ])
  return JSON.parse(stripJsonFence(text)) as CardData
}

export interface LinkedInParsed {
  name: string
  name_en: string
  job_title: string
  company: string
  linkedin_url: string
  email: string
  notes: string
}

const LINKEDIN_PROMPT = `你是一個專業的 LinkedIn 截圖解析助手。請從 LinkedIn 個人頁截圖中提取以下資訊，回傳純 JSON，不要有任何其他文字：
{"name":"","name_en":"","job_title":"","company":"","linkedin_url":"","email":"","notes":""}
規則：
- name：中文或日文漢字姓名
- name_en：英文或羅馬字姓名
- job_title：目前職位名稱（最新一筆）
- company：目前任職公司（最新一筆）
- linkedin_url：重組為 https://linkedin.com/in/{username} 格式，看不到則空字串
- email：截圖中有則填入，否則空字串
- notes：About 自我介紹加前綴「[LinkedIn About] 」，否則空字串
- 所有欄位不可見則輸出空字串`

export async function parseLinkedInScreenshot(
  imageBuffer: Buffer,
  aiModelId: string | null = null
): Promise<LinkedInParsed> {
  const { modelId } = await resolveModelConfig(aiModelId)
  const text = await portkeyGenerate(modelId, [
    { type: 'text', text: LINKEDIN_PROMPT },
    ...imageParts([imageBuffer]),
  ])
  return JSON.parse(stripJsonFence(text)) as LinkedInParsed
}

export interface TaskParsed {
  title: string
  due_at: string | null       // ISO 8601 UTC string or null
  assignees: string[]         // names or emails to search; empty = self-reminder
  contact_name: string | null // external CRM contact mentioned in the task
}

export async function parseTaskCommand(
  text: string,
  nowIso: string,
  aiModelId: string | null = null
): Promise<TaskParsed> {
  const { modelId } = await resolveModelConfig(aiModelId)
  const basePrompt = await getPrompt('task_parse')
  const prompt = `現在時間（UTC）：${nowIso}\n${basePrompt}\n\n任務描述：${text}`

  const raw = await portkeyGenerate(modelId, prompt)
  return JSON.parse(stripJsonFence(raw)) as TaskParsed
}

export interface MeetingParsed {
  title: string
  start_iso: string
  duration_minutes: 30 | 60 | 90 | 120
  attendees: string[]
  location: string | null
}

export async function parseMeetingCommand(
  text: string,
  nowIso: string,
  aiModelId: string | null = null
): Promise<MeetingParsed> {
  const { modelId } = await resolveModelConfig(aiModelId)
  const basePrompt = await getPrompt('meeting_parse')
  const prompt = `現在時間（UTC）：${nowIso}\n${basePrompt}\n\n會議描述：${text}`

  const raw = await portkeyGenerate(modelId, prompt)
  return JSON.parse(stripJsonFence(raw)) as MeetingParsed
}

export interface MetParsed {
  met_at: string | null
  met_date: string  // YYYY-MM-DD
  referred_by: string | null
}

export async function parseMetCommand(
  text: string,
  nowIso: string,
  aiModelId: string | null = null
): Promise<MetParsed> {
  const { modelId } = await resolveModelConfig(aiModelId)

  const todayDate = nowIso.slice(0, 10)
  const prompt =
    `現在日期（UTC+8）：${todayDate}\n\n` +
    `從以下描述中解析三個欄位，回傳 JSON（無 markdown wrapper）：\n` +
    `- met_at：認識場合（活動名稱/地點），沒提到則 null\n` +
    `- met_date：認識日期（YYYY-MM-DD），沒提到則今天（${todayDate}）；支援「昨天」「上週五」等自然語言\n` +
    `- referred_by：介紹人姓名，沒提到則 null\n\n` +
    `描述：${text}`

  const raw = await portkeyGenerate(modelId, prompt)
  return JSON.parse(stripJsonFence(raw)) as MetParsed
}

export interface VisitNoteParsed {
  type: 'note' | 'meeting'
  content: string
  meeting_date: string | null   // YYYY-MM-DD
  meeting_time: string | null   // HH:MM
  meeting_location: string | null
}

export async function parseVisitNote(
  text: string,
  nowIso: string,
  aiModelId: string | null = null
): Promise<VisitNoteParsed> {
  const { modelId } = await resolveModelConfig(aiModelId)

  const todayDate = nowIso.slice(0, 10)
  const prompt =
    `現在日期（UTC+8）：${todayDate}\n\n` +
    `分析以下筆記，判斷是否包含拜訪/會議資訊，回傳 JSON（無 markdown wrapper）：\n` +
    `- type：若包含拜訪/會議資訊則 "meeting"，否則 "note"\n` +
    `- content：筆記內容（原文，不要修改）\n` +
    `- meeting_date：日期 YYYY-MM-DD，沒提到則 null；支援「昨天」「上週五」等自然語言\n` +
    `- meeting_time：時間 HH:MM（24小時制），沒提到則 null\n` +
    `- meeting_location：地點，沒提到則 null\n\n` +
    `筆記：${text}`

  const raw = await portkeyGenerate(modelId, prompt)
  return JSON.parse(stripJsonFence(raw)) as VisitNoteParsed
}

// generateEmailContent stays on @google/generative-ai directly: it uses safety_settings
// (BLOCK_NONE on all 4 harm categories) which can't be round-tripped cleanly through
// Portkey's OpenAI-compatible API. This function is only called from /api/ai-email
// (web), not from the Telegram bot, so it's outside this phase's scope anyway.
const EMAIL_SAFETY: { category: HarmCategory; threshold: HarmBlockThreshold }[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
]

export async function generateEmailContent(
  description: string,
  templateContent?: string,
  aiModelId: string | null = null,
  userId?: string,
  generateSubject = false,
  returnHtml = false
): Promise<{ text: string; subject?: string }> {
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId, safetySettings: EMAIL_SAFETY })

  const systemPrompt = await getPrompt('email_generate', userId)

  const langNote = '請依照使用者的撰寫指示（補充說明或描述）所使用的語言撰寫郵件，不要因範本內容或背景資訊的語言而改變輸出語言。若使用者指示有明確語言要求，則以指示為準。'
  const plainTextNote = '請只回傳純文字內文，不要有任何 HTML 標籤，使用換行（\\n）分段，不要有任何其他說明文字。'
  const htmlNote = '請回傳乾淨的 HTML 郵件內文（只用 <p>、<br>、<strong>、<em>、<ul>、<li>、<a> 等基本標籤，不要加 <html>/<body>/<head>/<style>）。寫作風格要自然、像真人寫的商業信件，不要有明顯的 AI 痕跡（避免過度客套、避免條列式堆疊、避免每段都用「首先」「其次」「最後」）。段落之間用 <p> 分段即可。不要有任何說明文字，只回傳 HTML 內文。'
  const formatNote = returnHtml ? htmlNote : plainTextNote

  if (generateSubject) {
    const baseContent = templateContent
      ? `${systemPrompt}\n\n${langNote}\n\n${formatNote}\n\n範本內容：\n${templateContent}\n\n補充說明：\n${description}\n\n請合併範本與補充說明，生成最終郵件。`
      : `${systemPrompt}\n\n${langNote}\n\n${formatNote}\n\n描述：\n${description}`
    const jsonFormat = returnHtml
      ? '請回傳純 JSON（不要有任何其他文字）：{"subject":"郵件主旨","text":"HTML 郵件內文"}'
      : '請回傳純 JSON（不要有任何其他文字）：{"subject":"郵件主旨","text":"純文字內文（使用 \\n 換行，不含 HTML）"}'
    const prompt = `${baseContent}\n\n${jsonFormat}`
    const result = await geminiModel.generateContent(prompt)
    const raw = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(raw) as { subject: string; text: string }
    return { text: parsed.text, subject: parsed.subject }
  }

  const prompt = templateContent
    ? `${systemPrompt}\n\n${langNote}\n\n${formatNote}\n\n範本內容：\n${templateContent}\n\n補充說明：\n${description}\n\n請合併範本與補充說明，生成最終郵件內文。`
    : `${systemPrompt}\n\n${langNote}\n\n${formatNote}\n\n描述：\n${description}`

  const result = await geminiModel.generateContent(prompt)
  return { text: result.response.text().trim() }
}
