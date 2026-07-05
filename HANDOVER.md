# myCRM — 交接文件（Handover）

> 產生時間：2026-07-05 · 對應版本：**v7.8.0**（已 commit `9292846`）
> 給下一個 Claude Code session 快速接手用。先讀本檔，再讀 `CLAUDE.md` 與 `AUDIT-2026-07-04.md`。

---

## 1. 現況（Where we are）

- **版本**：`package.json` = `7.8.0`，已 commit（`9292846 feat(...): 稽核 backlog 22 項功能全數實裝 v7.8.0`），已 push、已寄發版通知給全體 17 人。
- **v7.8.0 內容**：`AUDIT-2026-07-04.md` 的 28 項功能建議中 → **25 項實裝、1 項確認已存在、2 項誤報不做**。細節見 `docs/CHANGELOG.md` 最上方。
- **工作區狀態**：有 **21 個未 commit 的 docs 檔案**（v7.8.0 的使用手冊更新，zh-TW/en/ja 三語），內容已完成、已核對過原始碼，只差 commit。清單見下方第 2 節。

### ⚠️ 環境關鍵事實（動手前必讀）

| 事項 | 內容 |
|---|---|
| **正式 DB** | Supabase ref = **`gaxjgcztzfxokesiraai`**。舊的 `zaqzqcvsckripotuujep` 已棄用但 MCP 仍看得到——**改 DB 前先確認 ref**。 |
| **v7.8.0 schema 是 prod-only** | 以下改動只用 `execute_sql` 打在正式 DB，**沒進 repo 的 migrations**：`bot_errors` 表；`contact_briefings` += `notify_user_id`、`outcome_prompted_at`；`newsletter_campaigns` += `ab_test_pct`、`ab_wait_minutes`、`ab_winner`、`ab_decided_at`；`newsletter_recipients` += `error`。另 v7.7.2 的 `protect_super_admin()` trigger 也是 prod-only。 |
| **middleware 檔名** | 是 `src/proxy.ts`，**不是** `middleware.ts`（Next.js 16 專案慣例）。 |
| **user 身分解析** | `auth.users.id ≠ public.users.id`，全系統靠 **email** 比對，勿改用 id。 |
| **users 欄位授權** | prod 對 `users` 做欄位級 SELECT GRANT（v7.2.8）——新增欄位要手動補 GRANT，前端禁 `select('*')`。 |
| **溝通語言** | 只用中文與英文，不用日文。 |
| **群發郵件** | 全體寄信需使用者明確授權；SendGrid 憑證只在 `~/.claude/notify-release.env`。 |
| **notify-release** | docs-only 的 commit 要 **skip** 發版通知。 |

---

## 2. 還沒做的（Not done）

### A. 待 commit — v7.8.0 文件更新（唯一的立即工作）
21 個檔案在工作區未 commit，全部是 v7.8.0 功能的使用手冊，三語同步、已核對原始碼：

- `docs/bot/commands.{md,en,ja}` — `/v` 一句話拜訪
- `docs/features/tasks.{md,en,ja}` — 摘要按鈕（完成/+1天）+ 今日會議
- `docs/features/social-briefing.{md,en,ja}` — Telegram 推播 + 會後提示
- `docs/features/newsletter-campaigns.{md,en,ja}` — A/B holdout 改寫 + UTM + 失敗明細 + 逐名單退訂 + 總覽儀表板
- `docs/admin/users.{md,en,ja}` — 停用/離職
- `docs/admin/index.{md,en,ja}` — 新增的 super_admin 頁面
- `docs/getting-started/first-login.{md,en,ja}` — 導覽列新增項

> `docs/admin/duplicates.md` 的「AI 建議合併」已在文件內（line 46），此缺口已補。
> 建議：以 **docs commit** 送出（版本可不動或 v7.8.1 docs），**skip notify-release**。

### B. Bug 檢查沒有有效完成 ⚠️
針對 v7.8.0 的 code-review workflow **8 個 finder agent 有 7 個因「monthly spend limit」失敗**，結果雖顯示「無 findings」但**無效**（finder 根本沒跑）。下一個 session 需要：spend limit 恢復後重跑 `Workflow({ name: "code-review", args: "xhigh HEAD~1..HEAD --effort high" })`，或做一次 inline 人工 review。**目前 v7.8.0 尚未經過可信的 bug 審查。**

