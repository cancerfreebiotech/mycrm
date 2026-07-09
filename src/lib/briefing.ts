import { GoogleGenerativeAI } from '@google/generative-ai'
import { resolveTouchpoint, routedGenerate } from '@/lib/aiRouting'
import { systemOrgContext } from '@/lib/orgContext'

// Social Briefing：用 Gemini + Google Search grounding 整理「這個人 + 他公司的最新動態」。
// 只用公開、可標來源的資訊（grounding）；不爬社群平台。
// 注意：此呼叫需 GEMINI_API_KEY（僅在 Vercel 環境，本機無法測），驗證需走部署。

export interface BriefingContactInput {
  name: string | null
  name_en: string | null
  company: string | null
  company_en: string | null
  job_title: string | null
  department: string | null
  website: string | null
  linkedin_url: string | null
  country_code: string | null
}

export interface BriefingSource {
  title: string
  url: string
}

export interface BriefingResult {
  markdown: string
  sources: BriefingSource[]
  modelUsed: string
}

function buildPrompt(c: BriefingContactInput): string {
  const name = [c.name, c.name_en].filter(Boolean).join(' / ') || '（姓名不詳）'
  const company = [c.company, c.company_en].filter(Boolean).join(' / ') || '（公司不詳）'
  const facts = [
    `姓名：${name}`,
    `公司：${company}`,
    c.job_title ? `職稱：${c.job_title}` : null,
    c.department ? `部門：${c.department}` : null,
    c.website ? `公司網站：${c.website}` : null,
    c.linkedin_url ? `LinkedIn：${c.linkedin_url}` : null,
  ].filter(Boolean).join('\n')

  return [
    '你是業務的會議前助理。我即將與以下聯絡人開會，請用 Google 搜尋這個人與其公司的「最新公開動態」，整理一份繁體中文 briefing。',
    '',
    facts,
    '',
    '請用 Markdown 輸出，包含以下段落（找不到資料的段落請註明「查無公開資料」）：',
    '## 人物近況',
    '## 公司近況（近期新聞 / 募資 / 產品 / 動態）',
    '## 建議開場與話題',
    '',
    '只整理公開、可查證的資訊；不要臆測或編造。語氣精簡、條列為主。',
  ].join('\n')
}

// 從 grounding metadata 取來源連結（去重）
function extractSources(candidate: unknown): BriefingSource[] {
  const meta = (candidate as { groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } })?.groundingMetadata
  const chunks = meta?.groundingChunks ?? []
  const seen = new Set<string>()
  const sources: BriefingSource[] = []
  for (const ch of chunks) {
    const url = ch.web?.uri
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({ title: ch.web?.title || url, url })
  }
  return sources
}

export async function generateContactBriefing(contact: BriefingContactInput): Promise<BriefingResult> {
  // briefing 由 cron worker 執行，無 user session。briefing 建議走 google（googleSearch
  // grounding），但管理端可指派到 openai 相容端點——resolveTouchpoint 不再保證 via==='google'。
  const resolved = await resolveTouchpoint(systemOrgContext().orgId, 'briefing')

  if (resolved.via === 'openai') {
    // openai 相容端點無 googleSearch grounding，結果不含即時搜尋來源（管理端已警告）。
    const markdown = await routedGenerate(resolved, buildPrompt(contact))
    return { markdown, sources: [], modelUsed: resolved.modelId }
  }

  const apiKey = resolved.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: resolved.modelId,
    // Google Search grounding（Gemini 2.0+）。SDK 0.24 型別未含 googleSearch，故 cast。
    tools: [{ googleSearch: {} }] as unknown as Parameters<typeof genAI.getGenerativeModel>[0]['tools'],
  })

  const result = await model.generateContent(buildPrompt(contact))
  const response = result.response
  const markdown = response.text().trim()
  const sources = extractSources(response.candidates?.[0])

  return { markdown, sources, modelUsed: resolved.modelId }
}
