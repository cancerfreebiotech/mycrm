/**
 * Vercel Cron Job — Daily docs regeneration
 * Schedule: 02:00 AM Taipei (= 18:00 UTC prev day)
 * vercel.json: { "path": "/api/docs/cron", "schedule": "0 18 * * *" }
 *
 * Auth: Vercel automatically sends Authorization: Bearer {CRON_SECRET}
 * Set CRON_SECRET in Vercel environment variables.
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase'

const FEATURES_SUMMARY = `
myCRM v1.3.9 功能摘要（供文件生成參考）：

【一般使用者功能】
- Telegram Bot (@CF_CRMBot): /start 綁定帳號, /help 指令列表, /AI 查詢使用的AI模型, /note 或 /n 新增筆記, /w 指派任務（自然語言）, /u 查看成員綁定狀態
- 名片辨識：傳送名片照片 → Gemini AI OCR → 確認存檔 → 回傳聯絡人連結；支援一次最多6張；辨識失敗時通知管理員
- Microsoft Teams Bot：自動綁定帳號（Graph API），收到任務通知（Adaptive Card），按鈕標記完成，/help, /AI 指令
- 聯絡人管理：搜尋、Tag篩選、國家篩選、多欄排序、行動版卡片式、Email/電話複製按鈕
- 任務管理：任務編號(#N)、指派人顯示名稱、Realtime即時更新、三種方式標記完成（Telegram/Teams/Web）
- 個人設定：顯示名稱、語言、深色模式、AI模型選擇、助理tag picker、Teams綁定狀態、個人Email prompt

【Super Admin 功能】
- 使用者管理：Telegram/Teams綁定狀態、角色設定
- AI模型管理：新增/啟用/停用模型、設定組織預設
- Tag管理：聯絡人分類標籤
- 郵件範本管理：範本+附件（最大5MB）
- Prompt管理：ocr/email_generate/task_parse/docs_generate，三層優先級（個人>組織>系統）
- 國家管理：ISO code自動填入中英日名稱+emoji，60+國家
- 辨識失敗審查：查看失敗名片、前往手動建立、標記完成
- 報表管理：週/月排程，角色權限過濾

【技術架構】
- Next.js 14 App Router + TypeScript + Tailwind
- Supabase PostgreSQL（RLS：super_admin全權限，user只能讀寫自己的資料）
- Telegraf (Telegram Bot) + Bot Framework (Teams Bot)
- Google Gemini AI（OCR/任務解析/Email生成）
- 部署：Vercel
`

const LOCALES = ['zh-TW', 'en', 'ja'] as const
const SECTIONS = ['user', 'super_admin'] as const

type Locale = typeof LOCALES[number]
type Section = typeof SECTIONS[number]

function buildPrompt(locale: Locale, section: Section): string {
  const langMap: Record<Locale, string> = {
    'zh-TW': '繁體中文（台灣用語）',
    'en': 'English',
    'ja': '日本語',
  }

  const sectionDesc: Record<Section, string> = {
    user: '一般使用者（Telegram Bot、名片辨識、聯絡人、任務、個人設定、Teams Bot）',
    super_admin: '系統管理員（使用者管理、AI模型、Tag、郵件範本、Prompt、國家管理、辨識失敗審查、報表）',
  }

  return `你是技術文件撰寫專家。請根據以下功能摘要，為「${sectionDesc[section]}」撰寫一份完整的使用說明書。

語言：${langMap[locale]}
角色：${section === 'user' ? '一般使用者' : 'Super Admin 管理員'}

功能摘要：
${FEATURES_SUMMARY}

文件撰寫規範：
1. 格式：Markdown，使用 # 為主標題、## 為章節、### 為次章節、- 為條列
2. 語氣：友善、清晰，針對實際使用者
3. 每個 ## 章節要有實質內容（至少 3-5 條）
4. 章節順序：快速開始 → 主要功能（依模組）→ 流程圖 → 常見問題
5. 必須包含至少 2 張 mermaid 流程圖（使用 \`\`\`mermaid ... \`\`\` 格式）
   - flowchart TD 或 sequenceDiagram
   - user 文件：系統整體流程 + 名片辨識或任務流程
   - super_admin 文件：系統架構圖 + Teams綁定流程或RLS權限圖
6. 直接輸出 Markdown 內容，不要加任何說明文字或 code fence 包裝整份文件

請開始撰寫：`
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const supabase = createServiceClient()

  const results: { locale: string; section: string; ok: boolean; error?: string }[] = []

  for (const locale of LOCALES) {
    for (const section of SECTIONS) {
      try {
        console.log(`[docs-cron] generating ${locale} × ${section}`)
        const prompt = buildPrompt(locale, section)
        const result = await model.generateContent(prompt)
        const content = result.response.text().trim()

        const { error } = await supabase
          .from('docs_content')
          .upsert({ locale, section, content, generated_at: new Date().toISOString() }, { onConflict: 'locale,section' })

        if (error) throw new Error(error.message)
        results.push({ locale, section, ok: true })
        console.log(`[docs-cron] ✅ ${locale} × ${section}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[docs-cron] ❌ ${locale} × ${section}:`, msg)
        results.push({ locale, section, ok: false, error: msg })
      }
    }
  }

  const succeeded = results.filter((r) => r.ok).length
  return NextResponse.json({ generated: `${succeeded}/${results.length}`, results })
}
