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
