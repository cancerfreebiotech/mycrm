import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { processCardImage } from '@/lib/imageProcessor'

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
- name：若截圖姓名為中文或日文漢字，填入此欄
- name_en：若截圖姓名為英文或羅馬字，填入此欄；若兩者都有，分別填入
- job_title：目前職位名稱（最新一筆）
- company：目前任職公司（最新一筆）
- linkedin_url：若截圖中有完整或部分 LinkedIn URL，重組為 https://linkedin.com/in/{username} 格式；若看不到則空字串
- email：若截圖中有 Email 則填入，否則空字串
- notes：若截圖中有 About / 自我介紹文字，加上前綴「[LinkedIn About] 」後填入；否則空字串
- 所有欄位若截圖中不可見則輸出空字串（不要輸出 null）`

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { image } = await req.json()
    if (!image) return NextResponse.json({ error: 'Missing image' }, { status: 400 })

    // Resolve user's ai_model_id → modelId + apiKey
    const service = createServiceClient()
    const { data: profile } = await service
      .from('users')
      .select('ai_model_id')
      .eq('id', user.id)
      .single()

    let modelId = 'gemini-2.5-flash'
    let apiKey = process.env.GEMINI_API_KEY!

    if (profile?.ai_model_id && /^[0-9a-f-]{36}$/i.test(profile.ai_model_id)) {
      const { data: modelRow } = await service
        .from('ai_models')
        .select('model_id, ai_endpoints(api_key)')
        .eq('id', profile.ai_model_id)
        .single()
      if (modelRow) {
        const ep = modelRow.ai_endpoints as { api_key: string } | null
        modelId = modelRow.model_id
        if (ep?.api_key && ep.api_key !== 'placeholder') apiKey = ep.api_key
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: modelId })

    const result = await model.generateContent([
      LINKEDIN_PROMPT,
      { inlineData: { mimeType: 'image/jpeg', data: image } },
    ])

    const raw = result.response.text().trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(raw) as LinkedInParsed

    // Name fallback: use English name if no local language name
    if (!parsed.name && parsed.name_en) parsed.name = parsed.name_en

    // Upload screenshot to Storage
    let card_img_url: string | null = null
    try {
      const imgBuffer = Buffer.from(image, 'base64')
      const compressed = await processCardImage(imgBuffer)
      const storagePath = `cards/linkedin_${user.id}_${Date.now()}.jpg`
      const { error: uploadError } = await service.storage
        .from('cards').upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
      if (!uploadError) {
        const { data: publicUrlData } = service.storage.from('cards').getPublicUrl(storagePath)
        card_img_url = publicUrlData.publicUrl
      }
    } catch {
      // Screenshot upload failure is non-fatal
    }

    return NextResponse.json({ ...parsed, card_img_url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
