# myCRM — 交接文件（Handover）

> 產生時間：2026-07-11 · 對應版本：**v8.1.5**（已 commit `fdada11`、已 push）
> 給下一個 Claude Code session 快速接手用。先讀本檔，再讀 `CLAUDE.md`。

---

## 1. 現況（Where we are）

- **版本**：`package.json` = `8.1.5`，`main` 分支乾淨、已 push。發版通知（notify-release）已全數寄出。
- **主線狀態**：v8.0 AI 功能指派系統已出貨並演進至 v8.1.x 系列（見下方第 3 節）；v8.0 SaaS 多租戶化 Phase 0–2 + 3A 已完成、Phase 3 Batch B 起擱置中。
- **測試**：`npm run test`（vitest），核心 util 測試在 `src/lib/__tests__/`，目前 **84 條**。新增 util 記得補測。

### ⚠️ 環境關鍵事實（動手前必讀）

| 事項 | 內容 |
|---|---|
| **正式 DB** | Supabase ref = **`gaxjgcztzfxokesiraai`**。舊的 `zaqzqcvsckripotuujep` 已棄用但 MCP 仍看得到——**改 DB 前先確認 ref**。 |
| **middleware 檔名** | 是 `src/proxy.ts`，**不是** `middleware.ts`（Next.js 16 專案慣例）。 |
| **user 身分解析** | `auth.users.id ≠ public.users.id`，全系統靠 **email** 比對，勿改用 id。 |
| **users 欄位授權** | prod 對 `users` 做欄位級 SELECT GRANT（v7.2.8）——新增欄位要手動補 GRANT，前端禁 `select('*')`。 |
| **AI 模型解析** | 一律**組織指派**（`ai_feature_models` + `aiRouting.ts`）；個人模型選擇已於 v8.1.0 移除（`users.ai_model_id` 保留欄位但停止讀寫）。 |
| **使用者手冊在 DB** | 使用者看的手冊是 DB `docs_content`（`/docs` 頁，3 章 × 3 語 = 9 列）；repo `docs/webdocs/` 只是**來源**，改完要同步入庫並 **md5 逐列對帳**。詳下方第 4 節。 |
| **溝通語言** | 只用中文與英文，不用日文。 |
| **群發郵件** | 全體寄信需使用者明確授權；SendGrid 憑證只在 `~/.claude/notify-release.env`。docs-only commit 要 skip notify-release。 |

---

## 2. 已完成（v7.8.1 → v8.1.5，按主題歸納）

- **品質批次 / 測試基建**（v7.8.1、v7.9.5）：vitest + `npm run test` 落地；v7.8.0 的多代理 code-review 修復 15 項缺陷；停權即時踢 session（`is_suspended()` RPC + proxy gate）；用量預算門檻 UI（`/admin/health`）；稽核日誌動作標籤補齊；v7.7.2/v7.8.0 prod-only schema 全數回填 repo migrations。
- **電子報 follow-up 清倉**（v7.9.6）：A/B 模式 UI 入口（小樣本自動送贏家 / 全名單 50/50）、Hunter 停用提示、分析去重計數、總覽 DB 端聚合 RPC、`/api/me` 提速、批次上傳 i18n。
- **手冊全功能重寫 + 入庫**（v7.9.7、v7.9.8、v7.9.9）：`/docs` 三章 × 三語重寫並對照原始碼驗證；手冊唯一來源整併至 `docs/webdocs/`；GitBook Git Sync 已斷並清除殘留；電子報行內編輯器字體統一 + 回饋回報者確認制（回報者本人結案）。
- **v8.0.0 — AI 功能 × 端點/金鑰/模型指派系統**：新增路由層 `src/lib/aiRouting.ts`，8 個 AI 功能可各自指派端點/模型（新表 `ai_feature_models`）；`ai_endpoints.kind` 支援 `google`（Gemini SDK 直連）與 `openai`（任何 `/chat/completions` 相容服務，含地端）；`/admin/models` 測試按鈕（`POST /api/ai-test`）；9 個寫死模型觸點遷移至路由層。
- **v8.1.x 系列**：
  - v8.1.0 — 功能指派全開放（移除 Google-only 硬限制，OpenAI 相容端點走 `openaiAgent.ts` 工具迴圈）+ 「目前生效」透明化（`GET /api/ai-feature-assign`）+ **移除個人模型選擇**。
  - v8.1.1 — 中文/日文輸入法組字 Enter 選字誤送出修復（共用 `src/lib/imeGuard.ts`，全站 21 處輸入框）。
  - v8.1.2 — AI 助理網頁版對話持久化（新表 `ai_chat_sessions`，保留最近 40 則 + 清除對話）。
  - v8.1.3 — 聯絡人頁自動載回已存的會議前 Briefing（`GET /api/social-briefing/latest`）。
  - v8.1.4 — Vercel function 固定東京區 `hnd1`（與 Supabase ap-northeast-1 同區，消除跨太平洋延遲）。
  - v8.1.5 — v8 全面 code review 修正：水合競態（聊天/Briefing）、OpenAI 端點空回覆兜底、停用模型的管理頁誠實提示、手冊 `docs_content` 9 列自來源完整重同步（修復 07-11 凌晨被外部改寫）。

