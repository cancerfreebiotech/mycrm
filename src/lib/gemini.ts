import { GoogleGenerativeAI } from '@google/generative-ai'

export interface CardData {
  name: string
  company: string
  job_title: string
  email: string
  phone: string
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

const SYSTEM_PROMPT =
  '你是一個專業名片辨識助手，請從圖中提取：姓名、公司、職稱、Email、電話，並回傳純 JSON 格式，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}'

export async function analyzeBusinessCard(imageBuffer: Buffer): Promise<CardData> {
  const result = await model.generateContent([
    SYSTEM_PROMPT,
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBuffer.toString('base64'),
      },
    },
  ])

  const text = result.response.text().trim()
  const json = text.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  return JSON.parse(json) as CardData
}
