import { createServiceClient } from './supabase'

export interface Contact {
  id: string
  name: string
  company: string
  email: string
}

export interface DuplicateResult {
  exact: Contact | null
  similar: Contact[]
}

export async function checkDuplicates(email: string, name: string): Promise<DuplicateResult> {
  const supabase = createServiceClient()

  // 完全重複：email 完全相符
  let exact: Contact | null = null
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, company, email')
      .is('deleted_at', null)
      .eq('email', email)
      .maybeSingle()
    exact = data ?? null
  }

  // 疑似重複：姓名相似度（pg_trgm similarity >= 0.6）
  let similar: Contact[] = []
  if (name) {
    const { data } = await supabase
      .rpc('find_similar_contacts', { input_name: name, threshold: 0.6 })
    similar = (data ?? []).filter((c: Contact) => c.id !== exact?.id)
  }

  return { exact, similar }
}