---

## 3. 未完成 / 擱置（Not done）

- **v8.0 SaaS 多租戶化 — Phase 3 Batch B 起擱置**（Po 2026-07-06 決策）：Phase 0–2 + 3A 已完成（v7.9.0–v7.9.4，行為等價基礎設施、單租戶零影響）。**擱置中的**：Task 183/184（`/onboarding` + 邀請流程 + org switcher、移除 `auth/callback` 網域強制/登入分流）與 Task 186（Azure AD 改 multi-tenant 或加開放 OAuth）。重啟時從 **`docs/PRD.md` 第四十六章**（v8.0 開發任務清單）接續。
- **相簿人臉辨識 worker 未做**：資料層已備妥，但推論**不能跑 Supabase Edge**（face-api 撞 160s 上限）——需 worker 容器基礎設施決策。見 memory `project_face_recognition_edge_infeasible.md`。
- **Live 實測待補**：v7.8.0/v7.9 系列部分功能需真人實測（清單在 repo 根 `UAT-v7.9.md`）。

---

## 4. 重要事實補充（給下一個 session）

- **手冊同步流程**：改 `docs/webdocs/` 後必須同步入 DB `docs_content`（9 列 = 3 章 × 3 語），並**逐列 md5 對帳**確認一致。⚠️ 2026-07-11 凌晨 `docs_content` 曾被外部自動化（疑 Po 其他帳號的 02:00 JST routine）改寫成精簡版、已於 v8.1.5 還原；再發生先查 Po 其他帳號排程。見 memory `project_docs_content_overwrite_incident.md`、`project_docs_live_in_db.md`。
- **AI 模型一律組織指派**：任何新增 AI 觸點都應走 `aiRouting.ts` 解析（功能指派 → 系統預設 env 通道），不要引入個人模型參數。
- **schema 進 repo**：自 v7.9.0 起 schema 改動一律進 `supabase/migrations/`（早期 v7.7.2/v7.8.0 的 prod-only schema 已於 v7.9.5 回填，migrations 可完整重放）。

---

## 5. 給下一個 session 的一段話（可直接貼）

> 接手 myCRM（Next.js 16 / Supabase / Telegram Bot CRM）。目前在 `main` 的 **v8.1.5**（commit `fdada11`，已 push，發版通知已寄）。近期主線是 **AI 功能指派系統**（v8.0.0 起，路由層 `src/lib/aiRouting.ts` + 表 `ai_feature_models`，v8.1.0 全開放並移除個人模型選擇——AI 模型一律**組織指派**）與其後的 v8.1.x 修補（IME Enter、chat 持久化、Briefing 載回、東京區、v8 全面 review）。**動手前務必記住**：正式 DB ref 是 `gaxjgcztzfxokesiraai`（別碰 `zaqzqcvsckripotuujep`）；middleware 是 `src/proxy.ts`；使用者一律用 **email** 解析（`auth.users.id ≠ public.users.id`）；改 `users` 欄位要手動補 SELECT GRANT、前端禁 `select('*')`；使用者手冊在 DB `docs_content`（`/docs`，3 章 × 3 語），改 `docs/webdocs/` 後要同步入庫並 **md5 逐列對帳**；跑測試 `npm run test`（vitest，`src/lib/__tests__`，84 條）；只用中文溝通；全體寄信需明確授權。**擱置中的主線**：v8.0 多租戶 Phase 3 Batch B（Task 183/184）與 Task 186（Po 2026-07-06 決策），重啟從 `docs/PRD.md` 第四十六章接續；相簿人臉辨識 worker 仍待容器基礎設施。完整交接細節見本檔。
