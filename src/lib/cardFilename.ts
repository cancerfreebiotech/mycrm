import { createServiceClient } from './supabase'

/**
 * 命名規則：yymmdd_hhmmss-{流水號}-{姓名}-{front|back}.jpg
 * 流水號每天從 001 開始
 */
export async function generateCardFilename(opts?: { name?: string; side?: 'front' | 'back' }): Promise<string> {
  const now = new Date()

  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  const datePrefix = `${yy}${mm}${dd}`

  const supabase = createServiceClient()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const { count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay)

  const serial = String((count ?? 0) + 1).padStart(3, '0')

  const safeName = opts?.name
    ? opts.name
        .replace(/[^\x00-\x7F]/g, '')   // strip non-ASCII (CJK, accented chars)
        .replace(/[^a-zA-Z0-9]/g, '')   // strip remaining special chars
    : ''
  const namePart = safeName ? `-${safeName}` : (opts?.name ? '-card' : '')
  const sidePart = opts?.side ? `-${opts.side}` : ''

  return `${datePrefix}_${hh}${min}${ss}-${serial}${namePart}${sidePart}.jpg`
}
