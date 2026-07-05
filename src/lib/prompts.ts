import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'
import { SYSTEM_PROMPTS, type PromptKey } from '@/lib/prompt-constants'

export { SYSTEM_PROMPTS, type PromptKey }

export async function getPrompt(key: PromptKey, userId?: string): Promise<string> {
  // Phase 2+: 由呼叫端傳入請求 org；單租戶期間 default org 匹配所有 prompts 列
  const db = orgScopedClient(systemOrgContext())

  // Tier 1: personal user_prompts
  if (userId) {
    const { data: userPrompt } = await db
      .from('user_prompts')
      .select('content')
      .eq('user_id', userId)
      .eq('key', key)
      .single()
    if (userPrompt?.content) return userPrompt.content
  }

  // Tier 2: org-level prompts
  const { data: orgPrompt } = await db
    .from('prompts')
    .select('content')
    .eq('key', key)
    .single()
  if (orgPrompt?.content) return orgPrompt.content

  // Tier 3: hardcoded default
  return SYSTEM_PROMPTS[key]
}
