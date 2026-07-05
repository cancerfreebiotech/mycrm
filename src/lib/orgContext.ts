import { createClient, createServiceClient } from '@/lib/supabase'

/**
 * v8.0 多租戶化 — org 情境解析（Phase 0 鷹架）
 *
 * ## 路線圖
 * - **Phase 0（已完成，2026-07-05 收尾）**：零行為改變。DB 已有 `organizations`/
 *   `organization_members`/`organization_invites`（全員已入籍 default org）；
 *   43 張業務表已加 nullable `org_id`（FK、DEFAULT = default org，既有列已
 *   backfill）；複合唯一索引 (org_id, x) 與既有 UNIQUE 並存。本模組仍是鷹架：
 *   `orgScopedClient()` pass-through、`getOrgContext()` 永不 throw——用途是
 *   「準備」，不是「攔截」。既有 route 完全不動。migration 見 supabase/migrations/。
 * - **Phase 1（下一步）**：`orgScopedClient()` 在此注入 `.eq('org_id')` 過濾與
 *   insert 帶 org_id，讓「忘記過濾」從預設不安全變預設安全；route 逐一遷移到
 *   `getOrgContext()` + `orgScopedClient()`；Auth Hook 注入 org_id claim。
 * - **Phase 2**：`org_id` SET NOT NULL；RLS 依 `current_org_id()` 重寫（縱深
 *   防禦、支援前端直連）；程式碼 onConflict 改帶 org_id 後 DROP 單欄 UNIQUE；
 *   支援 org switcher / 多 org membership。⚠️ Phase 3 開放 onboarding 前必須
 *   DROP 業務表的 org_id DEFAULT（屆時由本模組顯式注入）。
 *
 * ## 身分慣例
 * 本專案 `auth.users.id` ≠ `public.users.id`，一律以 **email** 解析 `public.users`。
 */

/** Default org（CancerFree）。Phase 0 所有現有資料都歸屬於此 org。 */
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001'

export interface OrgContext {
  /** 目前請求所屬 org。無 session / 無 membership 時為 {@link DEFAULT_ORG_ID}。 */
  orgId: string
  /** `public.users.id`（以 email 解析）。無 session 時為 null。 */
  userId: string | null
  /** 登入者 email。無 session 時為 null。 */
  email: string | null
}

/**
 * 解析目前請求的 org 情境。
 *
 * 流程：`createClient()` 的 session → email → service client 以 email 查
 * `public.users.id` → 查 `organization_members` 取 `org_id`（Phase 0 每人只有一個
 * org，取第一筆 active membership）。
 *
 * **絕不 throw**：無 session、無 user、無 membership 或任何解析失敗，一律回
 * `DEFAULT_ORG_ID` + null，讓呼叫端在 Phase 0 維持既有行為。
 */
export async function getOrgContext(): Promise<OrgContext> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const email = user?.email ?? null
    if (!email) {
      return { orgId: DEFAULT_ORG_ID, userId: null, email: null }
    }

    const service = createServiceClient()

    // auth.users.id ≠ public.users.id → 一律 email 解析
    const { data: profile } = await service
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    const userId = profile?.id ?? null
    if (!userId) {
      return { orgId: DEFAULT_ORG_ID, userId: null, email }
    }

    // Phase 0：每人只有一個 org，取第一筆 active membership
    const { data: membership } = await service
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    return {
      orgId: membership?.org_id ?? DEFAULT_ORG_ID,
      userId,
      email,
    }
  } catch {
    // Phase 0 的用途是「準備」不是「攔截」——任何失敗都退回 default org。
    return { orgId: DEFAULT_ORG_ID, userId: null, email: null }
  }
}

/**
 * 取得綁定 org 情境的資料庫 client。
 *
 * **Phase 0：純 pass-through**，直接回 {@link createServiceClient}()，不做任何
 * org 過濾——因為業務表尚未有 `org_id` 欄位。此函式先存在，是為了讓新 route
 * 從今天起就寫成 `orgScopedClient(ctx).from(...)` 的形狀。
 *
 * **Phase 1**：本函式會改為在每個 `.from(table)` 上自動注入
 * `.eq('org_id', ctx.orgId)`（讀）與 org_id default（寫），使 org 隔離成為預設行為。
 * 屆時 `ctx` 參數即被使用；現在保留於簽名中以固定介面。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function orgScopedClient(ctx: OrgContext): ReturnType<typeof createServiceClient> {
  return createServiceClient()
}
