# myCRM — 交接文件（Handover）

> 產生時間：2026-07-20 · 對應版本：**v8.1.9**（commit `a884b2e`、已 push main、發版通知已寄）
> 給下一個 Claude Code session（可能在另一台機器）快速接手用。先讀本檔，再讀 `CLAUDE.md`。

---

## 1. 現況（Where we are）

- **版本**：`package.json` = `8.1.9`，`main` 分支乾淨、與 `origin/main` 同步。發版通知（notify-release）v8.1.6～v8.1.9 皆已寄出（17 位 MFA 使用者）。
- **主線狀態**：v8.0 AI 功能指派系統（v8.0.0 起）已出貨並演進至 v8.1.x 系列；緊接著做了**兩輪完整 codebase code review**（v8.1.5→v8.1.9，見第 2 節），把過去累積的安全/資料完整性問題大量清掉。v8.0 SaaS 多租戶化 Phase 0–2 + 3A 已完成、Phase 3 Batch B 起仍擱置。
- **測試**：`npm run test`（vitest），`src/lib/__tests__/`，目前 **89 條全綠**。`npx tsc --noEmit` 0 錯、`npm run build` 通過。

### ⚠️ 這台機器的特殊狀態（給「換機器」的下一個 session）

這台機器 **`.env.local` 只有 `RELEASE_NOTIFY_TOKEN` 一個變數**（沒有 Supabase / Gemini / SendGrid 等實際金鑰），也**沒有 `vercel link`**。過去所有工作都是「純改碼 + git + `npm run build`/`test`/`tsc`」完成的，這些指令不需要真正連線 prod。

若新機器要做以下事情，需先向 Po 要對應存取：
- **跑本地 dev server / 連 prod 資料**：需要完整 `.env.local`（對照 `.env.local.example` 補齊，或 `vercel env pull` ——但要先 `vercel link` 且帳號要有這個 Vercel 專案權限）。
- **用 Supabase MCP 查/改 prod DB**：MCP 預設 org 可能連不到正式專案（見下方 ref 說明）；曾發生「MCP 只看得到別的 Supabase 帳號下的 project」的狀況。
- **補寄 notify-release**：若 MCP 連不到 prod，有個已驗證可行的**備援路徑**——用 `.env.local` 裡的 `RELEASE_NOTIFY_TOKEN` 直接打 prod 部署好的端點 `POST https://crm.cancerfree.io/api/admin/notify-release`（`.claude/notify-release.config.json` 裡標記為 `legacyApiUrl`），body 帶 `{version, subject, bodyHtml, dryRun?}`，prod server 端自己查 MFA 收件人清單並用 SendGrid 寄出。**送真的之前務必先 `dryRun:true` 確認收件人清單筆數**（目前應為 17 人）。
- **雲端排程 code review（cloud routine / `/schedule`）**：目前建不起來——claude.ai 帳號尚未連接 GitHub、且 `cancerfreebiotech/mycrm` 沒裝 Claude GitHub App。要用的話先連 https://claude.ai/code/onboarding?magic=github-app-setup 。在此之前，全 codebase review 都是**本機跑一次**（用 `Workflow` 工具 fan-out，見第 2 節）。

