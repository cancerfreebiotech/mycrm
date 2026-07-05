import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase'
import { ORG_TABLES } from '@/lib/orgTables'

/**
 * v8.0 多租戶化 — org 情境解析與 org-scoped 資料存取（Phase 1 生效）
 *
 * ## 路線圖
 * - **Phase 0（已完成，2026-07-05）**：DB 基礎設施——organizations/
 *   organization_members/organization_invites、43 張業務表 org_id（nullable、
 *   FK、DEFAULT = default org）、複合唯一索引並存。migration 見 supabase/migrations/。
 * - **Phase 1（本階段）**：`orgScopedClient()` 對業務表自動注入 `.eq('org_id')`
 *   過濾與 insert org_id——「忘記過濾」從預設不安全變預設安全；全部 API route
 *   遷移至 `getOrgContext()`／`systemOrgContext()` + `orgScopedClient()`；
 *   `active_org_id` cookie 讀取（驗 membership，防偽造）；Auth Hook 函式已建
 *   （enable 待 Phase 2 前於 dashboard 開啟）。
 * - **Phase 2**：`org_id` SET NOT NULL；RLS 依 `current_org_id()` 重寫；程式碼
 *   onConflict 改帶 org_id 後 DROP 單欄 UNIQUE；Storage 加 {org_id}/ 前綴。
 * - **Phase 3**：開放 onboarding／org switcher（寫 active_org_id cookie）。
 *   ⚠️ 開放前必須 DROP 業務表的 org_id DEFAULT（屆時由本模組顯式注入）。
 *
 * ## 身分慣例
 * 本專案 `auth.users.id` ≠ `public.users.id`，一律以 **email** 解析 `public.users`。
 */

/** Default org（CancerFree）。Phase 0/1 所有現有資料都歸屬於此 org。 */
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
 * 共用 lib 的最小資料存取介面。
 *
 * `orgScopedClient()` 的回傳值與裸 `SupabaseClient` **都滿足**此介面——共用
 * lib 的 client 參數請宣告為 `OrgDb`（而非 SupabaseClient），呼叫端即可傳入
 * 兩者之一、逐步遷移互不阻塞。需要 storage/auth 的 lib 保持 SupabaseClient
 * 參數並列入 lint 允許清單（Phase 2 隨 Storage 隔離處理）。
 */
export interface OrgDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

/**
 * 解析目前請求的 org 情境（有使用者 session 的 route 用這個）。
 *
 * 流程：anon client 的 session → email → service client 以 email 查
 * `public.users.id` → `active_org_id` cookie 存在則驗 membership（防偽造，
 * 驗不過視同不存在）→ 否則取第一筆 active membership。
 *
 * **絕不 throw**：無 session、無 user、無 membership 或任何解析失敗，一律回
 * `DEFAULT_ORG_ID` + null。存取控制不是本函式的職責——各 route 既有的
 * auth / checkPermission 檢查照舊負責 401/403。
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

    const userId: string | null = profile?.id ?? null
    if (!userId) {
      return { orgId: DEFAULT_ORG_ID, userId: null, email }
    }

    // active_org_id cookie（Phase 3 的 org switcher 寫入；未設定時為 null）
    let requestedOrgId: string | null = null
    try {
      const cookieStore = await cookies()
      requestedOrgId = cookieStore.get('active_org_id')?.value ?? null
    } catch {
      // 非 request scope（如背景工作）讀不到 cookies —— 略過
    }

    if (requestedOrgId) {
      const { data: requested } = await service
        .from('organization_members')
        .select('org_id')
        .eq('user_id', userId)
        .eq('org_id', requestedOrgId)
        .eq('status', 'active')
        .maybeSingle()
      // 驗不過（偽造/過期 cookie）→ fall through 用第一筆 membership
      if (requested) return { orgId: requested.org_id as string, userId, email }
    }

    const { data: membership } = await service
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle()

    return {
      orgId: (membership?.org_id as string | undefined) ?? DEFAULT_ORG_ID,
      userId,
      email,
    }
  } catch {
    // 解析失敗退回 default org——單租戶期間行為不變。
    return { orgId: DEFAULT_ORG_ID, userId: null, email: null }
  }
}

/**
 * 系統行為者（cron / webhook / bot / MCP）用的 org 情境。
 *
 * Phase 1 單租戶：預設 default org。呼叫端若能從資料本身解析 org（如
 * bot_sessions.org_id、agent_tokens.org_id），應傳入該值。
 * Phase 2+：cron 逐 org 迭代、webhook 由 payload 對應列解析 org。
 */
export function systemOrgContext(orgId: string = DEFAULT_ORG_ID): OrgContext {
  return { orgId, userId: null, email: null }
}

