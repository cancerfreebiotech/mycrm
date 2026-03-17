import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase'
import { getPrompt } from '@/lib/prompts'

// Secured by a shared secret to prevent unauthorized generation
const GENERATE_SECRET = process.env.DOCS_GENERATE_SECRET

const LOCALES = ['zh-TW', 'en', 'ja'] as const
const SECTIONS = ['user', 'super_admin'] as const

const SECTION_DESCRIPTIONS: Record<typeof SECTIONS[number], string> = {
  user: `
# myCRM 一般使用者功能

## 登入
- Microsoft SSO（@cancerfree.io 帳號）
- 非授權帳號無法登入

## 綁定 Telegram
- 在 Telegram 搜尋 @userinfobot 取得數字 ID
- 前往個人設定填入 Telegram ID

## 綁定 Microsoft Teams Bot
- 在 Teams 搜尋「CancerFree CRM」並傳送任意訊息，系統自動綁定

## Bot 指令
- 傳送名片照片：AI 辨識並確認存檔（可一次傳多張）
- /note：記錄筆記或會議紀錄
- /email 或 /e：發送郵件
- /search 或 /s [關鍵字]：搜尋聯絡人
- /add_back 或 /ab @姓名：補充名片反面
- /user 或 /u：列出成員
- @姓名 格式快速記錄筆記（如 @王小明 今天開會討論合作）

## 聯絡人管理
- 列表搜尋（姓名、公司、Email）
- Tag 多選篩選
- 新增：直接填表或上傳最多 6 張名片讓 AI 合併辨識
- 詳情頁：Email/電話一鍵複製、補充上傳名片
- 批次上傳：一次最多 20 張名片
- Export：Excel / CSV 下載

## 筆記與互動紀錄
- 在聯絡人詳情頁新增筆記、會議記錄（可填會議日期）
- 搜尋筆記（關鍵字、日期範圍、類型）
- 未歸類筆記：Bot 找不到聯絡人時存為未歸類，可手動指定聯絡人

## 發送郵件
- 從聯絡人頁寄信，自動帶入 Email
- 支援 To 欄位手動修改
- 可選現有範本（含附件），或 AI 生成內文
- 可臨時上傳附件（單次發信）
- 從 Microsoft 信箱寄出，自動記錄互動紀錄

## 任務管理
- 三分頁：我的提醒 / 我指派的 / 指派給我的
- 狀態：待處理 → 完成 / 延後 / 取消

## 個人設定
- Telegram ID 綁定
- AI OCR 模型選擇（Endpoint + Model 兩層）
- 介面主題（淺色 / 深色）
- 介面語言（繁中 / English / 日本語）
`,
  super_admin: `
# myCRM Super Admin 功能

## 使用者管理（/admin/users）
- 切換成員角色（member ↔ super_admin）
- 無法修改自己的角色

## AI Endpoint 與 Model 管理（/admin/models）
- Endpoint：新增、編輯名稱/Base URL/API Key、啟用/停用、刪除
- Model：在 Endpoint 下新增 Model ID 和顯示名稱、啟用/停用
- 停用 Endpoint 後所有底下 Model 都不可選

## Tag 管理（/admin/tags）
- 新增、編輯、刪除 Tag
- 刪除後 contact_tags 自動清除

## 郵件範本管理（/admin/templates）
- 新增、編輯範本（名稱、主旨、HTML 內文）
- AI 生成或合併現有內文
- 附件管理（單檔 2MB 限制）

## 報表管理（/admin/reports）
- 生成 Excel 報表（聯絡人 + 互動紀錄）
- 設定排程自動寄 Gmail（Cron 表達式）

## 國家管理（/admin/countries）
- 維護 ISO 3166-1 α-2 國家清單（含旗幟 emoji、多語系名稱）
- 啟用 / 停用 / 刪除
`,
}

const LOCALE_INSTRUCTIONS: Record<typeof LOCALES[number], string> = {
  'zh-TW': '請用繁體中文撰寫，使用台灣用語。',
  'en': 'Please write in English.',
  'ja': '日本語で記述してください。',
}

export async function POST(request: Request) {
  // Auth check
  const secret = request.headers.get('x-generate-secret')
  if (GENERATE_SECRET && secret !== GENERATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Get AI model config (use org default or env key)
  const { data: defaultModel } = await supabase
    .from('ai_models')
    .select('id, model_id, ai_endpoints(api_key)')
    .eq('is_active', true)
    .limit(1)
    .single()

  const apiKey = (() => {
    if (defaultModel) {
      const ep = defaultModel.ai_endpoints as { api_key: string } | null
      if (ep?.api_key && ep.api_key !== 'placeholder') return ep.api_key
    }
    return process.env.GEMINI_API_KEY!
  })()

  const modelId = defaultModel?.model_id ?? 'gemini-2.5-flash'

  const systemPrompt = await getPrompt('docs_generate')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelId })

  const results: Array<{ locale: string; section: string; content: string }> = []
  const errors: string[] = []

  for (const locale of LOCALES) {
    for (const section of SECTIONS) {
      try {
        const prompt = `${systemPrompt}

${LOCALE_INSTRUCTIONS[locale]}

以下是系統功能說明，請根據此內容生成使用者文件（Markdown 格式）：

${SECTION_DESCRIPTIONS[section]}`

        const result = await model.generateContent(prompt)
        const content = result.response.text().trim()
        results.push({ locale, section, content })
      } catch (err) {
        errors.push(`${locale}/${section}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // Upsert into docs_content
  if (results.length > 0) {
    const rows = results.map(({ locale, section, content }) => ({
      locale,
      section,
      content,
      generated_at: new Date().toISOString(),
    }))
    const { error: upsertError } = await supabase
      .from('docs_content')
      .upsert(rows, { onConflict: 'locale,section' })
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message, errors }, { status: 500 })
    }
  }

  return NextResponse.json({
    generated: results.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
