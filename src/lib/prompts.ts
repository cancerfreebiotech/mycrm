import { createServiceClient } from '@/lib/supabase'
import { SYSTEM_PROMPTS, type PromptKey } from '@/lib/prompt-constants'

export { SYSTEM_PROMPTS, type PromptKey }

export async function getPrompt(key: PromptKey, userId?: string): Promise<string> {
  const supabase = createServiceClient()

  // Tier 1: personal user_prompts
  if (userId) {
    const { data: userPrompt } = await supabase
      .from('user_prompts')
      .select('content')
      .eq('user_id', userId)
      .eq('key', key)
      .single()
    if (userPrompt?.content) return userPrompt.content
  }

  // Tier 2: org-level prompts
  const { data: orgPrompt } = await supabase
    .from('prompts')
    .select('content')
    .eq('key', key)
    .single()
  if (orgPrompt?.content) return orgPrompt.content

  // Tier 3: hardcoded default
  return SYSTEM_PROMPTS[key]
}