type ServiceClient = ReturnType<typeof createServiceClient>

// 以 probe 推導各操作的 builder 型別（supabase-js 版本無關），每種只實例化一次：
// untyped schema 下 select 的 data 是 any[]（.single() 後為 any），call site 的
// .map 參數有 context type；同時避免 supabase-js 型別層的查詢字串解析器在上百個
// call site 逐一展開（實測會讓 tsc 4GB heap OOM）。
const selectProbe = () => createServiceClient().from('_').select()
const insertProbe = () => createServiceClient().from('_').insert({})
const upsertProbe = () => createServiceClient().from('_').upsert({})
const updateProbe = () => createServiceClient().from('_').update({})
const deleteProbe = () => createServiceClient().from('_').delete()
type SelectBuilder = ReturnType<typeof selectProbe>
type InsertBuilder = ReturnType<typeof insertProbe>
type UpsertBuilder = ReturnType<typeof upsertProbe>
type UpdateBuilder = ReturnType<typeof updateProbe>
type DeleteBuilder = ReturnType<typeof deleteProbe>

/**
 * `orgScopedClient().from()` 的統一回傳介面——業務表回包裝物件、全域表直通裸
 * builder，但兩者都以此介面呈現（單一型別，避免 union 簽名不可呼叫）。
 * select 保留可棄置的泛型參數，讓既有 `.select<T>(...)` call site 能編譯。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface OrgTableApi {
  select<T = unknown>(columns?: string, options?: { head?: boolean; count?: 'exact' | 'planned' | 'estimated' }): SelectBuilder
  insert(values: any, options?: any): InsertBuilder
  upsert(values: any, options?: any): UpsertBuilder
  update(values: any, options?: any): UpdateBuilder
  delete(options?: any): DeleteBuilder
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** insert/upsert 的列補上 org_id；呼叫端已明確給 org_id 時不覆寫。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withOrgId(values: any, orgId: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addTo = (row: any) =>
    row && typeof row === 'object' && !('org_id' in row) ? { ...row, org_id: orgId } : row
  return Array.isArray(values) ? values.map(addTo) : addTo(values)
}

/**
 * 取得綁定 org 情境的資料存取 client（Phase 1 起實際生效）。
 *
 * 對 {@link ORG_TABLES} 內的業務表：
 * - `select` / `update` / `delete` 自動追加 `.eq('org_id', ctx.orgId)`
 * - `insert` / `upsert` 自動為每列補 `org_id`（已明確提供者不覆寫）
 * 回傳的是底層 supabase builder，後續鏈式呼叫（`.eq()`、`.order()`、
 * `.select()`、`.single()`…）完全照常。
 *
 * 不在清單的表（全域表）原樣 pass-through。RPC 不做注入（隔離由函式本身
 * 負責，Phase 2 逐一審核）。storage / auth 請走 `.raw`——刻意命名讓
 * code review 一眼看到逃生口。
 */
export function orgScopedClient(ctx: OrgContext) {
  const service = createServiceClient()
  return {
    from(table: string): OrgTableApi {
      const builder = service.from(table)
      // 全域表直通：執行期就是裸 builder，僅以 OrgTableApi 介面呈現
      if (!ORG_TABLES.has(table)) return builder as unknown as OrgTableApi
      // 業務表：注入 org 過濾／org_id。執行期回傳的是底層 builder，鏈式呼叫照常。
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return {
        select: (columns?: string, options?: { head?: boolean; count?: 'exact' | 'planned' | 'estimated' }): SelectBuilder =>
          builder.select(columns, options).eq('org_id', ctx.orgId) as unknown as SelectBuilder,
        insert: (values: any, options?: any): InsertBuilder =>
          builder.insert(withOrgId(values, ctx.orgId), options) as unknown as InsertBuilder,
        upsert: (values: any, options?: any): UpsertBuilder =>
          builder.upsert(withOrgId(values, ctx.orgId), options) as unknown as UpsertBuilder,
        update: (values: any, options?: any): UpdateBuilder =>
          builder.update(values, options).eq('org_id', ctx.orgId) as unknown as UpdateBuilder,
        delete: (options?: any): DeleteBuilder =>
          builder.delete(options).eq('org_id', ctx.orgId) as unknown as DeleteBuilder,
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
    rpc: ((...args: Parameters<ServiceClient['rpc']>) => service.rpc(...args)) as ServiceClient['rpc'],
    /** 逃生口：storage / auth / 特殊操作需要裸 service client 時使用。 */
    raw: service,
  }
}

export type OrgScopedClient = ReturnType<typeof orgScopedClient>
