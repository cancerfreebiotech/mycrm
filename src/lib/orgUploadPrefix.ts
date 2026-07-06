// v8.0 Task 182 — Storage org 隔離（client 端）。
//
// 新上傳的物件 key 一律前置 `${orgId}/`（storage RLS 以第一段路徑驗 org）。
// org_id 由 /api/me（service role、email 解析）提供。既有物件的讀取／刪除／
// rotate 沿用 DB 存的 path/URL，不受影響（舊 path 會被 grandfather）。

/**
 * 取得目前登入者所屬 org 的 id。取不到（未登入 / 網路失敗 / route 未回）時回
 * null，呼叫端應退回無前綴路徑——上傳不能因此壞掉。
 */
export async function fetchOrgId(): Promise<string | null> {
  try {
    const res = await fetch('/api/me')
    if (!res.ok) return null
    const data = (await res.json()) as { org_id?: string | null }
    return data.org_id ?? null
  } catch {
    return null
  }
}

/**
 * 以 orgId 前置 storage 物件 key。orgId 為 null（取得失敗）時原樣回傳 path，
 * 維持無前綴上傳（單租戶行為等價）。
 */
export function withOrgPrefix(orgId: string | null, path: string): string {
  return orgId ? `${orgId}/${path}` : path
}
