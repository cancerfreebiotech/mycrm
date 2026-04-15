import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase'
import { getPrompt } from '@/lib/prompts'

/**
 * Wraps any async Gemini call with one automatic retry after 3 seconds.
 * On first failure, calls onFirstFailure (e.g. send "retrying..." message to user).
 * If retry also fails, throws the error for the caller to handle.
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  onFirstFailure?: () => Promise<void>
): Promise<T> {
  try {
    return await fn()
  } catch {
    if (onFirstFailure) await onFirstFailure()
    await new Promise((r) => setTimeout(r, 3000))
    return await fn()
  }
}

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
      const ep = data.ai_endpoints as { api_key: string } | null
      const apiKey = ep?.api_key && ep.api_key !== 'placeholder'
        ? ep.api_key
        : process.env.GEMINI_API_KEY!
      return { modelId: data.model_id, apiKey }
    }
  }

  // Fallback: treat as plain model string (legacy) or use default
  return {
    modelId: aiModelId ?? 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY!,
  }
}

export async function analyzeBusinessCard(
  imageBuffers: Buffer | Buffer[],
  aiModelId: string | null = null,
  userId?: string
): Promise<CardData> {
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

  const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers]
  const imageParts = buffers.map((buf) => ({
    inlineData: {
      mimeType: 'image/jpeg' as const,
      data: buf.toString('base64'),
    },
  }))

  const systemPrompt = await getPrompt('ocr_card', userId)
  const result = await geminiModel.generateContent([systemPrompt, ...imageParts])
  const text = result.response.text().trim()
  const json = text.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(json) as CardData
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
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

  const basePrompt = await getPrompt('task_parse')
  const prompt = `現在時間（UTC）：${nowIso}\n${basePrompt}\n\n任務描述：${text}`

  const result = await geminiModel.generateContent(prompt)
  const raw = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(raw) as TaskParsed
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
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

  const basePrompt = await getPrompt('meeting_parse')
  const prompt = `現在時間（UTC）：${nowIso}\n${basePrompt}\n\n會議描述：${text}`

  const result = await geminiModel.generateContent(prompt)
  const raw = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(raw) as MeetingParsed
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
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

  const todayDate = nowIso.slice(0, 10)
  const prompt =
    `現在日期（UTC+8）：${todayDate}\n\n` +
    `從以下描述中解析三個欄位，回傳 JSON（無 markdown wrapper）：\n` +
    `- met_at：認識場合（活動名稱/地點），沒提到則 null\n` +
    `- met_date：認識日期（YYYY-MM-DD），沒提到則今天（${todayDate}）；支援「昨天」「上週五」等自然語言\n` +
    `- referred_by：介紹人姓名，沒提到則 null\n\n` +
    `描述：${text}`

  const result = await geminiModel.generateContent(prompt)
  const raw = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(raw) as MetParsed
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
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

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

  const result = await geminiModel.generateContent(prompt)
  const raw = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(raw) as VisitNoteParsed
}

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
