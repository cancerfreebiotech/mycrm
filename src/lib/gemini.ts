import { GoogleGenerativeAI } from '@google/generative-ai'
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
  due_at: string | null   // ISO 8601 UTC string or null
  assignees: string[]     // names or emails to search; empty = self-reminder
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

export async function generateEmailContent(
  description: string,
  templateContent?: string,
  aiModelId: string | null = null,
  userId?: string
): Promise<string> {
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

  const systemPrompt = await getPrompt('email_generate', userId)
  const prompt = templateContent
    ? `${systemPrompt}\n\n範本內容：\n${templateContent}\n\n補充說明：\n${description}\n\n請合併範本與補充說明，生成最終郵件內文。只回傳 HTML 內文，不要包含 <html>、<head>、<body> 標籤，不要有任何其他文字。`
    : `${systemPrompt}\n\n描述：\n${description}\n\n只回傳 HTML 內文，不要包含 <html>、<head>、<body> 標籤，不要有任何其他文字。`

  const result = await geminiModel.generateContent(prompt)
  return result.response.text().trim()
}