| 事項 | 內容 |
|---|---|
| **正式 DB** | Supabase ref = **`gaxjgcztzfxokesiraai`**。舊的 `zaqzqcvsckripotuujep` 已棄用但 MCP 仍看得到——**改 DB 前先確認 ref**。 |
| **middleware 檔名** | 是 `src/proxy.ts`，**不是** `middleware.ts`（Next.js 16 專案慣例）。它是**全站唯一的 auth 閘門**：未登入導向 `/login`、強制 MFA、停權即時登出。只有明列前綴（`/api/bot`、`/api/teams-bot`、`/api/auth`、`/api/sendgrid`、`/api/set-locale`、`/api/admin/`、`/api/cron/`、`/api/hunter/cron`、`/api/mcp`、`/unsubscribe`、`/api/newsletter/unsubscribe`、`/email-optout`、`/api/email/optout`、`/api/newsletter/feed.xml`、`/newsletter/view/`）在 proxy 早退放行、需 route 自驗；其餘 route **只做到登入層級**，功能級授權（如 `newsletter`、`camcard` 等 granted_features）**必須在 route 內另外用 `hasFeature()` 檢查**——這是這兩輪 review 修最多的一類問題，別重蹈覆轍。 |
| **user 身分解析** | `auth.users.id ≠ public.users.id`，全系統靠 **email** 比對，勿改用 id。 |
| **users 欄位授權** | prod 對 `users` 做欄位級 SELECT GRANT（v7.2.8）——新增欄位要手動補 GRANT，前端禁 `select('*')`。 |
| **AI 模型解析** | 一律**組織指派**（`ai_feature_models` + `aiRouting.ts`）；個人模型選擇已於 v8.1.0 移除（`users.ai_model_id` 保留欄位但停止讀寫）。 |
| **OAuth token 加密** | Microsoft Graph 的 `provider_token`/`provider_refresh_token`、Gmail 的 token 皆以 AES-256-GCM 加密存放（`src/lib/tokenCrypto.ts`，key 來自 `NEXTAUTH_SECRET`）。新增任何存 token 的欄位都要走這個 helper，不可明文存。 |
| **使用者手冊在 DB** | 使用者看的手冊是 DB `docs_content`（`/docs` 頁，3 章 × 3 語 = 9 列）；repo `docs/webdocs/` 只是**來源**，改完要同步入庫並 **md5 逐列對帳**。 |
| **PostgREST `.or()` 注入** | 使用者輸入若直接插進 `.or()` 過濾字串，逗號/括號會破壞語法。統一用 `src/lib/likeEscape.ts` 的 `orQuote()`（+ 需要精確比對時搭配 `escapeLikePattern()`）。 |
| **併發寫入（read-modify-write）** | `bot_sessions.context`、`newsletter_drafts.photo_urls` 這類「讀→JS append→整包寫回」的欄位，Telegram 相簿/併發請求下會互相覆蓋遺失資料。已用**樂觀鎖 CAS**（`bot_sessions` 用 `updated_at` 比對、`photo_urls` 用陣列值本身比對，因為該表無版本欄位且 DDL 不在 repo）解決，見 `src/lib/draftPhotos.ts` 與 `bot/route.ts` 的 `mutateSessionContext()`。**新增任何類似欄位前，先想併發寫入問題。** |
| **溝通語言** | 只用中文與英文，不用日文。 |
| **群發郵件** | 全體寄信需使用者明確授權；SendGrid 憑證只在 `~/.claude/notify-release.env`（這是這台機器全域共用的，跟專案內 `.env.local` 是兩回事）。docs-only commit 要 skip notify-release。 |

---

## 2. 已完成（v7.8.1 → v8.1.9，按主題歸納）