### C. v7.8.0 小 follow-up（低優先）
- **CAN-SPAM 地址寫死**在 `docs/newsletter-templates/skeleton-*.html`，接不到 org-settings。
- **usage_limit UI**：預算門檻目前只能寫 `system_settings`，沒有設定畫面（告警邏輯已在 `health-watchdog`）。
- **A/B legacy 50/50 toggle**：舊的整份 50/50 模式沒有明確切換入口（新的是小樣本+自動送贏家）。
- **停用帳號的 session 撤銷**：`suspend` 會擋下次登入，但不會即時踢掉現有 session。

### D. v7.8.0 待 live 驗證（memory 既有）
- `/v` 一句話拜訪、任務摘要按鈕（`trdone_`/`trsnooze_`）需 live bot 驗證。
- A/B holdout 在第一次真實活動時觀察 winner 是否自動送出。

---

## 3. 接下來的 Roadmap

### 🎯 主線：v8.0 — SaaS 多租戶化
把 myCRM 從「cancerfree.io 單租戶」改為「可賣的多租戶 SaaS」。模型：**Shared DB + `org_id` + RLS（單一 Supabase project）**。完整規格在 `docs/PRD.md`「四十四～四十六章」。分階段（每階段結束系統仍可正常運作）：

- ✅ **Phase 0 — 基礎設施** Task 171-175：**已完成（2026-07-05，v7.9.0）**。43 張業務表已有 `org_id`（nullable + FK + DEFAULT=default org）、`organization_invites` 已建、`granted_features` 已複製到 members、11 個複合唯一索引與既有 UNIQUE 並存。migration 檔在 `supabase/migrations/`（自此 schema 改動進 repo）。細節與實作差異見 PRD 四十六章 Phase 0 註記。
- **Phase 1 — API 層 org 注入（隔離主防線）** Task 176-179：Auth Hook 注入 org_id claim + `active_org_id` cookie；**81 個 route** 逐批導入 `getOrgContext()` + `.eq('org_id')`；CI lint 禁裸 `createServiceClient()`；bot 加 org 綁定。
- **Phase 2 — 收緊 + RLS/Storage** Task 180-182：`org_id` SET NOT NULL；重寫 `rls_security.sql`（`current_org_id()`/`is_org_member()`）；Storage 加 `{org_id}/` 前綴、轉 private + signed URL。
- **Phase 3 — Onboarding/Auth 開放** Task 183-186：移除 `auth/callback` 網域強制、登入分流；`/onboarding` + 邀請流程 + org switcher；26 處 hardcode 搬到 `organizations.settings`；Azure AD 改 multi-tenant 或加開放 OAuth。
- ~~**Phase 4 — 計費/Quota** Task 187-190~~：**已自 roadmap 移除（2026-07-05 決策，目前不做）**，規格保留於 PRD 45.6。

> 注意：v7.7.0 已鋪了一部分多租戶鷹架與組織設定頁，動 v8.0 前先確認現況與 PRD 對齊。

### 其他 roadmap
- **v7.1 P2 相簿人臉辨識**：資料層已備妥，但推論**不能跑 Supabase Edge**（face-api 撞 160s 上限）——未來改用 worker 容器。見 memory `project_face_recognition_edge_infeasible.md`。

---

## 4. 給下一個 session 的一段話（可直接貼）

> 接手 myCRM（Next.js 16 / Supabase / Telegram Bot CRM）。目前在 `main` 的 **v7.8.0**（commit `9292846`，已 push）：`AUDIT-2026-07-04.md` 的功能 backlog 已全數處理（25 實裝 / 1 已存在 / 2 誤報）。**先做這兩件事**：(1) 工作區有 21 個未 commit 的 v7.8.0 文件更新（三語，已核對原始碼），請以一個 docs commit 送出並 **skip notify-release**；(2) v7.8.0 的 bug review 之前因額度上限失敗、**尚未有效完成**，請重跑 `Workflow({ name: "code-review", args: "xhigh HEAD~1..HEAD --effort high" })` 或做一次 inline review。**動手前務必記住**：正式 DB ref 是 `gaxjgcztzfxokesiraai`（別碰 `zaqzqcvsckripotuujep`）；v7.8.0 的 schema 改動是 **prod-only、沒進 repo migrations**（`bot_errors` 表、`contact_briefings`/`newsletter_campaigns`/`newsletter_recipients` 的新欄位、`protect_super_admin` trigger）；middleware 是 `src/proxy.ts`；使用者一律用 **email** 解析（`auth.users.id ≠ public.users.id`）；改 `users` 欄位要手動補 SELECT GRANT；只用中文溝通；全體寄信需明確授權。**接下來的主線是 v8.0 SaaS 多租戶化**（`org_id` + RLS，Phase 0-4，規格在 `docs/PRD.md` 四十四～四十六章）。完整交接細節見 `HANDOVER.md`。
