import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase'

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
}

interface ModelConfig {
  modelId: string
  apiKey: string
}

const SYSTEM_PROMPT = `你是一個專業名片辨識助手。名片可能為中文、英文或日文，請辨識後以原文回傳各欄位。
從圖中提取以下資訊，回傳純 JSON，不要有任何其他文字：
{"name":"","name_en":"","name_local":"","company":"","company_en":"","company_local":"","job_title":"","email":"","second_email":"","phone":"","second_phone":"","address":"","website":"","linkedin_url":"","facebook_url":""}`

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
  aiModelId: string | null = null
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

  const result = await geminiModel.generateContent([SYSTEM_PROMPT, ...imageParts])
  const text = result.response.text().trim()
  const json = text.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(json) as CardData
}

export async function generateEmailContent(
  description: string,
  templateContent?: string,
  aiModelId: string | null = null
): Promise<string> {
  const { modelId, apiKey } = await resolveModelConfig(aiModelId)
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model: modelId })

  const prompt = templateContent
    ? `你是一位專業的商務郵件撰寫助手。請根據以下範本和補充說明，生成一封完整的商務郵件內文（HTML 格式）。\n\n範本內容：\n${templateContent}\n\n補充說明：\n${description}\n\n請合併範本與補充說明，生成最終郵件內文。只回傳 HTML 內文，不要包含 <html>、<head>、<body> 標籤，不要有任何其他文字。`
    : `你是一位專業的商務郵件撰寫助手。請根據以下描述，生成一封完整的商務郵件內文（HTML 格式）。\n\n描述：\n${description}\n\n只回傳 HTML 內文，不要包含 <html>、<head>、<body> 標籤，不要有任何其他文字。`

  const result = await geminiModel.generateContent(prompt)
  return result.response.text().trim()
}