- **品質批次 / 測試基建**（v7.8.1、v7.9.5）：vitest + `npm run test` 落地；停權即時踢 session；用量預算門檻 UI（`/admin/health`）；稽核日誌動作標籤補齊；prod-only schema 全數回填 repo migrations。
- **電子報 follow-up 清倉**（v7.9.6）：A/B 模式 UI 入口、Hunter 停用提示、分析去重計數、總覽 DB 端聚合 RPC、批次上傳 i18n。
- **手冊全功能重寫 + 入庫**（v7.9.7、v7.9.8、v7.9.9）：`/docs` 三章 × 三語重寫；手冊唯一來源整併至 `docs/webdocs/`；GitBook Git Sync 已斷；電子報行內編輯器字體統一 + 回饋回報者確認制。
- **v8.0.0 — AI 功能 × 端點/金鑰/模型指派系統**：路由層 `src/lib/aiRouting.ts`，8 個 AI 功能可各自指派端點/模型（`ai_feature_models` 表）；`ai_endpoints.kind` 支援 `google`（Gemini SDK 直連）與 `openai`（任何 `/chat/completions` 相容服務）；`/admin/models` 測試按鈕。
- **v8.1.0–v8.1.4**：功能指派全開放 + 移除個人模型選擇（v8.1.0）；IME Enter 選字誤送出全站修復（v8.1.1）；AI 助理對話持久化（v8.1.2，新表 `ai_chat_sessions`）；會議前 Briefing 自動載回（v8.1.3）；Vercel function 固定東京區 `hnd1`（v8.1.4）。
- **v8.1.5 — 第一輪全面 review**（針對 v8.0–v8.1.4 新功能範圍）：水合競態、OpenAI 端點空回覆兜底、停用模型管理頁誠實提示、手冊 9 列重同步。
- **v8.1.6～v8.1.9 — 兩輪完整 codebase code review（本次重點）**：
  - **v8.1.6**（437c4c3）：史上第一次**全 codebase**（非僅新功能）review，用多代理 workflow fan-out（finder→對抗式 verify）。修 20+ confirmed findings：newsletter 寄送等破壞性操作補功能授權閘門、`email/test-send` 冒名寄信、Gmail OAuth CSRF、`.or()` 逗號注入（新增 `orQuote()`）、平行分頁唯一次序鍵、電子報重送計數倒退、卡 `sending` 回收、任務摘要 500 筆截斷、suppression `.in()` 未分批、telegram dedup 誤判、i18n 三頁三語補齊。**Round-1 教訓**：曾誤報三個「camcard 匿名 PII 外洩」HIGH——實為 verifier 在缺少 `proxy.ts` 情境下誤判「專案無 middleware」，第二輪起把 proxy 放行清單餵給每個 verifier 才解決。
  - **v8.1.7**（017cd82）：v8.1.6 擱置的兩項安全修正——Microsoft Graph token 改加密儲存（沿用 `tokenCrypto`，`decryptToken` 相容舊明文列、免資料遷移）；bot `/p` 相簿並發競態（`mutateSessionContext()` CAS 重試）。
  - **v8.1.8**（b8fb135）：`/news` bot 收圖 + 網頁版草稿相片上傳的 `newsletter_drafts.photo_urls` 同型併發競態（新 `draftPhotos.ts`，陣列值 CAS）。
  - **v8.1.9**（a884b2e）：**第二輪**全 codebase review，這次刻意加重審視「上一輪自己新寫的程式碼」+ 對大型未動過頁面做 fresh 掃描。修 13 confirmed findings：camcard API 全系列補伺服器端 `hasFeature('camcard')` 授權（新 `src/lib/featureAccess.ts`——通用 feature 閘門 helper）、newsletter 活動明細 GET 補授權閘門、camcard confirm/merge 原子狀態認領防重複建聯絡人、電子報寄送 worker 每 chunk 送前即時重查防併發重寄、聯絡人合照改簽名 URL 修破圖、舊版名片旋轉鈕隱藏（避免必 404）、合併/待審搜尋注入防護+競態防護、多收件人寄信互動紀錄錯置修正、篩選/批次 i18n、bot 相簿計數顯示卡「1」修正。

---

## 3. 未完成 / 擱置（Not done）

- **v8.0 SaaS 多租戶化 — Phase 3 Batch B 起擱置**（Po 2026-07-06 決策）：Phase 0–2 + 3A 已完成（v7.9.0–v7.9.4）。**擱置中**：Task 183/184（`/onboarding` + 邀請流程 + org switcher、移除 `auth/callback` 網域強制/登入分流）與 Task 186（Azure AD 改 multi-tenant 或加開放 OAuth）。重啟從 **`docs/PRD.md` 第四十六章**接續。
- **相簿人臉辨識 worker 未做**：資料層已備妥，推論**不能跑 Supabase Edge**（face-api 撞 160s 上限）——需 worker 容器基礎設施決策。
- **電子報寄送 worker 的殘留 race window**：v8.1.9 的「每 chunk 送前即時重查」大幅縮小了併發重複寄信的機率，但重查與 insert 之間仍有極小視窗——要完全消除需要 `newsletter_recipients (campaign_id, lower(email))` 的 DB unique 約束（migration，未做）。
- **雲端排程 code review routine 建不起來**：見第 1 節「這台機器的特殊狀態」。
- **Live 實測待補**：`UAT.md`（v7.9.6 全功能版）、`UAT-v7.9.md`（v7.8.1→v7.9.6 delta）、`UAT-v8.md`（v8.0.0→v8.1.5 delta，7 章 28 項）——v8.1.6～v8.1.9 這輪修的都是後端邏輯/安全修正，尚無對應的人工 UAT 清單。

