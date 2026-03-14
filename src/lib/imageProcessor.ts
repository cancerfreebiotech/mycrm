import sharp from 'sharp'
import { createServiceClient } from './supabase'

export async function processCardImage(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(1024, 1024, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()
}

// 命名規則：yymmdd_hhmmss-{流水號}.jpg
// 流水號每天從 001 開始，從 Supabase 查詢當天已存檔數量 +1
export async function generateCardFilename(): Promise<string> {
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

  return `${datePrefix}_${hh}${min}${ss}-${serial}.jpg`
}
