import { GoogleGenerativeAI } from '@google/generative-ai'

export interface CardData {
  name: string
  company: string
  job_title: string
  email: string
  phone: string
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const SYSTEM_PROMPT =
  '你是一個專業名片辨識助手。名片可能為中文、英文或日文，請辨識後以原文回傳。從圖中提取：姓名、公司、職稱、Email、電話，回傳純 JSON，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}'

export async function generateEmailContent(
  description: string,
  templateContent?: string,
  model: string = 'gemini-2.5-flash'
): Promise<string> {
  const geminiModel = genAI.getGenerativeModel({ model })

  const prompt = templateContent
    ? `你是一位專業的商務郵件撰寫助手。請根據以下範本和補充說明，生成一封完整的商務郵件內文（HTML 格式）。\n\n範本內容：\n${templateContent}\n\n補充說明：\n${description}\n\n請合併範本與補充說明，生成最終郵件內文。只回傳 HTML 內文，不要包含 <html>、<head>、<body> 標籤，不要有任何其他文字。`
    : `你是一位專業的商務郵件撰寫助手。請根據以下描述，生成一封完整的商務郵件內文（HTML 格式）。\n\n描述：\n${description}\n\n只回傳 HTML 內文，不要包含 <html>、<head>、<body> 標籤，不要有任何其他文字。`

  const result = await geminiModel.generateContent(prompt)
  return result.response.text().trim()
}

export async function analyzeBusinessCard(
  imageBuffers: Buffer | Buffer[],
  model: string = 'gemini-2.5-flash'
): Promise<CardData> {
  const geminiModel = genAI.getGenerativeModel({ model })

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