---

## 4. 重要事實補充

- **手冊同步流程**：改 `docs/webdocs/` 後必須同步入 DB `docs_content`（9 列 = 3 章 × 3 語），並**逐列 md5 對帳**。2026-07-11 凌晨曾被外部自動化改寫、已還原；再發生先查 Po 其他帳號排程。
- **AI 模型一律組織指派**：任何新增 AI 觸點都應走 `aiRouting.ts` 解析，不要引入個人模型參數。
- **schema 進 repo**：自 v7.9.0 起 schema 改動一律進 `supabase/migrations/`。**但注意**：像 `newsletter_drafts`、`camcard_pending` 這類更早期的表，其原始 DDL（欄位型別、是否有 `updated_at`）**不在 repo 裡**，這兩輪 review 修併發問題時因此無法用「加版本欄位」的正規解法，改用陣列值/既有欄位 CAS 繞過——若之後真的要動這些表的 schema，先跟 Po 確認實際欄位。
- **Code review 方法論（給下一輪用）**：用 `Workflow` 工具，分區 finder（model: opus）→ 每條 finding 對抗式 verify（model: opus，務必把 `proxy.ts` 放行清單餵進 verifier prompt，否則會出現「匿名可存取」的系統性誤報）；機械性/格式轉換階段用 `sonnet`；主 session 只做 triage + 修復 + 版本/文件收尾。兩輪下來合計抓到 30+ confirmed 安全與資料完整性問題，這個方法論值得繼續用在下一輪。

---

## 5. 給下一個 session 的一段話（可直接貼）

> 接手 myCRM（Next.js 16 / Supabase / Telegram Bot CRM，repo：`cancerfreebiotech/mycrm`）。目前在 `main` 的 **v8.1.9**（commit `a884b2e`，已 push，發版通知已寄）。近期主線：v8.0 起的 **AI 功能指派系統**（`src/lib/aiRouting.ts` + `ai_feature_models`，AI 模型一律組織指派），接著做了**兩輪完整 codebase code review**（v8.1.6/v8.1.9）大量修掉安全與資料完整性問題（功能授權閘門缺失、`.or()` 注入、併發寫入競態、token 明文儲存等）。
>
> **⚠️ 這台/上一台機器的 `.env.local` 只有 `RELEASE_NOTIFY_TOKEN`，沒有真正跑過本地 dev server**——如果你在新機器上要跑 `npm run dev` 或連 prod 資料，要先跟 Po 要完整環境變數（對照 `.env.local.example`）或設定 `vercel link` + `vercel env pull`。
>
> **動手前務必記住**：正式 DB ref 是 `gaxjgcztzfxokesiraai`；middleware 是 `src/proxy.ts`（全站只做登入層級 auth，**功能級授權要在 route 內另外查 `hasFeature()`**，這是兩輪 review 修最多的一類 bug）；使用者一律用 **email** 解析；改 `users` 欄位要手動補 SELECT GRANT、前端禁 `select('*')`；OAuth token 一律用 `tokenCrypto.ts` 加密存放；任何「讀→JS append→整包寫回」的欄位都要考慮併發競態（參考 `mutateSessionContext()`/`draftPhotos.ts` 的 CAS 寫法）；PostgREST `.or()` 一律用 `orQuote()` 跳脫；使用者手冊在 DB `docs_content`，改 `docs/webdocs/` 後要同步入庫並 md5 逐列對帳；跑測試 `npm run test`（vitest，89 條）；只用中文溝通；全體寄信需明確授權（備援寄送路徑見第 1 節）。
>
> **擱置中**：v8.0 多租戶 Phase 3 Batch B / Task 186（見第 3 節，重啟從 PRD 第四十六章）；相簿人臉辨識 worker（待容器基礎設施）；雲端排程 review routine（待連 GitHub）；電子報 worker 極小 race window（待 DB unique 約束 migration）。完整細節見本檔第 2、3 節。
