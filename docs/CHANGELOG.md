# CHANGELOG

## v7.0.8 — docs(prd): SaaS 多租戶化 + 相簿人臉辨識 + Social Briefing/AI Chatbot 規格（2026-06-11）

### 變更項目
- `docs/PRD.md` 新增 7 個章節（四十四～五十），規劃將 myCRM 從單租戶轉為可賣給其他新創的多租戶 SaaS，並新增兩個功能：
  - **產品化缺口盤點**：多租戶缺口、API 全用 service role 繞過 RLS、約 23–26 處 hardcode、零計費
  - **v8.0 SaaS 多租戶化**：Shared DB + `org_id` + RLS、`getOrgContext`/`orgScopedClient` 雙層隔離、Stripe 計費、Phase 0–4 roadmap + 風險清單
  - **v7.1 相簿照片多對多 + AI 人臉辨識**：`photo_faces` 多對多、`face_embeddings`（pgvector）跨照片比對、生物辨識合規（GDPR Art.9 / BIPA）
  - **v7.2 Social Briefing + AI Chatbot**：OSINT + 合規混合資料源、複用 MCP 工具的 Claude chatbot
- 純文件變更，無程式碼改動

## v7.0.7 — feat(bot): 名片重複偵測卡片加「查看既有聯絡人」連結（2026-06-10）

### 變更項目
- Telegram bot 拍名片偵測到 email/姓名已存在時，重複卡片（Create new / Add to / Update / Discard）多一個 **🔗 查看「{name}」** URL 按鈕 → 直接開既有聯絡人頁面，先判斷再決定要建新 / 合併 / 換工作
- 三語（zh-TW / en / ja）新增 `btnViewExisting`

## v7.0.6 — feat(pending): 待辨識頁的合併建議加「查看這筆 ↗」開新頁連結（2026-06-06）

### 變更項目
- `/contacts/pending` 偵測到可能重複、建議合併時，合併按鈕旁加「查看這筆 ↗」連結 → 開新分頁到那筆既有聯絡人，先判斷再決定合併
- 手動合併搜尋結果每一筆也加 ↗ 開新頁連結（不會誤觸合併）

## v7.0.5 — fix(newsletter): 寄送 interaction_logs 整批失敗（6 月日文電子報 0 筆紀錄）（2026-06-06）

### 根本原因
- 6 月日文電子報寄出 923 封但 0 筆 interaction_log（中文 2313 筆正常）
- `interaction_logs` 的 per-row trigger `update_contact_last_activity` 在寫 log 後會 `UPDATE contacts`，該 UPDATE 會重新檢查 `contacts_has_name`（`COALESCE(name,name_en,name_local) IS NOT NULL`，NOT VALID）
- 日文名單裡有 1 個「只掃到公司、沒人名」的聯絡人（Konsaru Tengu，3 名欄全空）→ trigger 的 UPDATE 違反約束 → 整批 923 列 insert 被 rollback
- send route 把這個錯誤吞掉（只放進 HTTP 回應、沒 console、沒持久化），加上 runtime log 過期，所以一直查不到

### 變更項目
- **修資料**：3 個全空名字的聯絡人（都是 camcard 只掃到公司的）`name` 補成公司名 → 通過約束
- **補回紀錄**：日文 campaign 的 923 筆 interaction_logs 已從名單成員重建（內容 / 時間 / send_method 與正常寄送一致）
- **強化 send route**：log insert 改 200 列小批次（一列出錯只影響該批、不再整批全失）、失敗時 `console.error`（進 runtime log）、補 `export const maxDuration = 300`

## v7.0.4 — fix(ui): 名單詳細頁 header 手機版標題與按鈕重疊（2026-06-02）

### 變更項目
- `/admin/newsletter/lists/[id]` header 原本 `flex items-center` 不換行，長名單名（如 2026-06-JP-Newsletter）在手機上換行撐高、跟「同步 SendGrid / 新增」按鈕重疊
- 改成 `flex-col`（手機直向堆疊）→ `sm:flex-row`（桌機橫向）；標題區 `flex-1 min-w-0 break-words`、按鈕區 `shrink-0`，按鈕加 `min-h-[44px]`（觸控目標達標）

## v7.0.3 — fix(sendgrid): suppression 同步 upsert 撞重複 email 整批失敗（2026-06-02）

### 變更項目
- SendGrid suppression 清單偶爾同一 email 出現兩次，`upsert(..., onConflict: 'email')` 一次不能對同個 key 動兩次 → 整批失敗（blocks 這次就因此 0 筆、報 "ON CONFLICT DO UPDATE command cannot affect row a second time"）
- 所有 upsert（bounces / invalid / unsub / blocks / spam）前先 `dedupeByEmail` 去重

## v7.0.2 — fix(ui): 後台表格手機版被裁切看不到（2026-06-02）

### 變更項目
- `/admin/newsletter/campaigns` 與 `/admin/mcp-activity` 的表格容器只有 `overflow-hidden`、沒有 `overflow-x-auto` → 手機上超出畫面的欄位被裁掉、無法橫向捲動（違反 CLAUDE.md「表格手機版可橫向捲動」）。補上 `overflow-x-auto`
- 4 個後台表格（campaigns / mcp-activity / mcp-tokens / lists 詳細）的 `<table>` 加 `min-w`，避免 `w-full` 在窄螢幕把欄位壓扁糊在一起；現在會保持可讀寬度並橫向捲動

## v7.0.1 — feat(newsletter): 開信 / 點擊追蹤 + suppression sync 補 blocks / spam（2026-06-02）

### 變更項目
**開信 / 點擊追蹤（之前完全沒接起來）**
- 寄送電子報時，每個收件人建立 `newsletter_recipients` 列、把列 id 當 `X-Recipient-Id` 傳給 SendGrid、並強制開啟 open/click tracking
- SendGrid Event Webhook（早已設定指向 `/api/sendgrid/webhook`、open/click 已開）收到事件後寫回 `opened_at` / `clicked_at`
- `/admin/newsletter/campaigns` 列表「成效」欄顯示每封：📤 寄出 · 👁 開信(率) · 🔗 點擊
- 新 SECURITY DEFINER 函式 `get_campaign_engagement()` 給前端拿聚合數字（`newsletter_recipients` 有 RLS、前端不能直接讀）
- ⚠️ 只對「修好之後寄的」電子報有效；過去寄的沒帶 recipient id，SendGrid 開信事件對不到，無法回填

**Suppression 同步補兩類**
- `/api/sendgrid/import-suppressions` 加 `/suppression/blocks`（→ `recipient_blocked`）+ `/suppression/spam_reports`（→ 新 status `spam_report` + 寫進 `newsletter_unsubscribes` 確保停寄）
- list 詳細頁認得 `spam_report`（歸「退信」群、status badge 顯示「垃圾檢舉」）

### 版本
- v7.0.0 → v7.0.1（PATCH — 都在既有頁面加東西、後端同步擴充，無新頁面）

## v7.0.0 — feat(mcp): MCP v2 — per-agent tokens + 4 個寫入工具 + 權限範圍 + 完整歸屬（2026-06-01）

### 重點
MCP 從「單一共享 token、只能讀」升級成「每個 agent 一把 token、可分權限、能寫 CRM、完整追蹤誰做了什麼」。

### 變更項目
- **Per-agent token 系統**：新表 `agent_tokens`（name / description / assigned_to / token_hash / scopes / expires_at / disabled）。取代 v1 單一 `MCP_AGENT_TOKEN` env var（env 仍保留當 read-only fallback）
- **6 個權限範圍 (scopes)**：`read:contacts` / `read:newsletter` / `read:tags` / `write:contacts` / `write:notes` / `write:newsletter`。每個 tool 宣告需要的 scope，token 沒有就擋
- **4 個新寫入工具**：
  - `update_contact(id, patch)` — 白名單欄位（描述性 / 關係欄位可改，email / email_status / opt_out / 刪除 / 系統欄位禁止）
  - `add_contact_note(contact_id, body, meeting_date?)`
  - `add_to_newsletter_list(list_id, email, ...)`
  - `tag_contact(contact_id, tag_id, add|remove)`
- **動態身份 `X-Acting-User` header**：每次呼叫宣告「現在誰在用」，寫入時 `created_by` 掛在這人名下。寫入工具強制要這個 header；讀取工具可省
- **完整歸屬追蹤**：4 張可寫表加 `via_mcp` 旗標、contacts 加 `last_updated_at/by/via_mcp`、`agent_actions` 加 `token_id` + `acting_as`
- **Rate limit**：每 token 120 req/min（數 agent_actions 實作）
- **新後台頁 `/admin/mcp-tokens`**（super_admin only）：發 token（含 scope 超過使用者權限的警告 + 明文只顯示一次）、列表、停用 / 啟用 / 刪除、連到該 token 的活動
- **`/admin/mcp-activity` 強化**：加「Token / 身份」欄位 + 支援 `?token_id=` filter
- SQL 紀錄 `supabase/mcp_v2_agent_tokens.sql`；設計文件 `docs/mcp-v2-plan.md`

### 版本進位
- v6.9.1 → v7.0.0（新 surface `/admin/mcp-tokens` 屬 MINOR，但 6.9 進 MINOR 會變兩位數 → 依規則帶動 MAJOR 歸零）

### 安全強化（多 agent adversarial review 後修補）
- **X-Acting-User 預設綁 assigned_to**：防止 token 把寫入偽造掛在他人（含 super_admin）名下；共用 bot 要明確開 `allow_any_actor`
- env token 比較改 timing-safe、`search_contacts` escape 逗號防 PostgREST filter 注入、email regex 收緊、`update_contact` patch 加大小限制（防 DoS）、`add_to_newsletter_list`/`tag_contact` 補 row-level 歸屬
- 兩個 race condition（rate-limit TOCTOU、停用後 in-flight）延 v2.1，正解需 atomic store

### 部署需要的動作
- v1 的 `MCP_AGENT_TOKEN` env 可留可不留（只影響 read fallback）
- 實際用：進 `/admin/mcp-tokens` 發一把 token → agent 帶 `Authorization: Bearer <token>` + 寫入時加 `X-Acting-User: <email>`（預設必須等於 assignee）

## v6.9.1 — feat(mcp): admin 後台「MCP 活動紀錄」viewer（2026-06-01）

### 變更項目
- 新增 `/admin/mcp-activity` 後台頁面（super_admin 限定），列出 `agent_actions` 最近 100 筆 — 包含時間、工具名、成功/失敗、IP hash、參數 / 錯誤訊息（可展開看 JSON）
- 上方 3 張統計卡：總計 / 成功 / 失敗
- Filter：依工具名、依狀態（全部 / 成功 / 失敗）
- Sidebar `superAdminItems` 加「MCP 活動」連結

## v6.9.0 — feat(mcp): 新增 /api/mcp MCP server endpoint，外部 Claude agent 可查 CRM（2026-06-01）

### 變更項目
- 新增 `POST /api/mcp` Model Context Protocol JSON-RPC endpoint，外部 Claude agent / 其他 MCP client 接上後可以查 mycrm 資料
- 5 個 read-only tools：
  - `search_contacts(query, limit?)` — 多欄位 substring 搜聯絡人
  - `get_contact(id)` — 完整聯絡人 + tags + 5 筆最近 interaction
  - `list_newsletter_lists()` — 所有電子報名單 + 人數
  - `search_subscribers_in_list(list_id, query?, limit?)` — 名單內訂閱者
  - `list_tags()` — 所有 tag
- Auth：`Authorization: Bearer <MCP_AGENT_TOKEN>`（單一共享 token，env var 設定）
- 新表 `public.agent_actions` — 每次 tool call 寫一筆 audit log（工具名 / 參數 / 是否成功 / IP hash / 時間）。super_admin 可讀
- 寫入工具 (`update_contact` / `add_note` / `add_to_newsletter_list`) 延後到 v2，v1 保守只開讀取
- 文件 `docs/mcp-server.md`：完整 setup + Claude Code config 範例 + curl 範例

### 部署需要的動作
1. `openssl rand -hex 32` 產 token
2. `vercel env add MCP_AGENT_TOKEN production` 加進 env
3. Redeploy

## v6.8.6 — fix(newsletter): list 詳細頁狀態 filter 與統計卡分群對齊（2026-06-01）

### 變更項目
- `/admin/newsletter/lists/[id]` 頁的狀態 dropdown 跟上方統計卡用不同分群 → 使用者點「退信」filter 只顯示 `bounced`（178）但統計卡「退信」顯示 229（bounced + invalid），少 51 筆
- 把 dropdown 簡化成跟統計卡 1:1 對齊：全部 / 訂閱中 / 已退訂 / **退信（含無效）** / **待處理（暫時失敗 / 信箱滿 / 擋件）**
- Filter 邏輯也改成分群匹配（不是逐一狀態值匹配）
- 移除細項選項（無效 / 暫時失敗 / 信箱滿 / 寄件擋 / 收件擋）— 個別狀態還是會在每筆 row 的 status badge 上顯示

## v6.8.5 — feat(newsletter): RSS feed 顯示完整網址 + 可點擊（2026-06-01）

### 變更項目
- `/admin/newsletter/quick-send/[id]` 頁面底部的「📡 RSS feed: `/api/newsletter/feed.xml`」改成顯示完整網址（用 `window.location.origin` 拼）+ 變成可點擊 link，不用再自己腦補 domain

## v6.8.4 — fix(newsletter): logo 搬到 Supabase Storage（修「匯出圖片」logo 不見）（2026-05-31）

### 變更項目
- 之前 logo 用 `https://listmonk.avatarmedicine.xyz/uploads/logo-v3.0-(1).png`，listmonk **沒送 CORS headers** → 在 `/admin/newsletter/quick-send` 按「匯出圖片」時，html2canvas 因為 cross-origin 被擋，logo 不會畫進 canvas，匯出的 jpg 左上角空白
- 解：把 logo 搬到 Supabase Storage 的 `newsletter-assets/branding/cancerfree-logo.png`（同 bucket、有 `Access-Control-Allow-Origin: *`）
- `compose-from-drafts/route.ts` 預設 `logo_url` 改成新 URL；可用 `NEWSLETTER_LOGO_URL` env var override
- 既有 3 個 6 月 campaign 的 logo URL 已直接在 DB 替換掉，立即生效

## v6.8.3 — fix(newsletter): highlight 在預覽中跑到「下月預告」section 裡（2026-05-31）

### 變更項目
- v6.8.2 把 highlight 渲染進 `{{intro_html}}` 但 3 個 template skeleton 把 `{{intro_html}}` 放在 `{{upcoming_title}}` **後面**，所以視覺上 highlight 變成「下月預告」的開頭內容
- 修：3 個 template (`skeleton-zh-TW.html` / `skeleton-en.html` / `skeleton-ja.html`) 把 intro_html 移到 upcoming_title **上方**（在 header 分隔線後）
- 結果：highlight 正確出現在電子報最頂部、跟兩個段落 (上月 / 下月) 分開

## v6.8.2 — feat(newsletter): highlight 改成完整 story 結構（標題 / 圖 / 連結 / 內文）（2026-05-31）

### 變更項目
- v6.8.1 的 highlight 是單一 textarea（純文字 / HTML）。改成跟一般 story 一樣的結構：標題 + 內文 + 圖片 + 連結，仍只有一個 per period
- 復用既有 ComposeModal / EditModal / 照片上傳 — UI 跟現有 story 編輯一致
- AI 撰寫時自動跑 refine + 翻譯 pipeline（不再需要單獨的 translateHtml，已移除）
- 在電子報最頂部用 `📌 {標題}` 的形式渲染（不帶 story 編號，跟下面 1/2/3 區隔）

### Schema
- `newsletter_drafts.section` CHECK 加入 `'highlight'`
- 新 partial unique index：每個 period 至多 1 個 highlight draft（不含 deleted）
- 拿掉 `newsletter_period_meta.highlight_html` 欄位（v6.8.1 加的、實際沒人用就改架構了）
- SQL 紀錄 `supabase/newsletter_drafts_add_highlight_section.sql`

## v6.8.1 — feat(newsletter): 草稿頁加 highlight + 段落 label 可自訂（2026-05-31）

### 變更項目
- **新增「📌 本期重點」highlight 區塊**（每期一個、選填）：在 `/admin/newsletter/draft/[period]` 頁面最上方，編輯後會自動出現在電子報最頂部
  - 寫中文即可，AI 撰寫時會自動翻成英文 / 日文（透過新加的 `translateHtml`）
- **段落 label 可自訂**：原本固定「上月回顧 / 下月預告」現在點段落標題可以重新命名（例：「五月回顧」「六月重點活動」）。清空則回復預設
- **Telegram bot `/news` 同步**：4 顆按鈕的文字會反映你自訂的 label（沒設則回退預設）
- **AI 撰寫採用 meta**：highlight 自動翻譯 + 注入電子報的 `intro_html`；段落 label 套到 3 個語言的最終 HTML
- **Meta 改了自動清快取**：PATCH period-meta 會 DELETE `newsletter_compose_cache`，下次 preview 會重跑 AI 用新設定

### Schema
- 新表 `newsletter_period_meta(period PK, highlight_html, label_last, label_next, updated_by, updated_at)`
- RLS：讀公開、寫需 `newsletter` feature
- SQL 紀錄 `supabase/newsletter_period_meta.sql`

## v6.8.0 — fix(newsletter): newsletter_compose_cache FK 又指錯表，preview cache 永遠寫不進去（2026-05-31）

### 變更項目
- v6.7.9 修了 timestamp，但 commit 仍然 409。根因：`newsletter_compose_cache.created_by` 的 FK **指到 `auth.users(id)`**，但 code 傳的 `auth.userId` 是 `public.users.id`（authorize helper 回傳的）→ 每次 preview INSERT 都 FK violation → cache **永遠是空的** → commit 找不到 cache row → 409
- 跟 v6.7.1 修的 `newsletter_drafts.created_by_fkey` 一模一樣的 bug（rmer）
- DB 改 FK 指向 `public.users(id) ON DELETE CASCADE`
- Code 補 error check：cache INSERT 如果失敗，不再 silent — 會 `console.error` 印到 Vercel log（之後同類 FK / schema 問題不會再藏起來）
- SQL 紀錄 `supabase/fix_newsletter_compose_cache_created_by_fkey.sql`

### 版本進位
- v6.7.9 → v6.8.0（PATCH 達兩位數規則）

## v6.7.9 — fix(newsletter): commit 卡 "No recent preview" — preview cache hit 補 refresh timestamp（2026-05-30）

### 變更項目
- v6.7.8 引進 preview cache hit 後，使用者再按 AI 撰寫只回傳快取，**沒更新原 cache row 的 timestamp**。如果原 cache 寫入超過 30 分鐘前，後續 commit (`建立 3 個 draft campaigns`) 找不到 < 30 分鐘的 cache → 回 409 `No recent preview to commit. Run preview first.`
- Preview 命中 cache 時 `UPDATE newsletter_compose_cache SET created_at = now()`，commit 看到的就是 fresh row

### 立刻能用的 workaround（不用等 deploy）
- 在預覽 modal 點「🔄 重新生成」→ 重跑 AI + 寫新 cache → 立刻按 commit 就會成功

## v6.7.8 — fix(newsletter): AI 撰寫補 logo + 讀連結內容 + preview 快取（2026-05-30）

### 變更項目
- **Logo**：`composeNewsletter` 預設 `logo_url` 從 `https://cancerfree.io/logo.png`（404）改成 `https://listmonk.avatarmedicine.xyz/uploads/logo-v3.0-(1).png`（過去 newsletter 一直在用、200 OK）。可用 `NEWSLETTER_LOGO_URL` env var override
- **AI 讀連結內容**：新增 `src/lib/fetch-url-context.ts`。Story 有 link 時自動抓網頁/YouTube（YouTube 走 oEmbed 拿標題＋作者，其他抓 HTML 抽純文字、上限 2000 字、timeout 10 秒），抓到的文字注入 refineProseZh 的 prompt 當「連結內容參考」。原本 AI 只看到 URL 字串、不知道連結背後寫什麼
- **Preview 快取**：每按一次「🪄 AI 撰寫」會先查 `newsletter_compose_cache`，若 30 分鐘內已有對同一組 story_ids 的快取就直接回傳，不會重跑 21 次 Gemini call。Modal 標題顯示「· 取自快取」標示
- **重新生成按鈕**：Preview modal 左下加「🔄 重新生成」按鈕，明確要 Gemini 重跑時點這顆（傳 `force: true`）

## v6.7.7 — fix(newsletter): AI 撰寫中文潤稿沒讀到 tone 樣本（2026-05-30）

### 變更項目
- `loadToneCorpus(lang)` 拿 `lang` 直接拼成 `-${lang}.md` 找檔，但實際 `skills/newsletter-composer/tone-samples/` 下中文檔名是 `2026-04-zh.md`（不是 `-zh-TW.md`）→ `lang='zh-TW'` 時永遠對不到
- 結果：AI 撰寫中文潤稿一直走 `(無過往樣本)` fallback，沒參考過去 4 期 newsletter 的語氣
- 英文與日文檔名跟 lang code 一致（`-en.md` / `-ja.md`），沒受影響
- 解法：在 loadToneCorpus 加一行 `const suffix = lang === 'zh-TW' ? 'zh' : lang`

## v6.7.6 — fix(newsletter): AI 撰寫 500 — Gemini model 名拼錯，補上 -preview 後綴（2026-05-30）

### 變更項目
- `/admin/newsletter/draft/[period]` 按「🪄 AI 撰寫」回 500，前端 `Unexpected end of JSON input` — 因為 server function 在 Gemini call 時 crash 沒寫 JSON response
- 根因：`src/lib/newsletter-ai.ts:13` 的 `MODEL_REFINE` 預設是 `gemini-3.1-pro`，**但 Google API 沒有這個 model**（只有 `gemini-3.1-pro-preview`）。translate 用的 `gemini-3.1-flash-lite` 是有效的不用改
- 解：補上 `-preview` 後綴
- 仍可用 `NEWSLETTER_MODEL_REFINE` env var 在 Vercel 上 override

## v6.7.5 — fix(newsletter): 草稿頁期數編輯加 Save/Cancel 按鈕、不再失焦就跳（2026-05-22）

### 變更項目
- v6.7.3 加的期數可編輯功能，原本只要 input 失焦（onBlur）或按 Enter 就會直接跳期，使用者改到一半點旁邊就被跳走、來不及確認
- 改成跟其他 inline-edit（newsletter lists、admin/users）一致的兩按鈕模式：✓ Save / ✗ Cancel
- 移除 onBlur 自動 commit；Enter 仍可快速 save、Esc 取消
- Save 按鈕在輸入不合法或跟現值相同時 disabled

## v6.7.4 — fix(auth): 有 user_management 權限但 sidebar 看不到「使用者」連結（2026-05-22）

### 變更項目
- v6.7.0 把 `user_management` feature 引進來時漏改 sidebar：`/admin/users` link 只放在 `superAdminItems`（只給 super_admin 看）。Luna 被授予 `user_management` 後可以進直接網址，但點不到 sidebar 連結
- 拆出 `userMgmtItems`（super_admin OR `user_management` 任一即顯示），把 `/admin/users` link 移過去
- 同時 layout `UserProfile` interface 跟 SELECT 都補 `granted_features` 欄位

## v6.7.3 — feat(newsletter): Story 草稿頁期數可點擊編輯 + bot /news 改 4 鍵一次選月份段落（2026-05-22）

### 變更項目
- `/admin/newsletter/draft/[period]` 頁面標題的期數變成可點擊編輯：點 `2026-05` → input 變藍框 → 輸入新 YYYY-MM → Enter 或 blur 跳到該期、Escape 取消
- Telegram bot `/news` 一鍵改成 4 個選項（本月 + 下月 × 上月回顧 / 下月預告），不再只能用「本月」。對應 5 月底準備 6 月電子報的場景
- prompt 文字三語同步更新

## v6.7.2 — feat(newsletter): Story 草稿頁加入口 + 每個 story 加可見的編輯按鈕（2026-05-22）

### 變更項目
- `/admin/newsletter/campaigns` 頁面 header 新增「Story 草稿管理 →」入口（之前只能用直接網址進去）
- `/admin/newsletter/draft/[period]` 每張 story 卡片右上加 Pencil 編輯按鈕，跟 Trash 並列。點下去開既有的編輯 modal（可改標題、內容、日期、期數、段落、照片）
- 整張卡片 click 開編輯 modal 的行為保留 — 多一個明顯的按鈕只是讓編輯動作更明顯

## v6.7.1 — fix(bot): 修好 /news 在 Telegram 卡 FK violation（2026-05-22）

### 變更項目
- `newsletter_drafts.created_by` 的 FK 原本指到 `auth.users(id)`，但 bot `getAuthorizedUser` 與 `/api/newsletter/drafts` authorize helper 都回傳 `public.users.id`（不同的 UUID） → 每次 insert 都 FK violation。Telegram `/news` 跟 Web 端寫入新 draft 都被卡住
- 改成 `FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL`，配合既有 code 與 PostgREST GET 那條 `creator:created_by(display_name)` join 的意圖
- 套用時 `newsletter_drafts` 表是空的（0 筆），沒有資料遷移風險
- SQL 紀錄在 `supabase/fix_newsletter_drafts_created_by_fkey.sql`

## v6.7.0 — feat(auth): 新增「使用者管理」grantable feature（限重設 MFA / 編輯 Telegram）（2026-05-21）

### 變更項目
- **新增 grantable feature key `user_management`**：super_admin 可以在 `/admin/users` 把這個權限授予指定使用者
- 被授予 `user_management` 的人可以：
  - 看到 `/admin/users` 整張表（含每位 user 的 MFA / Telegram / Teams 狀態）
  - 對指定 user 按「重設 MFA」清掉 factor
  - 編輯指定 user 的 Telegram ID
- **不能做的事**（仍只限 super_admin）：
  - 切換 super_admin / member 角色
  - 授予 / 取消任何 grantable feature
  - 開啟 / 關閉維護模式
- 三個 API endpoint 同步放行（`/api/admin/mfa-status`、`/api/admin/users/[id]/reset-mfa`、`/api/admin/users/[id]/telegram-id`）：原本只接 super_admin、現在接 super_admin 或 `user_management` feature
- 標籤顯示「使用者管理（限重設 MFA / 編輯 Telegram）」便於 super_admin 在權限矩陣裡認得

## v6.6.0 — feat(newsletter): CSV 匯入建立收件名單 + dedup + format 檢查 + bounce/unsub 提醒（2026-05-21）

### 變更項目
- **新增 `/admin/newsletter/lists` 的「從 CSV 匯入」按鈕**：點擊開啟 modal、選擇 CSV、上傳後建立新清單並把訂閱者批次加入
- **CSV 格式**：兩個欄位 `名字` + `email`，email 必填；header 不符會回 400 + 明確錯誤訊息
- **清單名稱來源**：從檔名自動生成（去掉 `.csv` 與所有空白 / 非字母數字，CJK 保留），匯入後可在列表頁就地編輯
- **匯入時自動處理**：
  - Email 格式檢查（不合格略過、計入 stats）
  - CSV 內重複去重（同 email 重複出現只匯一次、計入 stats）
  - 比對 `newsletter_blacklist` / `newsletter_unsubscribes` 標示曾被拒收 / 退訂（**仍會加入清單**，僅提醒）
- **回應 stats**：原始列數、已匯入、Email 格式錯誤數、CSV 內重複數、曾被拒收數、曾退訂數
- **不會建立任何 contact 列**：trigger `link_subscriber_to_contact` 只反向把 subscriber 連到既有 contact，不會新增 contact
- 新增 `src/lib/csv.ts`（RFC4180-lite parser，跟 `scripts/import-newsletter-subscribers.mjs` 同一條邏輯）
- 新增 endpoint `POST /api/newsletter/lists/import-csv`（multipart/form-data，super_admin / newsletter 權限）

### 設計決定
- Bounce / unsub 是「提醒」不是「過濾」 — 使用者決定要不要事後手動移除
- CSV header 採嚴格匹配（不接受同義詞），降低誤匯入機會

## v6.5.0 — docs(rules): 版本進位規則改成兩位數時帶上一級（2026-05-20）

### 變更項目
- CLAUDE.md 版本規則新增：PATCH 進位到兩位數 → MINOR +1、PATCH 歸零；MINOR 進位到兩位數 → MAJOR +1、MINOR/PATCH 歸零。例：`6.4.9 → 6.5.0`（不是 6.4.10）、`1.9.x → 2.0.0`
- 核心原則：PATCH / MINOR 都不允許出現兩位數
- v6.4.10 視為新規則生效前的最後一個版本，不回頭改

## v6.4.10 — fix(auth): 重設 MFA 按鈕現在會清掉 unverified factor（2026-05-20）

### 變更項目
- **修好「重設 MFA」按鈕對 stuck mid-enroll 使用者無效的 bug**：原本 `/api/admin/users/[id]/reset-mfa` 透過 `service.auth.admin.mfa.listFactors()` 取得 factor 清單，但這個 admin API 在現行 Auth 版本只回 `verified` 狀態的 factors，導致 unverified（半設定 / 沒驗證碼通過）的 factor 一直留在 `auth.mfa_factors` 裡。Kevin / Lucia 就卡在這個狀態 — 網頁上按重設沒反應、自己也沒辦法重新設定 MFA
- **改用 SECURITY DEFINER RPC `admin_delete_all_mfa_factors(uuid)`** 直接 `DELETE FROM auth.mfa_factors WHERE user_id = ?`，一次清乾淨 verified + unverified
- **權限**：只有 `service_role` 可以執行該 function（`REVOKE FROM PUBLIC, anon, authenticated`），endpoint 內仍維持 super_admin 檢查
- SQL 紀錄在 `supabase/admin_delete_all_mfa_factors.sql`

## v6.4.9 — chore(notify): SendGrid 取代 Microsoft Graph + skill 完整接好（2026-05-19）

### 變更項目
- **`/api/admin/notify-release` 改用 SendGrid**：原本走 Microsoft Graph `/me/sendMail` 用 pohan.chen 的 OAuth token，但 token 過期後的 refresh 路徑被 Vercel 上失效的 `AZURE_OAUTH_CLIENT_SECRET` 擋住（`AADSTS7000215`）。改成 SendGrid（newsletter 已用同條路、穩定）。SendGrid 用 static API key、不會有 token 過期問題
- **From / Reply-To 分離**：`From: SENDGRID_FROM_EMAIL` + name `Po-Han Chen (myCRM)`、`Reply-To: pohan.chen@cancerfree.io`。收件人回信會回到 pohan 信箱
- **`.claude/notify-release.config.json`**：per-project 設定檔（API URL、token env、CHANGELOG 路徑、subject template、語氣模板）。`projectName` 抽出成獨立欄位避免 hardcode 在 template 字串裡
- **`.gitignore`**：`.claude/` 改成 `.claude/*` 配 `!.claude/notify-release.config.json`，讓專案級 settings 仍然 gitignore、但 notify-release config 跟著 repo 走

### 配套（不在這個 commit）
- User-level skill `~/.claude/skills/notify-release/SKILL.md`（跨 project 通用）
- mycrm memory `feedback_notify_release_after_push.md`（auto-trigger 規則）
- `.env.local` 加 `RELEASE_NOTIFY_TOKEN` (gitignored)
- Vercel env 加 `RELEASE_NOTIFY_TOKEN` (production)

### 潛伏 bug 觀察（未修）
- pohan.chen 的 Microsoft Graph token refresh 仍壞掉（`AADSTS7000215`），影響任何走 `/contacts/[id]` 寄信功能的 path。修需要進 Azure portal 把 flightpath app (91ec2d94-...) 的 client_secret 重新發、更新 Vercel env

## v6.4.8 — feat(notify): /api/admin/notify-release endpoint（2026-05-19）

### 變更項目
- 新增 `POST /api/admin/notify-release`：給 Claude Code 端的 `notify-release` skill 呼叫，每次 push 完自動寄送 release 通知給所有 MFA-enabled user
- **Auth**：`Authorization: Bearer ${RELEASE_NOTIFY_TOKEN}`（env var 共享密鑰）
- **Sender**：`pohan.chen@cancerfree.io`，透過 Microsoft Graph `/me/sendMail`。Token 過期會自動用 `provider_refresh_token` 走 Azure OAuth 換新（複用 `getValidProviderToken`）
- **Recipients**：複用 `get_users_mfa_status` RPC，只發給 `has_mfa = true` 的 user
- **`dryRun`**：回傳 recipient 清單但不真的寄
- **`testEmail`**：只發給單一 address，覆蓋 MFA query
- **失敗回報**：個別失敗會收集到 `errors[]`、不會中斷其他 recipient

### 還沒做
- Claude Code 的 `notify-release` skill 本體（user-level、跨 project）— 下一步
- `RELEASE_NOTIFY_TOKEN` 加到 Vercel env vars — 部署完手動加

## v6.4.7 — fix(contacts): 修 web 新增聯絡人壞掉 + 加姓名必填驗證 + DB CHECK（2026-05-19）

### 變更項目

#### P0 — 致命 fix: `/contacts/new` 儲存失敗
- `EMPTY_FORM` 把 `source: ''`（line 36）改成 `source: 'web'`
- **原因鏈**：`source: ''` 是死 init（form 沒讓使用者編輯 source）→ `handleSubmit` 把空字串轉 null（`v.trim() || null`）→ payload 帶 `source: null` 去 INSERT → DB schema `source TEXT NOT NULL DEFAULT 'web'` 在「顯式傳 null」時不會套 default，直接 NOT NULL violation → 「儲存失敗」。歷史上 web 來源有 515 筆 contact，表示某次某人加了 NOT NULL 到 source 之後就壞掉、但因為大家平常用 telegram bot / camcard 不走 web 表單、沒人發現

#### P1 — Client validation + UI 標記必填
- `Field` component 新增 `required: boolean` props，渲染紅色 `*`
- `name` / `name_en` / `name_local` 三欄 label 都加 `*`
- 基本資訊區塊頂部加灰字 hint「姓名（中文 / 英文 / 當地）至少填一個」
- `handleSubmit` 開頭加 client validation：三個 name trim 後全空 → `setError(t('nameRequiredError'))` 不送出
- i18n `contacts.nameRequiredHint` / `contacts.nameRequiredError` 三語同步

#### P2 — DB CHECK constraint
- `supabase/contacts_has_name.sql`：新增 `contacts_has_name` CHECK `coalesce(name, name_en, name_local) IS NOT NULL`
- `NOT VALID` 模式 — 不影響現有 3 個 ghost row（都來自 camcard 批次匯入、有 email/phone/company），未來所有 INSERT/UPDATE 都會檢查
- 涵蓋所有寫 contacts 的 path（web 表單、telegram bot 流程、camcard approve、Ragic 匯入、inbound_email 等），不只 web 表單
- 已 apply 到 production

### 安全性 / CLAUDE.md 規範
- 滿足「**表單 Label 在上方、錯誤訊息在下方、必填加 `*`**」
- 三語錯誤訊息

## v6.4.6 — chore(docs): 移除沒在跑的 Gemini docs cron（2026-05-18）

### 變更項目
- 刪除 `src/app/api/docs/cron/route.ts`（連同其中 80 行嚴重過時的 `FEATURES_SUMMARY` — 寫的還是 v1.3.9 的功能清單，沒包含 v2/v3/v4/v5/v6.x 的任何新功能：camcard 匯入、newsletter、photos 相簿、MFA、`/admin/feedback`、軟刪除、maintenance mode、edit Telegram ID、Bot 多語、`/b /v /a /p /li /ai /news /meet /todos /lang` 等）
- 這個 route 從來沒被加進 `vercel.json` 的 crons 清單，所以實際上從沒被定期觸發；DB 裡有內容是因為偶爾手動 fetch
- **後續會用 Claude routine 取代**：每週六 02:00 Asia/Taipei，讀 repo 當前狀態（CLAUDE.md / README / CHANGELOG / src 結構）重生 9 份 `docs_content` (zh-TW / en / ja × quick_start / user / super_admin)

## v6.4.5 — chore(bot): 全面 i18n — Japanese/English users 不再看到中文（2026-05-18）

### 變更項目
- **Telegram bot 全面 i18n**：route.ts ~216 處硬編中文字串改用 `BOT_MESSAGES` 翻譯 key；BotMessages interface 新增 229 個 key（zh / en / ja 三語並行）
- **`toLocaleString` 改吃 user lang**：新增 `dateLocale(lang)` helper，task due/postpone/list、`formatTaipeiRange` 都用 user 設定的語言格式化日期。task 指派通知用 **assignee 的** bot 語言（不是 assigner 的）— 日本同事被指派時看到日文
- **Hunter.io 富化訊息**：新增 `hunterLang(lang)` mapping `'zh-TW' | 'en' | 'ja'`，3 處 callsite 通通切換
- **CARD_FIELD_LABELS dict 改成 per-lang `cardFieldLabel(key)` function**：名片 OCR 差異展示的 field label (`姓名` / `Name` / `氏名`) 隨 user lang 切換
- **TYPE_LABEL dict 同步 i18n**：互動紀錄類型 (`筆記/會議/郵件/系統`) 三語版
- **國家名稱顯示**：`countries.name_zh/name_en/name_ja` 依 bot 語言挑選（fallback name_zh）
- **`（台北）` timezone annotation 三語版**：ja `（台北時間）` / en `(Taipei)` / zh `（台北）`
- **skip token 擴充**：`/v` `/news` 等流程允許日文使用者輸入「スキップ」（原本只接受「略過」/「skip」）
- **NOT 翻譯**：interaction_logs DB content (`【名片新資料】...`)、internal `throw new Error(...)`、comments、callback_data 值 — 這些不會送到 Telegram

### 起因
- MASATO YOKOYAMA (Japanese user) 反映 bot 很多回覆還是中文，雖然他的語言設成 japanese
- 例如「⏳ OCR 辨識中」、「✅ 名片已儲存」、「❌ 處理失敗」、`(台北)` 時區、cardField label「姓名/公司」等

### 已知保留
- `sendMessage()` 內部 503 retry 訊息（`tgBusy` / `tgSendFailed`）目前 fallback zh — 因為這個 function 沒 user lang context。極罕見 case，留 inline 註解
- 部分 `/p` 量詞單位（中文 `張` / 日文 `枚`）走 inline lang 條件，沒走 BOT_MESSAGES — 量詞變化複雜，inline 比較清楚

## v6.4.4 — feat(admin): super_admin 可從使用者管理修正 Telegram ID + 短數字軟提醒（2026-05-18）

### 變更項目
- **新 API `POST /api/admin/users/[id]/telegram-id`**：super_admin 才能呼叫，接 `{ telegramId: number | null }`。Server 驗「正整數或 null」、不擋短數字（信任 admin），plausibility 警告留給 UI 端做
- **`/admin/users` Telegram 欄位現在顯示實際 ID**（不再只是 bound/unbound pill）：
  - Desktop table cell：mono font 顯示 telegram_id 值 + pencil 按鈕
  - Mobile card：新增「Edit Telegram ID: {value}」滿版按鈕
- **編輯模式**：點 pencil → input 預填當前值 + Save/Cancel；`inputMode="numeric"` 手機跳數字鍵盤。Save 走新 API、Cancel 還原。input 留空儲存 = 把 telegram_id 設 null（解除綁定）
- **短數字軟提醒**：如果輸入 < 1e8（< 8 位數），跳 `confirm("「{value}」看起來太短（一般是 9–10 位數）。仍要儲存？")` 防呆。Telegram user ID 典型 9–10 位，5–7 位通常是 typo
- **i18n**：新增 `users.editTelegram` / `telegramIdPlaceholder` / `telegramIdInvalid` / `telegramIdSuspicious` / `telegramIdSaveFailed` 到 zh-TW / en / ja

### 起因
- MASATO YOKOYAMA 把自己的 telegram_id 在 /settings 填成 `82191`（只有 5 位數），導致 bot 收到他的照片時 `getAuthorizedUser` 找不到 row、回「⛔ 権限がありません」。/settings 原本只驗整數沒驗位數，所以擋不下來
- 這個功能讓 super_admin 不用直接動 SQL 就能修正同事的 Telegram ID

## v6.4.3 — feat(camcard): approve 時可選 backdate + 預設 2000-01-01（2026-05-18）

### 變更項目
- **新行為：`/api/camcard/[id]/confirm` 統一把 `contact.created_at` + `last_activity_at` 設為 backdate**，而不是原本的 `pending.created_at`（≈ import script 跑的時間）。批量匯入的舊名片不再擠在 `/contacts`「最近」位置汙染新進聯絡人視覺（`/contacts` 預設按 `last_activity_at desc` 排）
- **新欄位：API 接 `body.backdate`（`YYYY-MM-DD`）**：approver 可手動覆寫；無給或格式不合法時 fallback `HISTORIC_BACKDATE = 2000-01-01T00:00:00.000Z`
- **UI：`/admin/camcard` amber「批次 met_at」工具列上方新增 slate「批次 backdate」工具列**：date input、預設 `2000-01-01`、approver 可改成估計年代（例 2018-05-01）。同一 page session 內所有 approve（單張、按公司、multi-select bulk）共用此值；refresh 頁面回到預設
- **`imported_at` 仍記錄 approve 當下**（audit trail），不受 backdate 影響
- **`met_date` 不受影響**：依然從 `ocr_data.met_date` 抓（若 OCR 或手動填過）
- **i18n**：新增 `camcard.backdateTitle` / `camcard.backdateHint` 到 zh-TW / en / ja

### 既有互動已驗證
- 有互動（note、寄信）後 `last_activity_at` 會被更新成當下 → 那筆 contact 自動冒回 /contacts 最上面（「有用」的浮上來、「沉睡」的下沉，符合直覺）
- 報表「最近 X 天新進」這類 created_at 過濾不會抓到他們

## v6.4.2 — chore(newsletter): TS deeply-nested generics + lint cleanup（2026-05-18）

### 變更項目
- **修 `chunkedIn` helper 的 TS2589 "excessively deep"**：`extraFilter` 參數原本用 `ReturnType<ReturnType<typeof service.from>['select']>` 去抓 Supabase `PostgrestFilterBuilder` 的深層泛型，導致 TS 推導爆炸。改為 `(q: any) => any`，runtime 行為不變、編譯時不再爆。`next.config.ts` 雖然有 `typescript.ignoreBuildErrors`，但本機 `npx tsc --noEmit` 終於乾淨
- **連帶清掉 3 處 callsite 的 `as unknown as { ... }` cast**：原本三個 callsite 為了繞過嚴格型別都用了醜醜的雙重 cast 寫 `q.is(...)` / `q.not(...)`。現在 `q` 是 `any`，直接呼叫即可
- **lint cleanup**：`invalidEmails` 只被 push 不重入，`let` → `const`（pre-existing prefer-const error）

## v6.4.1 — feat(photos): 排序切換（上傳/拍攝/姓名）+ 預設改上傳時間（2026-05-18）

### 變更項目
- **相簿排序預設改為「上傳時間」**：原本預設 `taken_at desc nulls last`，沒 EXIF 的照片（截圖、被剝掉 metadata 的）會沉到最後。改為 `created_at desc`，所有照片不分有無 EXIF 都按上傳時間排
- **`/photos` 搜尋框下方加排序 pill button**：三種模式可切換 — `上傳時間`（預設）/ `拍攝時間`（保留舊行為，null 在最後）/ `聯絡人名稱`（依 `contact.name` localeCompare、不分大小寫，未歸類在最後）
- **API `/api/photos` 接 `?sort=` 參數**：`created_at` / `taken_at` / `name`，未指定或不認得時 fallback `created_at`。`name` 模式 DB 仍按 `created_at desc` 拉，再用 JS `localeCompare` 排序（避開 PostgREST 對關聯 table 欄位排序的限制）
- **i18n**：新增 `photos.sortBy` / `photos.sortCreated` / `photos.sortTaken` / `photos.sortName` 到 zh-TW / en / ja
- **lint cleanup**：刪除沒意義的 `LightboxPhoto extends PhotoRow {}` empty interface、將 `lbOnDoubleClick` 的三元運算式 statement 改為 `if/else`

## v6.4.0 — feat(admin): maintenance toggle + dashboard banner + mobile users/camcard（2026-05-15）

### 變更項目
- **Web 上開關 maintenance mode**：`/admin/users` 頁面頂部新增 toggle 區塊（super_admin only），呼叫新 API `/api/admin/maintenance`（GET 取目前狀態 / POST 切換）。原 Telegram bot `/stop` 指令仍可用，兩個入口寫同一個 `system_settings.maintenance_mode`
- **Maintenance banner**：當 maintenance mode 開啟時，super_admin 在 dashboard 仍可瀏覽，但每頁頂部會顯示 `Wrench` icon + 「維護模式已啟用」amber banner，提醒目前一般使用者無法登入
- **`/admin/users` mobile-friendly**：< sm 螢幕顯示 user 卡片清單（姓名、email、role badge、Telegram/Teams/MFA pill、Reset MFA 按鈕、權限切換），≥ sm 維持原有 table 並加 `overflow-x-auto`。所有按鈕觸控目標 ≥ 36px
- **`/admin/camcard` mobile-friendly**：CardItem 改 `flex-col sm:flex-row`（mobile 直向排版：checkbox+thumb / OCR / 動作按鈕），edit modal 改 `grid-cols-1 sm:grid-cols-2`，floating bulk bar 加 `flex-wrap` + `max-w-[calc(100vw-1.5rem)]` 避免在窄螢幕溢出。動作按鈕觸控目標 ≥ 36px
- **i18n**：新增 `maintenance.toggle*` / `maintenance.banner*` key 到 zh-TW / en / ja

## v6.3.3 — fix(security/newsletter): webhook fail-closed + AI commit cache（2026-05-15）

### 變更項目
- **`/api/sendgrid/webhook` fail-closed**：缺 `SENDGRID_WEBHOOK_SECRET` 時改為 reject（之前是放行，env 一旦消失就變開放）
- **AI commit 改吃 preview cache**：新 table `newsletter_compose_cache`（30 分鐘 TTL）。preview 寫入 cache，commit 從 cache 讀。先前 commit 會再跑一次 Gemini → 員工 commit 的內容跟 preview 看到的不一樣（Gemini non-deterministic）。現在 commit 完全沿用 preview 的結果

## v6.3.2 — fix(sendgrid): Event Webhook 改用 ECDSA 簽章驗證（2026-05-14）

### 變更項目
- `/api/sendgrid/webhook` 從錯誤的 HMAC-SHA256 驗證改成正確的 ECDSA P-256 / SHA-256（SendGrid Event Webhook 官方用 ECDSA）
- `SENDGRID_WEBHOOK_SECRET` env 接受 raw base64 (124 chars) 或完整 PEM 兩種格式，code 自動 wrap
- 修復後 email tracking 恢復：open / click / bounce / unsubscribe events 都會進 `email_events` table

## v6.3.1 — fix(bot/migration/inbound): /cancel 提示 + 大附件 BCC 修復 + Edge Function deploy 正規化（2026-05-14）

### 變更項目
- **`/api/sendgrid/inbound-parse` 搬到 Supabase Edge Function**：Vercel 4.5 MB body limit 擋了帶 5 MB+ 附件的 BCC 信件。新 Edge Function `inbound-parse` 在 Supabase Edge（Pro 25 MB body），完整 port + 用 SendGrid parsed mode 跳過 mailparser 依賴。附件 binary 丟棄、只存檔名到 `interaction_logs.email_attachments`
- **Edge Function 部署方法修正**：`/v1/projects/{ref}/functions` (JSON body) 無法正確 bundle，function 永遠 BOOT_ERROR。改用 `/v1/projects/{ref}/functions/deploy` (multipart) — Supabase CLI 用的同 endpoint。Migration toolkit Phase 07 同步更新
- **重新部署 3 個 BOOT_ERROR 的 function**：`send-reminder` / `send-newsletter` / `send-report` 從 migration 後就壞，現在恢復。`std@0.177/http/server.ts` 的 `serve` 替換為內建 `Deno.serve`；`send-newsletter` 的 `std/node/crypto` 替換為 `node:crypto`
- **Telegram bot session-starting prompts 加 `/cancel` 提示**：`/p`、`/a`、`/li`、`/news` 流程現在明示「（或 /cancel 取消）」
- **批次編輯 met_date 不再帶今天的預設值**：之前所有人都會被誤改成 today

### 仍待處理
- `/api/sendgrid/webhook` (Event Webhook) 50+ 401：HMAC vs ECDSA 算法不匹配，需 SendGrid 端設定調整或 code 改用 ECDSA

## v6.3.0 — feat(newsletter): 多人協作素材累積 + AI 自動編寫（2026-05-14）

### 變更項目
- **新 table `newsletter_drafts`**：員工整月累積 story 素材，多人協作。RLS 走 `has_feature('newsletter') OR is_super_admin()`
- **Telegram bot `/news` 指令**：手機隨手累積素材（section → title → date → 文字+照片 → /done），存到當月 draft
- **Web 後台 `/admin/newsletter/draft/[period]`**：兩欄看板（上月回顧 / 下月預告），全員可看/編/刪/排序，可跨月搬移
- **API routes**：`/api/newsletter/drafts/*`（GET/POST/PATCH/DELETE + photo upload + JSON export）
- **AI 編寫 endpoint `/api/newsletter/compose-from-drafts`**：撈當月 drafts → Gemini 3.1 Pro 潤中文 → Gemini 3.1 Flash Lite 翻譯英日 + 生成 promo text → 套既有 skeleton-{lang}.html → 預覽 / Commit
- **Commit 模式**：一鍵建立 3 個 draft campaigns（zh/en/ja），素材標 status='used'
- **`src/lib/newsletter-ai.ts`**：refineProseZh / translateStory / generatePromoText，跑 Portkey + Gemini，吃 `skills/newsletter-composer/tone-samples/` 當 few-shot
- Bot help / docs (zh/en/ja) 補 `/news` 指令說明

## v6.2.0 — feat(bot): /a 指令支援新增聯絡人 + 跳過名片選項（2026-05-12）

### 變更項目
- `bot/route.ts`：`/a 姓名 | 公司` 找不到聯絡人時提供建立新聯絡人的選項（`confirm_create_a` 流程，仿 `/p` 設計）
- `bot/route.ts`：找到聯絡人或建立後，顯示「⏭ 跳過，不需要名片」按鈕，可略過名片直接完成
- `bot/route.ts`：新增 callback handlers：`confirm_create_a`、`cancel_a`、`skip_add_card`
- `bot-messages.ts`：三語 `/help` 文字更新，說明 `/a` 支援 `名字 | 公司` 語法與找不到時建立
- `docs/bot/commands.md`（zh/en/ja）：更新 `/a` 指令說明，加入方式三與跳過說明

## v6.1.3 — fix(camcard): 確認名片時同步 last_activity_at（2026-05-12）

### 變更項目
- `confirm/route.ts`：建立聯絡人時設 `last_activity_at = pending.created_at`，防止名片確認後誤排到聯絡人列表最前面

## v6.1.1 — fix(reports): 填寫人改 dropdown、Newsletter 預設排除、欄位重設計（2026-05-12）

### 變更項目
- 報表「填寫人」篩選改為 dropdown + checkbox 多選（更緊湊）
- Newsletter email 永遠排除（hardcode），移除 toggle 按鈕
- 欄位重設計：新增「填寫日期」（il.created_at，永遠有值）；「內容」→「主題/摘要」；移除「時間」欄；「日期」→「拜訪日期」
- Excel 匯出改用中文欄位 header
- DB RPC 新增 log_date 回傳欄位

## v6.1.0 — feat: 聯絡人認識日期篩選 + 報表填寫人篩選與排除 Newsletter（2026-05-12）

### 變更項目
- `contacts/page.tsx`：新增「認識日期」date range filter（met_date 欄位），與建立日期同樣操作方式
- `api/contacts/all`：SELECT_FIELDS 加入 `met_date`
- `admin/reports/page.tsx`：新增「填寫人」多選篩選（可選 Po、Luna 等特定成員）；新增「排除 Newsletter」toggle
- `api/reports/generate`：接收並傳遞 `creatorIds`、`excludeNewsletter` 到 RPC
- DB：`get_interaction_logs_by_tags` RPC 新增 `p_created_by_ids uuid[]` 與 `p_exclude_newsletter boolean` 參數

## v6.0.3 — fix(inbound-email): 自動建立聯絡人的語言依國家推斷（2026-05-08）

### 變更項目
- `findOrCreateContactByEmail`：語言不再寫死 english，改依推斷的 country_code 決定（TW/CN/HK/SG/MO → chinese、JP → japanese、KR → korean、其他 → english）
- 新增 `countryCodeToLanguage()` util 到 `emailDomainToCountry.ts`

## v6.0.2 — fix(contacts): 批次編輯只改語文/公司等欄位時不寫 interaction log（2026-05-08）

### 變更項目
- `handleBatchSave`：只有 `met_at` 有填時才插入 interaction_logs，修正僅改語文/國家/公司時產生假「認識於：—」紀錄的問題
- 同步清除今日已寫入的 122 筆假紀錄（DB DELETE）

## v6.0.1 — fix(newsletter): 清單「加入時間」改顯示聯絡人建立時間（2026-05-08）

### 變更項目
- 「加入時間」欄位改為顯示 contact.created_at（聯絡人在 CRM 的建立時間）
- 無連結聯絡人的訂閱者顯示 —
- 排序也依 contact.created_at 為主

## v6.0.0 — feat(newsletter): 清單頁新增欄位篩選功能（2026-05-08）

### 變更項目
- `/admin/newsletter/lists/[id]` 訂閱者表格新增三個篩選下拉：狀態、國家、連結狀態
- 國家選項從當前名單資料動態產生
- 任一篩選條件啟用時顯示「清除篩選」按鈕，一鍵重置所有篩選與搜尋

## v5.9.9 — feat(newsletter): 清單頁新增「國家」欄位（2026-05-08）

### 變更項目
- `/admin/newsletter/lists/[id]` 訂閱者表格新增「國家」欄位，從 contact.country_code 取得
- 支援依國家排序（點欄位標題）
- 無連結聯絡人或 country_code 為空者顯示 —

## v5.9.8 — fix(duplicates): find_name_duplicates 還原 LIMIT 2000 避免 timeout（2026-05-08）

### 變更項目
- `find_name_duplicates()` 加回 LIMIT（2000），避免全表 O(n²) trigram 比對 statement timeout
- 完全相同名字的重複已由 `find_exact_name_duplicates()` 全表負責，fuzzy 掃描只需覆蓋近 2000 筆

## v5.9.7 — fix(duplicates): 修正重複偵測漏掉舊聯絡人 + 加完全相同名字偵測（2026-05-08）

### 變更項目
- 新增 DB function `find_exact_name_duplicates()`：全表掃描，用 GROUP BY 找完全相同 canonical name，不受任何 LIMIT 限制
- 修改 `find_name_duplicates()`：移除 `LIMIT 1000`，改為全表 trigram 相似度掃描（threshold 0.65），排除已被 exact match 找到的對
- `scan-duplicates` API 加入第三步驟呼叫 `find_exact_name_duplicates`
- **根本原因**：舊版只掃最近 1000 筆，從名片王早期匯入的 MD 聯絡人完全不在掃描範圍內

## v5.9.6 — feat(contacts): 批次編輯加入公司名、國家、語言、Tags（2026-05-07）

### 變更項目
- `/contacts` 批次編輯 modal 新增欄位：公司名、國家、語言、Tags
- 空白欄位不覆寫（只更新有填寫的欄位）
- Tags 為「加入」操作，不移除現有 tags；支援多選
- `handleBatchSave` 只 update 有值的欄位，local state 同步更新

## v5.9.5 — feat(camcard): 批次設定 Met at + 編輯 modal 加 met_at/met_date（2026-05-07）

### 變更項目
- 名片王審查頁（`/admin/camcard`）篩選列下方新增琥珀色批次工具列
- 輸入活動/地點名稱 + 日期，點「套用到全部 N 筆」一次更新當頁所有名片的 `met_at` / `met_date`
- 編輯名片 modal 新增「活動 / 地點」與「認識日期」欄位，可逐張編輯
- `update` API 移除對 `met_at`/`met_date` 的強制保留（現在可透過編輯覆寫）

## v5.9.4 — feat(pending): 批次設定 Met at（2026-05-07）

### 變更項目
- 名片王待審頁（`/contacts/pending`）新增批次 Met at 編輯列
- 有已辨識（done）資料時，頂部顯示琥珀色工具列：輸入「活動 / 地點名稱」及日期，點「套用到全部 N 筆」一次更新所有 done 的 pending 聯絡人
- 每張已辨識名片卡片也改為可直接行內編輯個別 `met_at` / `met_date`

## v5.9.0 — feat(newsletter): 直接輸入 Email 加入名單 + 聯絡人互動紀錄電子報獨立顯示 + Notes 預設30天（2026-05-07）

### 變更項目
- 電子報名單頁「新增」modal 加 Tab：「搜尋聯絡人」/ 「直接輸入 Email」，不需有 CRM 聯絡人即可加入名單
- `list-members` API POST 支援 `email` 欄位（無 `contact_id` 時自動 find-or-create subscriber）
- 聯絡人互動紀錄：SendGrid 電子報（`send_method='sendgrid'`）顯示青綠「電子報」badge，與「郵件」區分
- `/notes` 頁面預設 `dateFrom` 為今日往前 30 天，不再顯示全部 500 筆

## v5.8.1 — feat(notes): Newsletter 獨立為一個 filter 類型（2026-05-07）

### 變更項目
- `/notes` 頁面 filter 新增「電子報」選項，`send_method='sendgrid'` 的 email 歸為 Newsletter
- 全部類型顯示時，badge 自動區分「郵件」（紫）與「電子報」（青綠）
- 「郵件」filter 只顯示個人/Outlook 寄出的信，不包含 newsletter
- 新增 i18n key `notes.types.newsletter`（三語）

bump 5.8.0 → 5.8.1

## v5.8.0 — feat(newsletter): 電子報列表可編輯標題、刪除（2026-05-07）

### 新功能
- 電子報列表：滑鼠移到標題出現鉛筆圖示，點擊進入 inline 編輯，Enter 或失焦儲存
- 電子報列表：每筆右側新增刪除按鈕（🗑），已寄送的電子報不可刪除
- 新增 `DELETE /api/newsletter/campaigns/[id]`，draft/scheduled 可刪，sent 回 400

bump 5.7.3 → 5.8.0

## v5.7.3 — fix(sendgrid): bounce webhook 改用 ilike，補 9 筆 contact.email_status（2026-05-07）

### 變更項目
- `markSuppressed()` 改用 `.ilike()` 查 contact email，修正大小寫不符導致退信寫入 blacklist 而非 contact 欄位的 bug
- DB migration：backfill 9 筆 contacts，將 `newsletter_blacklist` 中有對應 contact 但 `email_status` 為 NULL 的全部補上 `bounced`

bump 5.7.2 → 5.7.3

## v5.7.2 — fix(newsletter): 儲存草稿 circular JSON 修正（2026-05-07）

### 變更項目
- `save()` 加上 `typeof` 防禦檢查，避免 SyntheticEvent 被當作 html override
- 儲存草稿按鈕改為 `onClick={() => save()}`，不再把 click event 傳入 save

bump 5.7.1 → 5.7.2

## v5.7.1 — fix(newsletter): inline 編輯「套用並儲存」直接存 DB（2026-05-06）

### 變更項目
- 「套用變更」改名為「套用並儲存」，點擊後同時更新 state 並呼叫 PATCH API
- 離開頁面再回來，inline 編輯的內容會正確保留

bump 5.7.0 → 5.7.1

## v5.7.0 — feat(newsletter): Inline 編輯器取代 TipTap，版型不再跑掉（2026-05-06）

### 變更項目
- 新增 `InlineEmailEditor` 元件：使用 iframe + `document.designMode`，直接在渲染後的 email 版型上點選文字編輯
- 移除「視覺編輯」（TipTap）模式 — TipTap 會將 table-based email HTML 重新 parse，破壞版型
- 新增「Inline 編輯」模式取代之：切換後即時可點選任意文字修改，table 結構與 inline styles 完全保留
- 點擊「套用變更」或切換其他模式時自動同步 HTML 回主狀態
- 圖片上傳在 inline 模式下仍可用（`execCommand('insertImage')` 插入游標位置）

bump 5.6.1 → 5.7.0

## v5.6.1 — fix(newsletter): 匯入時語言非強制，只產生 manifest 有的語言版本（2026-05-06）

### 變更項目
- Newsletter 匯入現在只需要提供至少一種語言的內容（原本強制三語）
- `TrilingualText` 改為 `Partial<Record<Lang, string>>`，驗證只要求一種語言非空
- 匯入流程自動偵測 manifest 中哪些語言有內容，只為那些語言建立草稿 campaign
- `preview_text` 改為使用第一個可用語言的 intro（不再 hardcode `zh-TW`）

bump 5.6.0 → 5.6.1

## v5.6.0 — feat(contacts): 欄位顯示切換 + met_at + 建立時間 filter（2026-05-06）

### 新功能
- 聯絡人列表新增欄位顯示切換（filter bar 右側 ☰ 按鈕），設定存 localStorage
  - 可顯示/隱藏：公司、職稱、Email、Tags、認識於、建立者、建立時間
  - 預設隱藏「建立者」，預設顯示「認識於」
- 新增「建立時間」日期區間 filter（from / to）
- 修補 2 個缺失的 i18n key（`batchEditTitle`、`noResults`）補齊三語

bump 5.5.3 → 5.6.0

## v5.5.1 — docs(email): 新增 crm@bcc.cancerfree.io BCC 地址（2026-05-06）

`bcc.cancerfree.io` domain 下的所有地址均路由至同一 SendGrid Inbound Parse webhook，無需額外設定。
`crm@bcc.cancerfree.io` 現為官方支援的第二個 BCC 捕捉地址（與 `inbox@bcc.cancerfree.io` 等效）。

### 支援的 BCC / 轉寄地址

| 地址 | 用途 |
|---|---|
| `inbox@bcc.cancerfree.io` | 原始 BCC inbox |
| `crm@bcc.cancerfree.io` | CRM 專用別名（等效） |

bump 5.5.0 → 5.5.1

## v5.5.0 — feat(newsletter): TipTap 視覺編輯器（2026-05-06）

### 新功能
- 電子報編輯頁加入「視覺編輯」tab（TipTap WYSIWYG）
  - Toolbar：粗體、斜體、底線、H1/H2/H3、項目符號、編號清單、靠左/置中/靠右、連結、分隔線、插入圖片
  - 圖片上傳在視覺編輯模式下也可用，上傳後自動插入游標位置
  - 切換到視覺編輯時若內容含 `<table>` 版型，彈出提示（AI 撰寫的 table 排版可能簡化）
- 原「編輯」tab 改名為「HTML」，更明確

### 新增檔案
- `src/components/NewsletterTipTapEditor.tsx`

### 修改檔案
- `src/app/(dashboard)/admin/newsletter/quick-send/[id]/page.tsx`

bump 5.4.0 → 5.5.0

## v5.4.0 — feat(inbound-email): BCC 新聯絡人自動判國家 + Hunter.io 補全（2026-05-05）

### 新功能
- **國家自動判斷**：`findOrCreateContactByEmail` 建立聯絡人時，從 email domain TLD 推算 `country_code`（`.jp`→JP、`.tw`→TW、`.de`→DE 等 40+ 個國家；`.com`/`.io` 等通用 TLD 留空）
- **Hunter.io 自動補全**：BCC/Forward 觸發建立**新**聯絡人後，背景呼叫 Hunter.io domain-search API，補填空白的姓名、職稱、公司、LinkedIn、電話；補完後寫一筆 system interaction_log；使用 Next.js `after()` 在回應後執行，不影響 SendGrid webhook 的回應速度
  - 免費信箱（gmail、yahoo、outlook 等）跳過
  - `HUNTER_API_KEY` 未設定時靜默跳過
  - 只補空白欄位，不覆蓋已有資料

### 新增檔案
- `src/lib/emailDomainToCountry.ts` — TLD → ISO country code mapper
- `src/lib/hunterEnrich.ts` — Hunter.io domain-search 補全函式

### 修改檔案
- `src/lib/findOrCreateContactByEmail.ts` — 建立時寫入 country_code
- `src/app/api/sendgrid/inbound-parse/route.ts` — 新聯絡人建立後觸發 Hunter enrichment

bump 5.3.2 → 5.4.0

## v5.3.2 — fix(contact): 「清除狀態」按鈕清三層 + 在 derived 情況也顯示（2026-05-05）

### 痛點
Sean Liu (`ir@acepodiabio.com`) 沒寄過、沒退訂，卻被標退訂。原因：他有兩個重複 contact，當其中一個被軟刪除時 trigger 觸發、寫了一筆到 `newsletter_unsubscribes`（懷疑當時兩個都暫時被刪、guard 沒擋住）。然後 contact 詳情頁的「清除狀態」按鈕**只在 contact.email_status 直接設定時才顯示**，derived 狀態（從 newsletter_unsubscribes 讀的）按鈕直接被隱藏，user 沒辦法手動清。

### 改動
- 新 endpoint `POST /api/contacts/[id]/clear-unsubscribe`：一次清三層
  1. `contacts.email_status = NULL`
  2. `DELETE FROM newsletter_unsubscribes WHERE email = ?`
  3. `UPDATE newsletter_subscribers SET unsubscribed_at = NULL WHERE email = ?`
  4. 寫 system interaction_log 記錄誰清的
- 「清除狀態」按鈕**永遠顯示**（不論直接設定或 derived），呼叫新 endpoint，confirm dialog 說明會清三層

### 順便修
Sean Liu 的錯誤退訂手動清掉。

bump 5.3.1 → 5.3.2

## v5.3.1 — fix(db): 補回 users 表 SELECT GRANT，11 個表 RLS 連動修好（2026-05-05）

### 痛點
`/admin/newsletter/campaigns` 突然顯示「目前沒有電子報」（其實 5 個都還在）。直接打 anon key 查回 `permission denied for table users`。

### Root cause
`users` 表 anon/authenticated 不知何時被 revoke 了 SELECT GRANT（其他 INSERT/UPDATE/DELETE 都還在）。但很多 RLS policy 用 inline `EXISTS (SELECT FROM users ...)` 子查詢檢查 super_admin 身分，子查詢以呼叫者身分執行，permission denied 整個母 query 跟著炸。

連帶受影響的表（11 個）：camcard_pending, failed_scans, feedback, gmail_oauth, newsletter_blacklist, newsletter_campaigns, newsletter_recipients, newsletter_unsubscribes, pending_contacts, report_schedules, user_prompts

### Fix
Migration `restore_users_select_grant`：`GRANT SELECT ON public.users TO anon, authenticated`。

`users_select` RLS policy 本來就是 `qual=true` 開放讀，恢復 GRANT 不增加實際暴露面。

bump 5.3.0 → 5.3.1

## v5.3.0 — feat(email): Email 復活頁面 + bot 換工作偵測（2026-05-05）

### 痛點
寄電子報時 SendGrid 回 37 筆 hard bounce（聯絡人換工作後舊 email 失效）。手動到每個聯絡人頁面更新 email 太累。希望系統能：
1. 集中看哪些聯絡人 email 壞了 + 找到「換工作後」的新名片
2. Bot 拍新名片時，若同名既有聯絡人 email 已 bounce，主動建議用新 email 覆蓋

### 改動
**新頁面 `/admin/email-recovery`**：
- 列所有 `email_status` 非 null 的 contacts (bounced/invalid/unsubscribed/...)
- 對每筆撈最近的 system 退信事件（時間 + SendGrid 原因）
- 找候選「同名 + 較新建立」的 live contacts (可能是換工作後的新名片)
- 一鍵替換：`UPDATE contacts SET email = NEW, email_status = NULL`，舊 email + 換寄 reason 寫進 notes，可選擇順手 soft-delete 新建的重複聯絡人
- API: `GET /api/admin/email-recovery` + `POST /api/admin/email-recovery/apply`

**Bot 同名偵測強化** (`/api/bot/route.ts`)：
- 偵測到既有同名聯絡人時，多撈 `email_status`
- 若舊 email 是 bounced/invalid 且新名片有不同 email → 訊息加提示
  「🔧 既有聯絡人 email (xxx) 狀態為 bounced，建議「換工作」用新 email 覆蓋」
- 「🔧 更新 email」按鈕在這種情況下**排到第一順位**

**`mergeIntoContact` replace mode** (`/lib/merge-into-contact.ts`)：
- 當 mode='replace' 且 email 被覆寫，自動清掉 `email_status` (重置驗證狀態)

### Sidebar nav
加 `Email 復活` 連結（i18n: zh-TW / en / ja）。

bump 5.2.0 → 5.3.0

## v5.2.0 — feat(newsletter): per-chunk interaction_logs + drop FK + 重寄分流（2026-05-05）

### 痛點
5/5 寄五月中文 newsletter，sent_count=966 但 mycrm interaction_logs **0 筆**，完全沒紀錄誰收到了。為了不重寄，必須打 SendGrid Activity API 重新撈出 967 個收到的 email、人工分 list。

### Root cause（兩個 bug 疊加）
1. **FK 弄錯**：`interaction_logs.campaign_id` FK 指向 `email_campaigns`，但 newsletter 寫的是 `newsletter_campaigns.id` → INSERT FK 違反、route 沒檢查 error 直接 swallow
2. **Post-loop 寫入 timeout**：interaction_logs 寫在 SendGrid loop 之後一次寫；如果 chunk 多 + Vercel function 接近 300s timeout，post-loop 整段沒跑、log 全失

### 改動
1. **DB migration `drop_interaction_logs_campaign_id_fk`**：drop FK，campaign_id 之後可指 email_campaigns 或 newsletter_campaigns
2. **send route 改 per-chunk write**：每個 chunk SendGrid 成功就立刻寫 interaction_logs，不等所有 chunk 跑完。Function timeout 時，已成功 chunk 的 log 都已落盤
3. **chunk 失敗的 log 寫入錯誤** push 到 errors 陣列，return 給前端可見
4. **資料修復**：5/5 已寄 967 個 email backfill 進 interaction_logs（965 有 contact_id，2 個 test 沒 match）；切 1966 list 為 `202505-ch-sent` (965) + `202505-ch-pending` (1001) 兩個 list

### 結果
campaign reset 到 draft，list_ids 改成 ch-pending 那一條，user 重點正式寄送只會寄 1001 個還沒收到的。

bump 5.1.5 → 5.2.0

## v5.1.5 — fix(newsletter): 建立清單時 backfill orphan subscriber 的 contact_id（2026-05-05）

### 痛點
v5.1.4 改 email-first 之後寄信沒卡，但 user 點 list 詳情看到「35 個沒對應聯絡人」——明明從 contacts 建的怎會有 orphan？

### Root cause
from-contacts 用 email 找到既存 subscriber 就用，**但沒檢查那個 sub 的 contact_id**。如果該 sub 是過去 CSV 匯入的 orphan（contact_id IS NULL），加進新 list 後仍然是 orphan，UI 顯示「無對應聯絡人」。

例子：`ctyeh@s.tmu.edu.tw` subscriber 是 4/25 CSV 匯入的（無 contact_id），但 contacts 表裡有葉淇臺 contact 用同個 email。建 list 時撈到這個 orphan sub，沒幫它連回 contact。

### 改動
- `from-contacts/route.ts` Step 1 多撈 `contact_id`，加 Step 1b：對 email 找到的 sub 若 `contact_id IS NULL`，update 補上 contact 的 id
- 資料修復：May 中文 list 35 個 orphan subscribers 全部 backfill contact_id

bump 5.1.4 → 5.1.5

## v5.1.4 — fix(newsletter): 「建立清單」改 email-first 抓 contact + 清掉 19 筆髒 subscriber（2026-05-05）

### 痛點
從 /contacts 篩語言「建立清單」時，後端先用 `contact_id` 查既存 subscriber，找到舊的就直接用——不管它的 email 是不是對的。結果 4 月 CSV/Ragic 匯入時帶進來的髒 email（jadecha、mandylio u@、ir@acepodiabio@com 之類）跟著被收進新的 list 寄信用，SendGrid 就拒收整批。

### 改動
1. **`/api/newsletter/lists/from-contacts/route.ts`**：拿掉 contact_id 預查，永遠走 email lookup。subscriber 身分以 contact 上的 email 為唯一準。任何「subscriber 表還留著的舊髒 email」永遠不會再被新 list 撈進去。
2. **資料修復**：subscribers 全表掃，22 筆壞 email 全部處理：
   - 12 筆有對應 contact + 對應正確 email：list memberships 換綁到乾淨的 subscriber、刪掉壞的（含 mandyliou、jadechng、Sean Liu 還有過去匯入殘留的 9 筆）
   - 10 筆查無 contact 的亂碼：直接從 list 移除 + 刪 subscriber

### 結果
subscribers 表現有 0 筆 email 不合 regex `^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$`。

bump 5.1.3 → 5.1.4

## v5.1.3 — fix(newsletter): 過濾格式錯誤 email + UI 顯示（2026-05-05）

### 痛點
v5.1.2 後寄信進度走到 SendGrid，但 chunk 0 整個 1000 封被拒收：`personalizations.147.to.0.email "Does not contain a valid address"`。SendGrid 對 personalizations 是 all-or-nothing — 一個 email 格式錯誤整批 1000 都不寄。

### Root cause
有 3 筆 subscriber 資料髒：
- `ir@acepodiabio@com`（多 @）
- `mandylio u@cyff-charity.org.tw`（local part 有空白）
- `jadecha`（沒 @ 沒 domain）

### Fix
- send route 在組 personalizations 前先用 regex 驗 email 格式，filter 出無效的，回傳 `invalidEmails` 陣列
- UI banner 顯示「跳過 N 個格式錯誤 email：xxx, yyy, ...」
- DB 上把這 3 筆 subscribers 標 `unsubscribed_at`，linked contacts 標 `email_status='invalid'`，下次寄信不會再卡

bump 5.1.2 → 5.1.3

## v5.1.2 — fix(newsletter): membership 查詢 Supabase 1000-row 預設限制 + UI 露出實際錯誤（2026-05-05）

### 痛點
v5.1.1 修了 `.in()` URL 截斷後，user 重試結果回 `已寄出：0/1000（1 個 chunk 錯誤）`。但 list 有 1966 訂閱者，total 應該是 1966 不是 1000。Status 設成 sent / sent_count=0，每封信都沒寄出去。

### 兩個 root cause
1. **Supabase 預設 select 上限 1000 row**：`newsletter_subscriber_lists` 那 list 有 1966 個會員，但 `.in('list_id', listIds)` 只回 1000，後續 chunked 處理也只看到 1000。改用 `.range()` 分頁抓滿。
2. **UI 只 show「N 個 chunk 錯誤」**：實際 SendGrid 回什麼錯不知道。改成 show 第一筆錯誤訊息，並 console.error 全部錯誤。

### 改動
- `/api/newsletter/campaigns/[id]/send/route.ts` membership 查詢改 paginate（`.range()`，1000/page）
- `quick-send/[id]/page.tsx` 寄信完 banner 顯示第一筆錯誤訊息

bump 5.1.1 → 5.1.2

## v5.1.1 — fix(newsletter): 寄送 1000+ 訂閱者時 .in() URL 超 32KB 被截斷（2026-05-05）

### 痛點
寄五月中文 newsletter 給 1966 訂閱者，回 `no valid recipients after filters`。但 SQL 直查確認那 1966 全部 active、無人退訂、無 blacklist。

### Root cause
`/api/newsletter/campaigns/[id]/send/route.ts` 三處 `.in()` 用整個陣列當參數：
- `.in('id', subIds)` — 1966 個 UUID
- `.in('email', emails)` × 2（blacklist + unsubscribes）— 1966 個 email

PostgREST URL 上限 ~32KB，1966 個 UUID 大概 70KB 直接被靜默截斷 → `rawSubs` 回 empty → recipients = 0 → 報錯。同類 bug 之前在其他 route 都修過，這一條漏網。

### Fix
把三處 `.in()` 都用 `chunkedIn()` helper 拆成 200 個一批，loop 起來合併結果。

bump 5.1.0 → 5.1.1

## v5.1.0 — feat: email thread 保留前一封 + 認識地點改 datalist（2026-05-05）

### email_body 保留前一封信當 context
v5.0.3 把 quoted thread 整段砍掉，但 user 反映「沒有上下文不知道對方上一封寫什麼」。改成 **保留 1 層 quote**：

`stripQuotedReply()` 改用 quote-level 計數：
- Level 0：最新回覆內容（保留）
- Level 1：前一封信內容（保留 — 這是新的）
- Level 2+：cut

只計 `From: + Sent:` block 跟 Gmail-style `On ... wrote:` 為 quote-start trigger（避免 underscore + From: 被當兩層）。

### /contacts 認識地點 filter 改 datalist
原本只是 free-text input，user 不知道既存值有哪些。改成 HTML5 `<datalist>`：
- 點 input 出 dropdown，列出資料庫所有 met_at 值（按出現次數排序）
- 仍可自由輸入新值（datalist 是建議不是限制）
- 加 `trim()` 處理頭尾空白

bump 5.0.3 → 5.1.0（兩個 user-facing feature 變更）

## v5.0.3 — fix(email): inbound parse 砍 quoted thread + 顯示 To/Cc（2026-05-05）

第一封實際 BCC 進來的信（Eva 寄給 Kenji Miyoshi）暴露兩個問題：
1. 整個 reply thread 都被當成 email_body 存進去，又長又雜
2. interaction_log 看不到誰被 Cc

### 改動
- `stripQuotedReply()` 強化：
  - 切 Outlook 那串 `____________` 分隔線
  - 切 `From:` / `寄件者:` / `差出人:` 後接 `Sent:` / `傳送日期:` / `送信日時:` 的 reply quote header（多語）
  - 切 `--- Original Message ---` / `--- Forwarded message ---` / `原始郵件` / `転送メッセージ`
  - 保留原本 Gmail-style `On ... wrote:`
- 新增 `buildHeaderBlock()`：產出 `From: ... / To: ... / Cc: ...` 區塊
- inbound-parse route 把 header block prepend 到 `email_body` 開頭，user 看到一筆 log 就知道 To 跟 Cc 是誰

### email_body 新格式
```
From: Eva Hung <eva.hung@cancerfree.io>
To: Kenji Miyoshi <kenji@example.com>
Cc: Bob <bob@example.com>, Alice <alice@example.com>

---

[user's actual reply content; thread chain stripped]
```

bump 5.0.2 → 5.0.3

## v5.0.2 — fix(email): inbound parse 強制 From 必須是 cancerfree.io（2026-05-05）

5.0.1 的 fallback 邏輯允許「外部寄件人 → 直接寄到 inbox@bcc.cancerfree.io」也會被當 inbound 紀錄並建立聯絡人 —— 這代表外人可以塞假聯絡人到 CRM。

改成嚴格模式：**只有 From 是 `@cancerfree.io` 的信才會被處理**，其他全部 400 拒絕。

不影響的場景：
- 員工在 Outlook BCC：From = 員工 cancerfree.io address ✓
- 員工在 Outlook 轉寄外部來信：From = 員工 cancerfree.io address ✓（原始寄件人從轉寄 body 抓）

bump 5.0.1 → 5.0.2

## v5.0.1 — fix(email): inbound 改用 SendGrid Inbound Parse（2026-05-05）

v5.0.0 假設 Cloudflare Email Routing 可以掛 sub-zone，但 CF 免費版只支援 root domain（subdomain zone 是 Enterprise 才有）。改用 SendGrid Inbound Parse —— SendGrid 既有 plan 已涵蓋，subdomain MX 直接支援。

### 改動
- 新檔：`src/app/api/sendgrid/inbound-parse/route.ts` — 接 SendGrid 多重 form-data，從 `email` 欄位讀 raw MIME（dashboard 要勾 "POST raw"）
- 刪掉：`src/app/api/inbound-email/route.ts` + 整個 `workers/inbound-email/` 目錄
- middleware skiplist 已含 `/api/sendgrid/*`，不用再額外加
- Auth 從 `X-Inbound-Secret` header 改成 URL `?key=` query（SendGrid Inbound Parse 不簽 request，URL secret 是標準做法）

### Setup（user 端）
1. SendGrid Dashboard → Settings → Inbound Parse → Add Host
   - Receiving domain: `bcc.cancerfree.io`
   - Destination URL: `https://crm.cancerfree.io/api/sendgrid/inbound-parse?key=<INBOUND_PARSE_SECRET>`
   - 勾 "POST the raw, full MIME message"
   - 支援 BCC 地址：`inbox@bcc.cancerfree.io`、`crm@bcc.cancerfree.io`（domain 層級設定，所有 `*@bcc.cancerfree.io` 皆生效）
2. Cloudflare DNS（cancerfree.io zone）加一筆：
   - `bcc` MX `mx.sendgrid.net` priority 10
3. Vercel env：`INBOUND_PARSE_SECRET`、`ORG_EMAIL_DOMAIN=cancerfree.io`、`BCC_INBOX_DOMAIN=bcc.cancerfree.io`

bump 5.0.0 → 5.0.1

## v5.0.0 — feat(email): Outlook BCC/forward → CRM 自動 capture（2026-05-05）

### 痛點
mycrm 只記錄自己寄出的信（broadcast、newsletter）。Eva 跟團隊每天用 Outlook 跟外部聯絡人對話，這些互動沒進 CRM，聯絡人 timeline 等於少了一大半。

### 設計
利用 Cloudflare Email Routing + Email Worker（免費）：

- 在 Outlook 寄信時 BCC `inbox@bcc.cancerfree.io` → 該信進 CRM 變一筆 outbound interaction
- 收到別人來信，從 Outlook 轉寄到 `inbox@bcc.cancerfree.io` → 該信進 CRM 變一筆 inbound interaction
- 對方 email 不在 CRM 自動建新聯絡人（source=`inbound_email`、importance=medium）

```
Outlook → BCC → CF Email Routing → Email Worker
                                       ↓
                         POST raw MIME + X-Inbound-Secret
                                       ↓
                         /api/inbound-email/route.ts
                                       ↓
              mailparser → identify org user + counterparties
                                       ↓
              find-or-create contacts + insert interaction_logs
```

### 改動
- **DB**：`interaction_logs.direction text CHECK ('inbound'|'outbound')`，既有 type='email' 全 backfill 為 outbound
- **新檔案 (Vercel)**：
  - `src/app/api/inbound-email/route.ts` — webhook
  - `src/lib/findOrCreateContactByEmail.ts` — 找/建聯絡人
  - `src/lib/parseEmailHeaders.ts` — `extractForwardedFrom` / `stripQuotedReply` / `isForwardedSubject`
- **新檔案 (Worker)**：`workers/inbound-email/`（wrangler.toml + src/index.ts ~30 行 + README）
- **修改**：`src/middleware.ts` skiplist 加 `/api/inbound-email`
- **依賴**：新增 `mailparser` + `@types/mailparser`

### Env vars 要設
- `INBOUND_PARSE_SECRET`（Vercel + Worker secret 同值）
- `ORG_EMAIL_DOMAIN`（default `cancerfree.io`）
- `BCC_INBOX_DOMAIN`（default `bcc.cancerfree.io`）

### 一次性設定（user 手動，看 `workers/inbound-email/README.md`）
1. Cloudflare 加 sub-zone `bcc.cancerfree.io`，parent zone 加 NS records 委派
2. 在 sub-zone 開 Email Routing，custom address `inbox@bcc.cancerfree.io` → Send to Worker
3. `cd workers/inbound-email && wrangler deploy`

### V1 範圍
做：手動 BCC outbound、轉寄 inbound、自動建聯絡人、純 text body。
不做：附件存 storage、thread 串聯、M365 transport rule 自動 BCC（V2 評估）。

bump 4.19.7 → 5.0.0（MAJOR 因為 MINOR 早就過 9，按 CLAUDE.md 規則）

## v4.19.7 — fix(db): 軟刪除 trigger 在去重情境下誤退訂同 email（2026-05-04）

### 痛點
v4.4.1 的 `trg_unsubscribe_on_contact_soft_delete` 在偵測 contact 軟刪除時自動把 email 加進退訂表，但沒檢查「同 email 是否還有活著的其他 contact」。
去重合併時敗北方被軟刪除 → trigger 觸發 → email 整個進退訂表 → 勝出方（還活著、想繼續收信）也被誤殺。實際 case：Eva 注意到 yohei.uema@oist.jp 收不到信，查出來是 v4.4.1 部署當天的 backfill 把 77 個去重敗北的 contact 全寫進退訂表。

### 改動
- Trigger 函式 `unsubscribe_on_contact_soft_delete()` 加 guard：若同 email 還有 `id != NEW.id AND deleted_at IS NULL` 的 contact，跳過退訂。未來去重不會再誤殺。
- 一次性回復 77 筆 v4.4.1 backfill 誤退訂的紀錄：
  - `DELETE FROM newsletter_unsubscribes WHERE source = 'contact_soft_delete_backfill'`
  - 對應的 66 個 `newsletter_subscribers.unsubscribed_at` 清空（時間戳跟 contact deleted_at 一致才清，避免誤動其他真退訂）

bump 4.19.6 → 4.19.7

## v4.19.6 — feat(camcard): met_at/met_date 完整流通 confirm + update route（2026-05-04）

### 變更項目
- `camcard/[id]/confirm/route.ts`：`OCR_TO_CONTACT` 加入 `met_at`、`met_date`，確認時自動寫入 contacts 欄位
- `camcard/[id]/update/route.ts`：改為 merge 模式，保留 `met_at`、`met_date`、`referred_by` 不被手動編輯覆蓋
- `scripts/camcard-import/batch-import-kevin.js`：新 Kevin 匯入腳本，從子資料夾名稱自動提取日期、呼叫 Gemini OCR、assignee_label='Kevin'

## v4.19.5 — fix(camcard): similar 重複只警告不鎖定，允許直接新增（2026-05-04）

### 變更項目
- `admin/camcard/page.tsx`：新增 `isBlocked` 變數（僅 `exact_email` 才鎖定），`similar` 名稱重複仍顯示黃色警告但「新增」按鈕與 checkbox 不再 disabled

## v4.19.4 — fix(pending): super_admin 可審核任何人的待審名片（2026-05-04）

### 變更項目
- `contacts-pending/[id]/route.ts`：`getAuthUserId` 額外查詢 `role`，`fetchOwnedPending` 加入 `isSuperAdmin` 參數；super_admin 跳過 `created_by` ownership check，可直接新增/合併/刪除其他使用者掃描的名片

## v4.19.3 — fix(newsletter): RSS feed regex 太貪心、把內文也吃掉（2026-05-03）

v4.19.2 的 `stripEmailSkeleton()` regex 從「外層 `<tr>` 開始 + 內層 `</tr>` 結束」匹配，結果整個外層 wrapper TR 連帶內層 header/intro/stories/footer 全被吃掉，RSS 出來只剩 `<table></table>` 空殼。

實際 layout：外層 `<tr><td align="center">` 包一個內層 table，內層有 4 個 TR — header（td 帶 `border-bottom:1px solid #EEEEEE`）、intro、stories、footer（td 帶 `border-top:1px solid #EEEEEE`）。

新 regex 改成 anchor 在內層 TD 的 border style 上：

```
<tr[^>]*>\s*<td[^>]*style="[^"]*border-bottom:1px solid #EEEEEE[^"]*"[^>]*>[\s\S]*?</td>\s*</tr>
```

`<tr>` 後緊接 `<td>` 帶特定 border，再 lazy 到該 td 的 `</td></tr>`。內層 header/footer TD 沒有 nested table，這個 lazy match 會停在正確位置。

bump 4.19.2 → 4.19.3

## v4.19.2 — fix(newsletter): RSS 清掉 email skeleton + 圖檔匯出 PNG→JPEG（2026-05-03）

### Substack RSS 內文太肥
RSS feed 把整封 email skeleton（logo header + social-icon footer + 「CancerFree Biotech · Taipei, Taiwan」尾標 + 退訂連結）都送出去了，Substack 匯入後底部出現直立排列的 social icons，logo 也重複。

`/api/newsletter/feed.xml` 加 `stripEmailSkeleton()`：regex 把首列（含 logo 的 `<a href="cancerfree.io">` 那一 `<tr>`）跟尾列（border-top + social + unsubscribe 那一 `<tr>`）整段移除，只保留 intro + stories 給 RSS。

### 圖檔匯出檔太大
原本 PNG + 2x devicePixelRatio scale → 5-15 MB。改成：
- scale 從 `min(dpr, 2)` 降到 `min(dpr, 1.5)`（Retina 還夠銳）
- output 從 `image/png` 改 `image/jpeg quality=0.85`（newsletter 多照片，JPEG 比 PNG 小 ~70% 無感差）
- 副檔名 `.png` → `.jpg`

預期 5-15 MB 圖檔降到 ~1-3 MB。

PDF 大小不在這次處理範圍 — 要做的話需要圖片上傳時 pre-process（rotate per EXIF + resize），會是另一個 sprint。

bump 4.19.1 → 4.19.2

## v4.19.1 — fix(newsletter): Substack 三個障礙修光（2026-05-03）

User 試 v4.19.0 三個按鈕，發現：
1. 「複製內文 HTML」貼到 Substack 變成裸 HTML 文字（不是渲染的 rich content）
2. 「Substack 連結」URL import 失敗
3. RSS import 找不到文章

Root cause：
- (1) `navigator.clipboard.writeText()` 只寫 `text/plain`，rich-text 編輯器需要 `text/html` 才會渲染
- (2)(3) middleware 把 `/newsletter/view/*` 跟 `/api/newsletter/feed.xml` 也擋了 → 未登入的 Substack scraper 被 redirect 到 `/login`，看不到內容

修法：
- middleware 加白名單：`/api/newsletter/feed.xml` 跟 `/newsletter/view/*` 不需要 auth
- 「複製內文」改用 `ClipboardItem` 同時寫 `text/html` 和 `text/plain` mime types，Substack 編輯器收到 HTML 自動渲染為格式化內容
- 按鈕 label 從「內文 HTML」改成「複製內文」（rich text 行為更名實相符）

bump 4.19.0 → 4.19.1

## v4.19.0 — feat(newsletter): Substack 友善複製按鈕（2026-05-03）

quick-send 加 2 個按鈕簡化貼到 Substack：

1. **🔗 Substack 連結** — 複製 `crm.cancerfree.io/newsletter/view/{slug}` 公開連結到剪貼簿。貼到 Substack「Import from URL」讓它自動 scrape。需 published（published_at IS NOT NULL）才能用。
2. **📋 內文 HTML** — DOMParser 解析 content_html，移除 logo header / social icon footer / unsubscribe links / 「CancerFree Biotech · Taipei, Taiwan」尾標，留下 intro + stories 純內文 HTML 到剪貼簿。可貼到 Substack 編輯器的 HTML / Source 模式。

兩種互補：URL import 是 Substack scrape 自動處理，HTML 直接貼是手動但完全控制格式。

bump 4.18.1 → 4.19.0

## v4.18.1 — fix(newsletter/print): 移除 Supabase image transform（EXIF 被破壞）（2026-05-03）

User 回報「story 裡圖檔在 HTML 裡就被裁掉」— 查到原 zip 圖是 5712×4284 landscape (EXIF Orientation=6 旋轉 90° 顯示為 4284×5712 portrait)，但 Supabase `/storage/v1/render/image/public/?width=1200` 處理 EXIF 錯誤，輸出 1200×5712 極端 portrait（5712 變成高度而非寬度）。

quick-send 頁的 iframe srcDoc 用 `previewHtml`（會跑 transform），所以連 HTML 預覽都看到變形圖。

移除 image URL transform，圖片走原 storage URL。瀏覽器會自動套 EXIF rotation 顯示正確 portrait。PDF 檔大小回到 ~3-4 MB（比 transform 過後大 ~2 MB，可接受換正確性）。

bump 4.18.0 → 4.18.1

## v4.18.0 — feat: 三件套（duplicates 批次合併 + promo 三語匯入 + PDF 130mm）（2026-05-03）

1. **`/admin/duplicates` 真正的批次合併**：原本只能批次標記非重複，現在每對左右兩側 + 非重複 各有獨立 checkbox。勾「保留左」進合併佇列、保留右同理、X 進非重複佇列。Toolbar 顯示「N 對合併、M 對非重複」+ 「執行批次」一次跑完（合併走 sequential `/api/contacts/[id]/merge`，ignore batched 200/批）。Progress 計數顯示。

2. **Promo 三語批次匯入**：quick-send 頁原本要切到 zh/en/ja 各 campaign 各填一次。新增「三語批次匯入」紫色按鈕，modal 一次貼 3 語，後端 `POST /api/newsletter/campaigns/[id]/promo-batch` 解析 slug 找出三個 sibling campaigns（period+stamp 相同）一次更新 promo_text。

3. **PDF max-height 200 → 130mm**：v4.17.0 改成 200mm 後 PDF 變 11 頁、圖過大。降到 130mm 約 46% A4 內容高，讓多 story 能擠在同頁。aspect ratio 維持，沒裁切。

bump 4.17.1 → 4.18.0

## v4.17.1 — feat(duplicates): 多選批次標記為非重複（2026-05-03）

`/admin/duplicates` 每對重複聯絡人加 checkbox。≥1 對被勾選時，頁首出現 sticky 工具列：
- 「全選 N 對」/「取消全選」
- **「標記為非重複（N）」** 一次處理所有勾選的（200/批 PostgREST update）
- 「取消」清空選擇

合併動作仍然單對處理（每對需要選擇保留哪邊，無法批次）。i18n 三語加 6 keys。

bump 4.17.0 → 4.17.1

## v4.17.0 — feat(newsletter): LINE 宣傳短文 + 回 v4.15.4 PDF CSS（2026-05-03）

### Two changes
1. **PDF CSS 回 v4.15.4 風格**（user 說 "輸出的 PDF 大概是 7 頁 看起來檔案圖檔沒有被壓縮到 分頁也還可以接受"）：story img max-height 200mm + object-fit contain + 文字自由 flow，logo / icons 維持 HTML width 屬性的尺寸。
2. **新增 LINE 宣傳短文功能**：
   - DB migration: `newsletter_campaigns.promo_text TEXT`
   - skill manifest 加 optional `promo: { zh-TW, en, ja }`（80-150 字 plain text）
   - SKILL.md Mode C 新增 step 3a 指示 Claude 產 promo
   - example-manifest.json 加範例
   - `POST /api/newsletter/import` 把 `manifest.promo[lang]` 寫進對應語系 campaign
   - `GET / PATCH /api/newsletter/campaigns/[id]` 包含 promo_text 欄位
   - quick-send 頁多一個 textarea「LINE / 群組宣傳短文」+「複製」+「儲存」按鈕，可手動編輯也可從 skill 自動帶入

bump 4.16.1 → 4.17.0

## v4.16.1 — fix(newsletter/image): footer social icons 在匯出圖片強制 inline（2026-05-03）

匯出 PNG 時 footer 3 個 social icon 變垂直堆疊。html2canvas 對 inline `<a><img></a>` 渲染不正確。加注 `<style>` 塊強制 `a:has(>img[width])` 跟 `img[width="24"]` 用 `display: inline-block`，icons 改回橫向。

bump 4.16.0 → 4.16.1

## v4.16.0 — feat(newsletter): 匯出整個 newsletter 為單張長圖（2026-05-03）

PDF 分頁的取捨太多（圖片大小 vs 留白 vs 跨頁），user 直接要新功能：HTML 整封渲染成一張 PNG（不分頁），適合貼 LINE / Substack / 公司群組等場景。

quick-send 頁加「匯出圖片」按鈕（FileDown 旁），用 `html2canvas` 把 contentHtml 在離屏 600px 寬容器渲染後輸出 PNG，scale 跟著 devicePixelRatio（最多 2x，retina 也清晰），檔名同 `Newsletter-{slug}.png`。處理中按鈕顯示 spinner。

deps: `html2canvas` ^1.4.1

bump 4.15.10 → 4.16.0

## v4.15.10 — fix(newsletter/print): 圖片 max-height 160mm + 文字自由 flow（2026-05-03）

v4.15.9 回滾後 PDF 變 20 頁（"上月回顧" 4 字單獨佔一整頁）— 因為 tr/td/story-div 的 page-break-inside avoid 把 story 整塊推下去留白。

新策略 — user 要求「照片不要跨頁，擠到前一頁空白處」：
- `img { max-height: 160mm; break-inside: avoid }` — 圖片夠小（A4 內容 281mm 的 ~57%）能放進大部分剩餘空間，且保留「不切圖中間」防護
- 拿掉 `tr/td/story-div { break-inside: avoid }` — 文字段落自由 flow，不會整塊推下頁
- `img[width] { max-height: none }` — logo / social icons 的 HTML width 屬性繼續生效

預期 portrait 照（aspect 0.5-0.6）：寬 80-100mm，高 160mm，可隨段落 inline 放入。Landscape 照寬度可達頁寬，高度按比例最多 160mm。

bump 4.15.9 → 4.15.10

## v4.15.9 — revert(newsletter/print): CSS 回到 v4.15.2 給 user 比較（2026-05-03）

User 連續測新 PDF 仍覺得排版不滿意（"story 的圖 變得很窄 被截掉"），表示「要不要恢復原本的設定 比較好看看」。回滾 print CSS 中的 image / tr / td / story-div 的 `page-break-inside: avoid` 規則，讓 user 直接對比兩種策略：
- **舊（現在）**：portrait 圖被推到自己一頁，圖大但前頁空白
- **新（v4.15.3-8）**：圖隨 flow，max-height 限制寬度，portrait 偏窄但無空白

保留 logo `width=180` / icons `width=24` 屬性走 inline 不被 max-width 蓋的修正。保留 PDF metadata title 注入跟 `?width=1200` transform。

bump 4.15.8 → 4.15.9

## v4.15.8 — fix: stats `.in()` 分批 + PDF 檔名 + 圖片 max-height（2026-05-02）

### 三個修
1. **stats route**：`badContacts = .from('contacts').in('id', contactIds)` 沒分批，1500+ UUID 塞 URL 又超 PostgREST ~32 KB 限制 → 部分 contacts 抓不到 → eligible 數膨脹（quick-send 顯示 2018 但 list detail 1738）。改成 200/批分批撈。
2. **PDF 檔名**：原本 `document.title = pdfFilename` 設在 `document.close()` 之後，print dialog 開的時候 Chrome 已經抓到原本 HTML 的 `<title>{{subject}}</title>`（含中文、括號等）→ filename 變空 / 怪。改成在 previewHtml 寫入 window 前直接 replace `<title>` 內容為 `Newsletter-{slug}`，dialog 直接讀到正確值。
3. **直立照變窄**：v4.15.7 把 `max-height: 200mm` 套到 story 圖，portrait 照（aspect 0.5-0.6）寬度被算成 100-130mm，看起來窄。放寬到 260mm（A4 內容 ~281mm），portrait 可以更高 → 寬度也增加。

bump 4.15.7 → 4.15.8

## v4.15.7 — fix(newsletter/print): logo/icons 維持 HTML 屬性的尺寸（2026-05-02）

5-2.pdf logo 變超大跨大半頁。`max-width: 100% !important` 蓋掉 inline `max-width:180px`，加上 v4.15.4 transform 把 logo natural 變 1200px → 拉滿欄寬。

改成只把 `max-width / max-height / display: block / margin: 0 auto` 套到「沒有 width 屬性的 img」（user-uploaded 大圖）。logo `width="180"` 跟 icons `width="24"` 維持 HTML 屬性指定的尺寸。

bump 4.15.6 → 4.15.7

## v4.15.6 — fix(newsletter/print): logo/icons 不走 image transform（2026-05-02）

v4.15.4 把所有 Supabase storage 的 img URL 轉成 render/image+width=1200&quality=80，但 shared/ 資料夾的靜態小 PNG（logo 180px、social icons 24px）跟著被升尺寸 + JPEG 壓縮，透明背景變灰、邊緣模糊。改成只 transform 不在 `/shared/` 路徑下的圖（即使用者上傳的 story 大圖），靜態素材維持原圖。

bump 4.15.5 → 4.15.6

## v4.15.5 — fix(newsletter/print): social icons 在 PDF 維持橫向（2026-05-02）

PDF footer 的 3 個 social icon（FB / LinkedIn / Website）變直排了 — 因為 v4.15.3 給所有 img 加 `display: block`，icon 從 inline 變 block 換行。改成 `display: block` 只套到 story 大圖（沒有 width 屬性的 img），icons（width="24"）保留 inline 維持橫向。

bump 4.15.4 → 4.15.5

## v4.15.4 — feat(newsletter/print): PDF 自動命名 + 縮小檔案大小（2026-05-02）

匯出 PDF：
- **自動命名**：原本 Chrome 預設用空白 / `untitled`；改成設 `document.title = "Newsletter-{slug}"`（e.g. `Newsletter-2026-05-zh-tw-moo2zn4z`），Save as PDF 時直接帶入
- **檔案大小**：原本 5 月 PDF 4.4 MB（每張原圖 1-4 MB）。previewHtml 把 Supabase Storage `<img src="...storage/v1/object/public/...">` 自動換成 `storage/v1/render/image/public/...?width=1200&quality=80`（Supabase 的 image transform endpoint），單張圖大概縮到 200-400 KB，預期 4.4 MB → ~1-1.5 MB

bump 4.15.3 → 4.15.4

## v4.15.3 — fix(newsletter/print): 移除過度激進的 page-break 規則（2026-05-02）

實測 5 月電子報匯出 PDF 7 頁，1-3 頁大量空白：
- p1：開場段半頁 + 下半頁全空
- p2：section heading + Story 1 文字 → 後 70% 空
- p3：只有一張 OIST 直立照片，整頁就一張

原因：`img { break-inside: avoid }` + `tr/td/div { break-inside: avoid }` 太激進。tall portrait 圖片觸發 break-inside-avoid → 整張被推到下一頁 → 上一頁底部留白。

改動：
- 拿掉 `img / tr / td / story-div` 的 `page-break-inside: avoid`
- 加 `img { max-height: 200mm; object-fit: contain }` — A4 內容高 ~281mm，限 200mm 約 70% 高，留得下後續段落
- 保留 `h1-h4 { page-break-after: avoid }`（headings 還是該黏住下面）

bump 4.15.2 → 4.15.3

## v4.15.2 — fix(newsletter/stats): list 訂閱者統計分頁避免 1000 行截斷（2026-05-02）

quick-send 頁旁邊的 list 選單顯示 0 訂閱者（實際 1937）— 因為 `/api/newsletter/lists/stats` route fetch `newsletter_subscriber_lists` 沒分頁，PostgREST 預設 1000 行截斷，後幾百筆漏掉導致該 list 的累計都被算到別的 list 或丟失。

改成三個 select（memberships / blacklist / unsubscribes）都用 1000/批 paginate while-loop。

bump 4.15.1 → 4.15.2

## v4.15.1 — fix(email): 寄信按 unique email 去重，不重複寄（2026-05-02）

回報：filter 中文 2003 contacts / 1937 unique emails，按寄信會寄 2003 次（66 個 email 重複寄一遍）— 因為前後端都按 contact 數送。

- `/contacts` 寄信按鈕：點擊時先用 lowercase email 去重才存進 sessionStorage，compose 頁收到的就是 unique 收件人
- 按鈕文字從 `{contacts}` 改成 `{uniqueEmailCount}` — 顯示真正會寄的數量
- `/api/email/send` route：filter 後再做一次 server-side 去重防禦，即使前端漏掉也保證不重複寄

bump 4.15.0 → 4.15.1

## v4.15.0 — feat(newsletter/lists): 名單編輯 + CSV 匯出（2026-05-02）

`/admin/newsletter/lists` 每行多兩個按鈕：
- **Pencil（藍）**：inline 編輯名稱與備註，Enter 儲存 / Esc 取消。`PATCH /api/newsletter/lists/[id]`，slug-key 不動（保留 unsubscribe URL 穩定）
- **Download（綠）**：下載該 list 訂閱者 CSV。`GET /api/newsletter/lists/[id]/export` → email/first_name/last_name/company/source/joined_at/unsubscribed 7 欄；UTF-8 BOM 讓 Excel 開中文/日文不亂碼；unsubscribed 從 `newsletter_unsubscribes` canonical 取

三語 i18n 加 6 keys（editHint / saveFailed / nameRequired / descriptionPlaceholder / exportHint / exportFailed）。

bump 4.14.1 → 4.15.0

## v4.14.1 — feat(contacts): 排除 banner 顯示 unique email count（2026-05-02）

`/contacts` 排除 banner 從「將寄送給 71 人，自動排除 9 人：...」改成「將寄送給 71 人（X 個 unique email），自動排除 9 人：...」 — 多個 contact 共用 email 時實際寄出去的 email 數會比 contact 數少，現在一眼可見。三語 i18n 同步。建 list modal 的 uniqueEmailCount 改為共用變數。

bump 4.14.0 → 4.14.1

## v4.14.0 — refactor(unsubscribe): newsletter_unsubscribes 為 single source of truth（2026-05-02）

### 痛點
退訂狀態之前散在 3 個地方，不同 route / UI 讀不同的源：
- `newsletter_unsubscribes`（84 筆，audit log，最完整）
- `newsletter_subscribers.unsubscribed_at`（67 筆，subset）
- `contacts.email_status='unsubscribed'`（7 筆，少數手動標記）

導致 v4.13.0 寫的 from-contacts route 用 subscribers.unsubscribed_at 過濾，會漏掉 17 個沒 subscriber row 但已退訂的 email。

### 改動
**Server**：所有寄送相關判斷統一改讀 `newsletter_unsubscribes`：
- `/api/newsletter/lists/from-contacts`：filter loop pre-pass query newsletter_unsubscribes，priority 改為 blacklist > unsubscribed > no_email > opt_out > bad_status；移除 Step 4b 的 subscriber.unsubscribed_at 過濾（改在 contact 層更早攔下）
- `/api/email/send`：加 newsletter_unsubscribes pre-pass
- `/api/contacts/all`：derive `email_status='unsubscribed'` 從 newsletter_unsubscribes（之前用 subscribers.unsubscribed_at，漏 17 筆）

**前端**：`/contacts/[id]` 的 email-status banner 加 derive 邏輯 — 當 `contact.email_status` 為 null 但 `newsletter_unsubscribes` 有該 email 時，顯示 'unsubscribed' banner。derived 來源時隱藏「清除」按鈕（避免誤導）。

### 待手動執行（程式 deploy 後）
- SQL 1：sync `subscribers.unsubscribed_at` 從 newsletter_unsubscribes（保持 list-state 一致，17 筆）
- SQL 2：清空 `contacts.email_status='unsubscribed'`（7 筆 → null）

bump 4.13.0 → 4.14.0

## v4.13.0 — feat: 共用 Email 查看頁 + 退訂統一 + Modal 顯示 unique-email count（2026-05-02）

### 痛點
建 list 後使用者問：
1. 為什麼 1938 ≠ filter 中文的 2004？（不知道有 66 個 contact 跟別人共用 email）
2. 為什麼 list 還有 1 退訂？（subscriber.unsubscribed_at 跟 contact.email_status 兩層退訂沒對齊）
3. 想看到底哪些聯絡人共用 email

### 改動
**(A) 建 list 排除 subscriber 層退訂**：`POST /api/newsletter/lists/from-contacts` Step 4b 改成只撈 `unsubscribed_at IS NULL` 的 subscriber，匹配到歷史退訂者的 contact 不寫進 list。回傳 `excluded.unsubscribed_subscriber` 計數。

**(B) Modal hint 顯示 unique-email count**：建 list modal 從只顯示 `{willAdd}` 改成 `{selected/filtered} contacts → {uniqueEmails} unique emails`，使用者一眼看到「合併」會發生。三語 i18n 同步。

**(C) 新增 `/admin/shared-emails` 頁**：列出所有 ≥2 contact 共用同一 email 的群組。每行顯示 email、共用 contact 數、所有 contact 的 link。GET `/api/contacts/shared-emails` 回傳分組資料。Sidebar 加 nav 連結（grantable，要 `bulk_email` 權限）。

bump 4.12.1 → 4.13.0

### 後續還沒做
SendGrid webhook 同步 `contacts.email_status` ↔ `newsletter_subscribers.unsubscribed_at` 的整合（兩層真正合一）— 需要動 webhook handler，是另一個 sprint。

## v4.12.1 — fix(newsletter/lists/from-contacts): bulk insert 容錯（2026-05-02）

回報：2000 中文聯絡人建 list 後只有 118 人。原因：bulk `insert(chunk)` 一個 batch 中若有 email 重複（多個 CRM contact 共用 email），unique constraint 觸發整個 batch fail，後續 batch 全沒進。

改動：
- Step 3 在送進 toCreate 前先 dedupe by email（`seenInsertEmails`）
- Step 4 改用 `.upsert(chunk, { onConflict: 'email', ignoreDuplicates: true })` — citext case mismatch 或 race condition 都不會炸 batch
- Step 4b 新增：upsert 完之後再用 `IN(email)` 重新撈所有 subscriber ID（涵蓋既存與剛 upsert 的）
- Step 5 link rows 用 `seenSubIds` dedupe，避免多個 contact 共用 email 時重複插入 join row

bump 4.12.0 → 4.12.1

## v4.12.0 — feat(newsletter/lists): 刪除清單按鈕（2026-05-02）

`/admin/newsletter/lists` 每行加 trash 圖示 + inline 二次確認。刪除動作只移除 `newsletter_lists` row 跟 `newsletter_subscriber_lists` join rows，**訂閱者本體 (`newsletter_subscribers`) 跟聯絡人 (`contacts`) 都保留**。同時把該 list_id 從任何 `newsletter_campaigns.list_ids` array 中清掉，避免 dangling 引用。

API：`DELETE /api/newsletter/lists/[id]`，需 newsletter 權限。回傳 `{ ok, deleted_list_id, cleared_from_campaigns }`。i18n 三語加 namespace `newsletterLists`。

bump 4.11.5 → 4.12.0

## v4.11.5 — perf(newsletter/lists/from-contacts): bulk subscriber 操作（2026-05-02）

2000 個聯絡人建 list 時 button 轉超過一分鐘 — 原因是逐個跑 find-or-create subscriber + insert link，4000+ sequential queries。

改成 bulk 流程：
1. `IN(contact_id)` batched lookup 已存在的 subscriber
2. `IN(email)` fallback lookup（contact_id 沒匹配的）
3. bulk insert 新 subscriber（500/批）
4. bulk insert subscriber_list links（500/批）

從 4000+ queries → ~6-10 queries，2000 人應該幾秒內完成。

也設 `export const maxDuration = 300` 給 Pro plan 5 分鐘 timeout 上限（Hobby 仍 10 秒會 timeout，但 Hobby 也不會跑這量級）。

bump 4.11.4 → 4.11.5

## v4.11.4 — fix(newsletter/email): `.in('id', uuids)` 切批次避免 URL 太長（2026-05-02）

### 痛點
從 `/contacts` filter 中文（2004 個合格聯絡人）建立清單 → 後台 list 建好但 0 人加入。
debug 後發現 `service.from('contacts').select(...).in('id', body.contactIds)` 會把所有 UUID 塞進 URL query param。2000 個 UUID = 72 KB+，超過 PostgREST 預設 ~32 KB 限制 → query 靜默回空 → 後續迴圈完全沒執行 → list 空。

### 改動
- `POST /api/newsletter/lists/from-contacts`：`.in('id', batch)` 切 200 一批，迴圈累積結果
- `POST /api/email/send`：同樣修法（450+ 收件人 SendGrid 模式時也會爆）
- en + ja `docs_content/user` 完整翻譯（從原本骨架擴充到 11173/6819 chars，跟 zh 對齊）

bump 4.11.3 → 4.11.4

## v4.11.3 — fix(contacts): 建立清單套用跟寄信一致的排除（2026-05-02）

寄信按鈕會 client-filter 排除黑名單/無 email/退訂/退信/寄送異常，建 list 按鈕沒套同樣 filter — 結果是 button count 顯示 filter 後總數而不是真正會加入的數，且送 API 也送進去（雖然 server 還是會擋）。改成跟寄信一致用 `emailTargets` — button count = 真正會加入的人數，sourceIds 也只送 emailable。Modal hint 多了 `{selected/filtered, willAdd}` 變數讓使用者一眼看到差距。

zh-TW user guide 同步重寫為 v2.0（從 4067 → 6257 chars），涵蓋每個 Telegram 指令完整列表 + 每個網頁功能頁說明 + FAQ。en/ja 對應翻譯後續再做。

## v4.11.2 — feat(contacts): 建立清單支援 filter 模式（2026-05-02）

原本只能勾 checkbox 後才出現「建立清單」按鈕。改成 filter 也算數：套用 filter 但沒勾人時，按鈕也會出現，count 顯示 filter 後的總數，建 list 時用整個 filter 結果。Modal hint 跟著切換。三語 i18n 加 4 keys。

## v4.11.1 — fix(contacts): 排除分類優先級調成 blacklist 第一（2026-05-02）

報告：選「中文」一個篩選，banner 顯示「黑名單 42」，但實際 XX-tagged 中文 = 45。差 3 是因為 3 個 XX-tagged 但沒 email 的人被算去 no_email 桶。

調整優先級：blacklist > no_email > unsub > bounced > transient。黑名單 tag 的人**一律**算成黑名單，不管其他狀態（符合「打了這 tag = 永遠不寄」的心智模型）。`/contacts` UI 跟 `/api/newsletter/lists/from-contacts` 的 excluded 計數同步調整。

## v4.11.0 — feat(tags): Email 黑名單 tag 機制（2026-05-02）

某些 tag（例如「XX」）的聯絡人應自動排除於寄信和清單建立。原本沒這機制，必須手動取消勾選。改成可在 tag 層級標記任意 tag 為 Email 黑名單。

### DB
- `tags` 加 `is_email_blacklist boolean default false`
- 既有 `XX` tag 自動 set 為 true

### 後端
- `/api/email/send`：fetch contact_tags + 排除任一 `is_email_blacklist` 的聯絡人；同時補上 `email_status` 排除（之前漏）
- `/api/newsletter/lists/from-contacts`：同樣排除規則 + 回傳 `excluded.blacklist` 計數
- `/api/contacts/all`：SELECT 加 `is_email_blacklist`

### 前端
- `/contacts` 排除明細多一個分類「N 黑名單」
- `/admin/tags` 每個 tag row 多一個盾牌 icon（綠盾 = 一般，紅盾 = 黑名單），點擊切換；黑名單 tag chip 變紅底 + 紅色「黑名單」徽章

### i18n
- 三語同步加 5 keys（4 在 tags 命名空間 + 1 emailExcludedBlacklist）

bump 4.10.0 → 4.11.0

## v4.10.0 — feat(contacts): 從聯絡人選單建立 newsletter list（2026-05-02）

聯絡人頁勾選一群人 → teal 按鈕「建立清單」→ 彈 modal 輸入 list 名稱（+ 可選備註）→ 建新 newsletter_lists row + find-or-create subscribers + 加入 subscriber_lists → 跳到 `/admin/newsletter/lists/[id]`。

排除規則跟寄信一致：`!email || email_opt_out || email_status` 任一不加入。回傳 `{added, excluded: {no_email, opt_out, bad_status}}`。Key 自動從 name slugify（中文等非 ASCII fallback `list-{stamp36}`），collision 補 stamp。

權限：限有 `newsletter` granted_feature 或 super_admin（前端 button 才顯示、後端 API 也 gate）。

API：`POST /api/newsletter/lists/from-contacts`
i18n：三語同步加 11 個 key。

## v4.9.3 — feat(contacts): 寄信時自動排除明細顯示（2026-05-02）

從聯絡人寄信時系統會自動排除（無 email、退訂、退信、寄送異常），但原本沒任何提示。改成：button 上加「排除 N」小 badge，並在 toolbar 下方顯示 banner「將寄送給 X 人，自動排除 Y 人：N 無 email、N 已退訂、N 退信/無效、N 寄送異常」。`/api/contacts/all` 加 `email_opt_out` 到 SELECT，前端才能正確算入。三語 i18n 同步。

## v4.9.2 — feat(admin/users): 表頭可點擊排序（2026-05-02）

`/admin/users` 7 個欄位（姓名、Email、Telegram、Teams、Role、最後登入、MFA）都加上可點擊排序，asc/desc 切換 + chevron icon。預設依姓名 asc。Actions 欄不排序。

## v4.9.1 — fix(newsletter/import): 用對欄位名 + hasFeature helper（2026-05-02）

import route 的權限檢查讀錯欄位 — 寫成 `permissions`，但 schema 是 `granted_features`。任何非 super_admin 都會被擋成 403「Forbidden — newsletter permission required」即使有權限。改成沿用 `src/lib/features.ts` 的 `hasFeature(role, grantedFeatures, 'newsletter')`，與 PermissionGate 同步。

## v4.9.0 — feat(newsletter): import 改 browser-side 解壓 + 直連 Storage（2026-05-02）

### 痛點
第一次實測 Claude.ai 產出的 zip 拿去 import → 「Unexpected token 'R', \"Request En\"...」。debug 後發現 zip 11.2 MB（4 張原圖 332KB-4.2MB），破 Vercel function body 4.5MB 上限。Vercel 直接回 plain text `Request Entity Too Large`，前端 `res.json()` 爆。

順便發現 Claude.ai 產出 manifest 跟我訂的 schema 有 4 處出入：
1. zip 多包一層 `newsletter-2026-05/` 資料夾
2. manifest 用 `{ last_month: [], next_month: [] }` 而不是 `{ stories: [{section}] }`
3. `image_files` 沒有 `images/` 前綴
4. 部分 story 沒圖（schema 要求 1-2）

### 改動
- **`/admin/newsletter/import` page 重寫**：
  - browser 端用 jszip 解壓
  - 偵測單一 wrapping folder 自動 strip
  - 圖片直接 PUT 到 Supabase Storage（`newsletter-assets/{period}/imported/...`），不經 Vercel function
  - 只把 `manifest + imageMap` 當 JSON POST 給 API（< 50KB）
  - 三階段 progress bar（解壓 / 上傳 N/M / 建立草稿）
  - JSON parse 失敗顯示 raw text 開頭，避免「Unexpected token」錯誤
- **`POST /api/newsletter/import` 改 JSON shape**（不再吃 multipart）：
  - 接受 `{ manifest, imageMap }`
  - normalize 寬鬆：自動把 `{ last_month, next_month }` 攤平成 `stories[]`、補 `images/` 前綴
  - validate 改成允許 0-2 張圖
- **schema + SKILL.md 更新**：
  - `image_files` minItems 改 0（允許 link-only story 沒圖）
  - SKILL.md 強調 zip layout MUST 不要包資料夾、manifest MUST 用 flat stories array
- bump 4.8.3 → 4.9.0

### 為什麼要 lenient parser
即使 SKILL.md 講清楚，Claude.ai 的 model 仍可能依語意改寫 schema（例如把 last_month/next_month 當 top-level key 比較直覺）。寬鬆 parser 確保 import 不會因為 model 偶爾偏離 schema 而失敗。

## v4.8.3 — chore(skill): cross-platform zip 打包腳本（2026-05-02）

`scripts/build-skill-zip.js` 用 jszip（已在 deps）打包 skill source，Windows / macOS / Linux 都能跑。原本 README 教用 `zip -r`，Windows cmd/PowerShell 沒這指令。產出 `.zip` 已加 `.gitignore`。

## v4.8.2 — docs(skill): newsletter tone-samples 從 11 份過往電子報抽取（2026-05-02）

從 `~/Downloads/newsletter/*.txt` 抽 11 份（2026-01 到 2026-04，3 語各 4 份；2026-02 英文版原檔空缺）到 `skills/newsletter-composer/tone-samples/`，給 Claude.ai Project Knowledge 用。新增 `scripts/extract-tone-samples.js` 一次性 HTML→markdown 抽取腳本（之後新一期 newsletter 也可重跑）。README 新增「Updating tone samples」段落。

## v4.8.1 — docs(skill): brand-info v2.3 對齊 example-manifest（2026-05-02）

example-manifest.json 換掉跟 brand-info.md 衝突的 placeholder（虛構 biomarker panel、九州大學 MOU、partner@…）→ 改成 brand-aligned 範例：EVA Select / Prometheus Lab AI、紐約 / 沖繩 / 東京 / 台北、info@cancerfree.io。brand-info.md 地點例子加上紐約。

## v4.8.0 — feat(newsletter): Claude.ai skill + zip 匯入流程（2026-05-02）

### 痛點
每月 newsletter 在 Claude.ai 對話寫稿很順（vision 看圖 + 多輪改文 + 翻譯），但寫完要手動拆成 mycrm 內 ai-compose 表單一格一格填，照片重新上傳，三語各跑一次。重複勞動。

### 設計
保留 in-app `ai-compose`（短任務還是好用），新增「Skill 匯入」並行：
- Claude.ai Project + skill 整月累積素材，月底打包成 zip
- mycrm 一個 import endpoint 吃 zip → 上傳圖 + 套既有 skeleton + 建 3 語 draft

### 改動
- **新增 `skills/newsletter-composer/`**（給 Claude.ai 上傳的 source）
  - `SKILL.md`：Capture / Refine / Package 三模式行為定義
  - `manifest-schema.json`：trilingual title/content_html、image_files、links
  - `examples/example-manifest.json`：完整範例
  - `assets/brand-info.md`：品牌語氣（待負責人填正式內容）
  - `README.md`：怎麼裝到 Claude.ai、月度流程
- **新增 `POST /api/newsletter/import`**（`src/app/api/newsletter/import/route.ts`）
  - multipart zip → JSZip 解壓 → manifest validate → 上傳到 `newsletter-assets/{period}/imported/` → 套三語 skeleton（沿用 `email_templates`）→ 建 3 個 draft 進 `newsletter_campaigns`
  - 自動加 section heading（last_month / next_month）
  - 連結文字、標題、段落都吃 trilingual
- **新增 `/admin/newsletter/import` 頁**：drag-drop zip、parse error 細項、建立後直接連到 quick-send 編輯
- **`/admin/newsletter/campaigns` 加「Skill 匯入」按鈕**（teal）放在「AI 撰寫」旁
- **deps**：`jszip` ^3.10.1

### 為什麼跟 ai-compose 並存
| | ai-compose（in-app） | Skill import |
|---|---|---|
| 適合 | 一次坐下花 1 小時寫完 | 整月慢慢累積 |
| 寫稿引擎 | Gemini via Portkey | Claude.ai（vision、多輪改稿） |
| 翻譯時機 | 寫完即翻 | 月底一次翻 |
| 共享 | 單人 | Claude Project 可加成員 |



### 痛點
1. 登入前的 `/docs` quick start 看不到 — `docs_content` 的 RLS policy 只開給 `authenticated`，anon 全擋。
2. `/b` 批次模式三語使用者文件都沒寫；bot 自己的 `/help` 也沒列。

### 改動
- **DB（Supabase migration）**：加 policy `docs_content_read_quick_start_anon` — 只讓 anon 讀 `section = 'quick_start'`，其他 section 仍要登入。
- **`docs_content` 三語 user guide**：「常用指令」表新增 `/b`、`/done`、`/cancel`；新增「批次模式」小節（用法、`/b 描述` 自動帶「在哪裡遇見」、與單張辨識的差別、流程 mermaid）。
- **`src/lib/bot-messages.ts`**：三語 `/help` 訊息把 `/b`、`/done`、`/cancel` 放在 photo 行下面（同一群組）。



### 痛點
有 2 張 row 在 `status='processing'` 卡了一整天。原因是 worker 跑到一半被 Vercel kill（function timeout / crash / deploy），claimed 之後沒人撿。Cron 跟 rescue 都只看 `status='pending'`，processing 就漏網。

### 改動
- **Cron `processPendingBatchAcrossUsers`**：開頭多一個 unstick pass — `status='processing'` 且 `created_at > 10 min` 的 row 自動 reset 成 `pending`。下個 tick cron 自然會撿
- **Rescue endpoint**：也把使用者自己的 stuck-processing 一起 flip 回 pending
- DB 修復：今天 2 張 stuck > 6 小時的 row 已手動 reset

10 分鐘 threshold 比一般 OCR 久很多（Portkey chain max ~150s），所以正常進行中的 worker 不會被誤踢。

## v4.7.0 — feat(merge): 合併聯絡人加 replace mode（換工作場景）（2026-04-29）

### 痛點
原本的 merge 邏輯永遠是「保留舊、新填空白、衝突寫互動紀錄」——對「同公司繼續」場景對，但當對方**換公司 / 換工作**時剛好相反：應該用新資料覆蓋舊、舊變歷史。

### 設計
新增 `replace` mode 跟既有 `fill` mode 並列，三個入口都可選：

| Mode | 行為 |
|---|---|
| `fill`（預設） | 空欄填新值；衝突欄位**保留舊**並寫互動紀錄 |
| `replace` | 衝突欄位**用新值覆蓋**；**舊值寫互動紀錄**留歷史 |

### 改動

**新增 `src/lib/merge-into-contact.ts`** — 三個入口共用的 helper
- 19 個欄位 diff（name/company/email 等含 _en/_local 變體）
- contact_cards / contact_tags 一起搬
- 自動寫互動紀錄（fill 跟 replace 各自的格式）

**Telegram bot**（`merge_` + `replace_` callback）
- OCR 結果有 dup target → 顯示 4 顆按鈕：✅ 仍建立 / 📌 加到 X / 🔄 更新 X / ❌ 不存檔
- 共用 `mergeIntoContact` helper，replace_callback 處理「換工作」流程

**Pending review web 頁** (`/api/contacts-pending/[id]` action=merge)
- Body 加 `mode: 'fill' | 'replace'`（預設 fill）
- Auto-detected merge 顯示兩顆按鈕（藍色 fill / 橘色 replace）
- 手動 picker 加 mode toggle（保留舊 / 覆蓋舊）

**Admin camcard 區** (`/api/camcard/[id]/merge`)
- Body 加 `mode`
- 確認 dialog 底部兩顆按鈕：📌 保留舊 / 🔄 用新資料覆蓋

### i18n
- `pendingReview.actionMergeReplaceTo` / `mergePickerModeFill/Replace` 等 9 keys × 三語
- `camcard.mergeConfirmFill/Replace` / `mergeFillHint/ReplaceHint` × 三語

### 文件
- `docs/bot/commands.md`：傳送名片章節補上偵測既有聯絡人的 4 顆按鈕說明

## v4.6.6 — fix(pending): 確認存檔後不跳轉，留在 pending 頁繼續審（2026-04-28）

### 痛點
從 pending 區點「確認存檔」會被踢到聯絡人詳情頁，要再 back 才能繼續審下一張，批次審核很煩。

### 改動
- `src/app/(dashboard)/contacts/pending/page.tsx`：save / merge 成功後不 `router.push`，只把 row 從 list 移除，使用者留在原頁繼續處理。
- 順便刪掉沒用到的 `useRouter` import。

## v4.6.5 — feat(pending): 預設重要性 medium + 手動合併到既有聯絡人（2026-04-28）

### 痛點
1. Pending 區建立的聯絡人預設沒有重要性（要每張手動點 H/M/L）
2. 沒被自動偵測為重複的 pending row，沒有方法合併到既有聯絡人——但實務上一個人會有正反面、多張名片都需要併

### 改動
- **預設重要性 medium**：
  - UI：未設定時 'M' 鍵預設 highlighted（不是空的）
  - API save：insert contacts 前若 importance 缺失 → 自動填 'medium'
- **手動合併 picker**：
  - 新增 `GET /api/contacts/search?q=...`：依 name / name_en / company / email ilike 搜尋（最多 10 筆）
  - 每張 done pending row 加「🔍 合併到既有...」按鈕（不只 auto-detected dup）
  - 點開展開搜尋框 + 結果清單（debounced 250ms）
  - 點結果 → API merge with target_id
- **API merge action**：accept body.target_id（手動）優先於 pdata._merge_target_id（自動）

### i18n
- pendingReview.actionMergeManual / mergePickerPlaceholder / mergePickerSearching / mergePickerNoResults × 三語

## v4.6.4 — fix(bot): batch_mode 第二張之後遺失 met context（2026-04-28）

### 痛點
`/b 描述` 進 batch、AI 解析出 met_at 寫進 session.context.met。第一張 photo 進來時 INSERT pending 帶 met_at 沒問題；但 photo handler 的 `setSession` **沒保留** `met` field（只寫了 count + pending_ids），第二張之後 session.context.met 不見、新 row 的 data 是空的。

### 改動
- `src/app/api/bot/route.ts` batch_mode photo handler：`setSession` 改成 `{ ...session.context, count, pending_ids }`，spread 既有 context 保留 met
- DB 修復：對 user pohan.chen@cancerfree.io 今天 batch 中 met_at 為 null 的 17 張 pending row，回填 met_at='Sushitech 2026'、met_date='2026-04-27'

## v4.6.3 — fix(pending): pending/processing 狀態也顯示縮圖（2026-04-28）

### 痛點
OCR 跑完前 `data.card_img_url` 還沒寫入，pending 頁顯示「等待辨識」placeholder，使用者看不到自己拍了什麼，誤以為照片沒上傳。

### 改動
- 縮圖優先用 `data.card_img_url`，沒有就用 `storage_path` 組 supabase public URL（圖檔上傳後立刻可見、不用等 OCR）

## v4.6.2 — feat(pending): Tag inline edit（2026-04-28）

### 改動
- Pending 頁載入所有 tags（一次），每張 done card 顯示 chip-style 多選 tag picker
- 點擊 toggle → 寫入 `data._tag_ids` 陣列
- API save action：剝出 `_tag_ids`，contact 建立後 INSERT contact_tags
- API merge action：把選的 tag merge 到既有聯絡人（跳過已附加的避免重複）

## v4.6.1 — feat(pending): 手動 rescue 按鈕 + cron 加強 logging（2026-04-28）

### 痛點
有 25 張 pending row 卡住、cron 沒撿（原因未明，需要 log 才能 debug）。沒有手動觸發路徑，使用者只能等。

### 改動
- **新增 `POST /api/contacts-pending/rescue`**：使用者觸發、用 service role 重置自己的 pending rows（retry_count=0、清 error_message）後 `after()` 跑 `processPendingForUser`
- **Pending 頁加「重跑卡住的辨識」按鈕**：偵測到使用者自己有 status='pending'/'processing' 的 row 才顯示，按下去 enqueue + 顯示 toast，3 秒後自動 refetch
- **Cron route 加 try/catch + 詳細 console.log**（start、done、error、unauthorized），未來 Vercel runtime logs 可看到
- **i18n** rescueButton / rescueHint / rescueQueued × 三語

## v4.6.0 — feat(pending): 上傳者 / filter / inline edit + failed-scans bulk delete（2026-04-28）

### 改動

**Pending 頁**
- Query join `users:created_by(display_name, email)` — 顯示每張卡的上傳者
- 不是自己的卡顯示「👤 王小明」 badge（super_admin 看別人的、或 team 內互看）
- Filter toolbar：狀態（全部 / 待辨識 / 已辨識 / 失敗）+ 上傳者（多人才顯示）
- 顯示計數「X / Y 張」
- Inline edit：重要性（H / M / L 點按）、語言（dropdown）— 寫入 `data` jsonb，存檔時帶進 contacts row
- met_at / met_date 顯示（從 /b 描述帶進來的）

**Failed-scans 頁**
- 多選 checkbox（全選 / 反選）
- Bulk delete 按鈕，一次刪 N 張、storage 同步移除

### i18n
- pendingReview 加 11 個 keys × 三語
- myFailedScans 加 5 個 keys × 三語

## v4.5.2 — feat(bot): 邊傳邊 OCR + within-batch dedup + confirm-time 重複再 check（2026-04-28）

### 改動

**邊傳邊辨識（不用等 /done）**
- batch_mode 每張 photo 進來後立刻用 `after()` 觸發 `processOnePending`，不再等 /done
- `/done` 只負責結束 + 等待落單者 + 發 summary（最多 polling 60 秒）
- 新 helper `summarizeBatchAndNotify`：依 pendingIds 等所有 row 完成或 timeout，再發單一 Telegram 訊息

**A — within-batch dedup（worker 主動標記）**
- `processOnePending` OCR + `checkDuplicates` 之後，再查同使用者其他 status='done' 的 pending row，若 email 完全相同 → 在 `data._batch_dup_of_id` / `_batch_dup_of_name` 標記
- pending 頁顯示橘色警示 banner「⚠️ 這批裡有另一張 email 相同的卡」

**B — confirm-time 重複再 check（被動防線）**
- `POST /api/contacts-pending/[id]` body action='save' → INSERT contacts 前 再跑一次 `checkDuplicates`，exact email match 回 409 + suggested target
- 前端攔 409 → confirm dialog「已有相同 email 的聯絡人 X，仍要建立嗎？」→ 確認則 force=true 重打 API

### i18n
- `pendingReview.duplicateConfirm` / `pendingReview.batchDupWarning` × 三語

## v4.5.1 — fix(bot): /done /cancel 被自動清 session 邏輯誤殺（2026-04-28）

### 痛點
`/b` 進 batch 模式 → 拍完 → `/done` 卻被回「目前不在 batch 模式」。

### 原因
`handleText` 開頭有「任何 `/` 指令先 clear session」的防呆邏輯（避免使用者卡在 waiting state）。但 `/done` 跟 `/cancel` 是**需要讀舊 session 才能運作**的 stateful 指令，被這層誤殺。

### 改動
- `src/app/api/bot/route.ts`：自動清 session 的邏輯加白名單 `/done` `/cancel`，這兩個指令保留 session 讓後續 handler 能讀。

## v4.5.0 — feat(bot): /b 批次模式 + 個人 pending / failed-scans 頁面 + 非同步 OCR worker（2026-04-28）

### 痛點
1. 一次有很多名片要處理時，每張都要等同步 OCR（5-30 秒、有時 timeout），體感極差
2. `pending_contacts` / `failed_scans` RLS 全開，使用者看不到「自己的」狀態，全部要走 admin
3. OCR 失敗 / Portkey timeout 直接卡在 Telegram，沒有事後重試或批次救援機制

### 改動

**Bot — 批次模式（`/b` `/done` `/cancel`）**
- `/b`：進入 batch mode，每張照片即時下載 + 上傳 storage + INSERT pending_contacts(status='pending')，**不當下 OCR**，使用者不用等
- `/done`：用 Next.js `after()` 觸發背景 worker 跑 OCR；webhook 立刻 return 不卡 Telegram
- `/cancel`：退出當前模式（已收的照片留在 pending，可在 web 確認）
- 既有單張同步流程（直接拍照不打指令）**完全不變**，老使用者不影響

**Web — 個人 pending / failed-scans 頁面**
- `/contacts/pending`：使用者看自己上傳待審核的名片。狀態區分 pending / processing / done / failed；done 可直接 ✅ 確認存檔、📌 加到既有聯絡人、❌ 刪除；failed 可重試或刪除；pending/processing 自動 5 秒輪詢更新
- `/contacts/failed-scans`：使用者看自己 OCR 失敗（沒抓到姓名）的圖。可看原圖或刪除；要重試請重新拍照上傳
- Sidebar 加兩個項目（member 可見）：「待審核名片」「我的失敗辨識」
- 既有 `/admin/camcard` `/admin/failed-scans` 保留作 admin 跨使用者匯總工具

**非同步 OCR worker**
- `src/lib/pending-ocr-worker.ts`：核心 worker，processOnePending 跑單筆、processPendingForUser 跑某使用者、processPendingBatchAcrossUsers 跨使用者掃 stale rows
- `/api/cron/process-pending-ocr`：每 2 分鐘 cron 兜底，撈 status='pending' AND created_at < now()-2min AND retry_count<3 的 row 重跑
- 失敗會重試最多 3 次；OCR 沒抓到姓名 → 自動移到 failed_scans
- 完成後 sendTelegramMessage 推「✅ 已完成辨識 N/M 張，前往審核」

**API**
- `POST /api/contacts-pending/[id]` body `{action:'save'|'merge'}` — 從 pending 區建立聯絡人 / 合併到既有
- `DELETE /api/contacts-pending/[id]` — 刪除 pending row + storage 圖

**Schema 改動（migration: `v450_pending_async_worker_and_per_user_rls`）**
- `pending_contacts` 加欄位：`status TEXT NOT NULL DEFAULT 'done'`、`retry_count INT DEFAULT 0`、`processed_at TIMESTAMPTZ`、`error_message TEXT`；`data` 預設改 `'{}'::jsonb`；CHECK constraint status IN ('pending','processing','done','failed')；index on (status, created_at) WHERE status IN ('pending','processing')；index on (created_by, status, created_at DESC)
- **RLS 改寫**：
  - `pending_contacts_all` (true) → 廢除
  - 新 `pending_contacts_own_all`：`created_by = me`
  - 新 `pending_contacts_super_admin_all`：role='super_admin' 全權
  - `failed_scans_read` (true) → 廢除
  - 新 `failed_scans_own_all`：`user_id = me`
  - 既有 `failed_scans_write`（has_feature）跟 super_admin policy 保留

### i18n
- `nav.pendingReview` / `nav.myFailedScans` × 三語
- `pendingReview.*`（21 keys）/ `myFailedScans.*`（6 keys）× 三語

### 文件
- `docs/bot/commands.{md,en.md,ja.md}`：指令表加 `/b` `/done` `/cancel`，新增「批次拍照」章節（zh-TW 詳細版）

## v4.4.4 — fix(ai): Portkey SDK fetch timeout 拉長到 180s 配合 fallback chain（2026-04-27）

### 痛點
Portkey config 改成 per-target timeout + Gemma fallback 後，最壞情境 OCR chain 會跑到 ~150s（Gemini ×2 retry + Gemma ×3 fallback）。但 Portkey SDK 預設 fetch timeout 雖然是 5 分鐘，這次顯式設成 180s 文件化時間預算、避免未來改 SDK 預設時破功。

### 改動
- `src/lib/gemini.ts` `makePortkey()` 加 `timeout: 180_000`，並用註解說明為什麼比 chain 上限大。

## v4.4.3 — fix(bot): 名片儲存時不再雙寫導致詳情頁顯示兩張（2026-04-26）

### 痛點
今天透過 Telegram bot 上傳的 19 張名片，在聯絡人詳情頁都顯示成兩張一樣的圖。

### 原因
Bot 的 `save_` callback 在新增聯絡人時把 `pending.data` 整包展開 insert 進 `contacts`，於是 `card_img_url` 同時寫到 `contacts.card_img_url` 和 `contact_cards` 兩個地方。詳情頁邏輯永遠把 `contacts.card_img_url` 當「Legacy 正面」先顯示，再列出 `contact_cards` 的所有 row，所以新建聯絡人就會看到同一張兩次。

### 改動
- `src/app/api/bot/route.ts` — `save_` callback 在 insert `contacts` 時把 `card_img_url` / `card_img_back_url` 從 payload 排除，讓 `contact_cards` 成為唯一來源。
- DB 資料修復：對今天（Asia/Taipei 0426）建立、且 `contacts.card_img_url` 與 `contact_cards` 中某 row 完全相同的 19 筆聯絡人，將 `contacts.card_img_url` 設為 NULL。Storage 檔案不動。

## v4.4.2 — fix(dashboard): 外部訂閱者只算「可寄送」的（2026-04-26）

### 痛點
總覽頁「外部訂閱者」過去把已退訂、blacklist 的也算進去，數字看似很多但實際上多數不可寄送。

### 改動
- `dashboard_email_status_stats()` RPC 修改 external 分支：
  - 原本：所有 `subscribers ∪ blacklist ∪ unsubscribes` 不在 contacts 的 distinct email
  - 現在：`subscribers WHERE unsubscribed_at IS NULL` 不在 contacts，**且不在 blacklist 也不在 unsubscribes**
- 結果：1112 → 865（247 個降下來，含過去退訂、blacklist、軟刪除聯絡人連動退訂的）

## v4.4.1 — feat(db): 軟刪除聯絡人時自動退訂該 email（2026-04-26）

### 痛點
聯絡人軟刪除（`contacts.deleted_at` 設為非 null）後，對應的 `newsletter_subscribers` 仍會被當成「外部訂閱者」繼續寄信。手動清理需要 3 步（unsubscribe subscriber + 寫 unsubscribes 表 + 也許還要從 list 移除）。

### 改動
- **新增 trigger `trg_unsubscribe_on_contact_soft_delete`**：偵測 `OLD.deleted_at IS NULL → NEW.deleted_at IS NOT NULL` 的轉換，自動：
  1. UPDATE `newsletter_subscribers.unsubscribed_at` for matching email
  2. UPSERT `newsletter_unsubscribes`（source=`contact_soft_delete`）
- **不會在還原（restore）時自動再訂閱** — 還原必須手動處理
- **Backfill**：76 個過去漏網的軟刪除聯絡人都補上 unsubscribes 紀錄；66 個 subscriber 設成已退訂

## v4.4.0 — feat(bot): 偵測同名重複時，可選擇加到既有聯絡人（2026-04-25）

過去 Telegram bot 拍名片時偵測到同名/同 email 的聯絡人，只能選「✅ 確認存檔（建新檔）」或「❌ 不存檔」。新增第三選項「📌 加到既有」直接把該名片合併到既存聯絡人。

### 改動
- **`src/app/api/bot/route.ts`** OCR 後的 dup 偵測流程：
  - 偵測到 exact (email match) 或 similar (name match) 時，把 target id 暫存進 `pending_contacts.data._merge_target_id`
  - 訊息 inline keyboard 改成 3 個按鈕：✅ 仍建立新聯絡人 / 📌 加到「{既有聯絡人}」/ ❌ 不存檔
- **新增 `merge_<pendingId>` callback handler**：
  - 拉 pending data + target contact 現有欄位
  - 計算 toFill（OCR 有/contact 空）+ conflicts（不同值）
  - UPDATE 填空白、INSERT contact_cards 加圖、INSERT interaction_logs (type=system) 寫衝突
  - DELETE pending_contacts、updateLastContact 切到目標聯絡人
  - 回覆「已加到「XXX」：填入 N 個空白欄位、M 個衝突寫入互動紀錄、🖼 名片圖已加入」+ 連結
- **save_ handler**：新增 `_merge_target_id` 也會被 strip 掉（不寫入 contacts 主表）

## v4.3.7 — fix(contacts): revert v4.3.6，衝突欄位仍要寫互動紀錄（2026-04-25）

v4.3.6 誤解需求把衝突 → interaction_logs 寫入邏輯刪掉了，會造成新名片上的不同資訊流失。還原。

最終行為：
- **空白欄位**：用新名片填入（contact 主表）
- **現有欄位永不覆蓋**
- **衝突欄位（新值 ≠ 現有值）**：新值寫入 `interaction_logs` (type=system) 保留資訊，使用者可日後手動參考
- OCR modal 警告文案：「保留現有資料，新值會存入互動紀錄」

## v4.3.6 — feat(contacts): 上傳新名片時衝突欄位忽略，不再寫互動紀錄（2026-04-25）

一個聯絡人累積多張名片是常見情境（同一個人可能有舊版/新版名片）。原本網頁上傳新名片時，與現有資料**不同**的欄位會被寫進 `interaction_logs` (type=system)，造成歷史紀錄被「相同人不同名片」的舊資訊洗版。

### 改動
- `confirmCardSave()` 移除 conflicts → interaction_logs 寫入邏輯
- 行為：新名片只**填空白欄位**，現有欄位永遠不被覆蓋也不寫紀錄
- OCR 預覽 modal 的衝突警告文案改成「將忽略，保留現有」（三語）
- Telegram bot `/a` 流程**不動**（保留歷史用）

## v4.3.5 — fix(contacts): 上傳新名片後舊名片被隱藏（2026-04-25）

聯絡人詳情頁的名片顯示邏輯把 legacy（`contacts.card_img_url`）和 `contact_cards` 表互斥渲染，導致「上傳新一張名片後，原本的正面圖整個消失」。改成兩者都顯示。

### 改動
- `src/app/(dashboard)/contacts/[id]/page.tsx` 行 1240-1252
- legacy 主表的圖永遠當作第一張顯示，後面接 contact_cards 表的所有 row
- 一個聯絡人可累積多張名片（不分正反），都會列出

## v4.3.4 — fix(newsletter): 大名單超過 1000 人時 contact name 不顯示（2026-04-25）

訂閱者名單詳情頁有 2203 人（超過 Supabase REST 預設 1000 row limit）時，後 1203 人的「CRM 聯絡人」欄只顯示「已連結」而沒名字。原因是 `.in('id', [...])` 查 contacts 被 limit 截斷。

### 改動
- `loadList()` 內所有 `.in()` 查詢（contacts / blacklist / unsubscribes）都改成 chunk 抓（每 chunk 500）
- 訂閱者列表本身（`newsletter_subscriber_lists`）也改成用 `.range()` 分頁（每頁 1000）以支援超過 1000 人的大名單
- 結果：1700+ 個 linked subscriber 全部會顯示完整聯絡人姓名

## v4.3.3 — fix(dashboard): 國家分布只列前 10，未知獨立分類（2026-04-25）

### 改動
- 國家分布只顯示前 10 個（按聯絡人數降序）
- 第 11 名以後合併為「其他國家」一格
- 沒有 country_code 的聯絡人（過去和「其他」混在一起）獨立成「未知」一格
- bar chart 的 max 改成所有條目的最大值（避免「其他」過大時其他條目視覺壓縮失真）
- 新增 i18n key `dashboard.countryUnknown`

## v4.3.2 — feat(dashboard): Email 寄送狀態總覽 + 補完 in-app 文件（2026-04-25）

📌 補充：v4.3.2 後 `docs_content.user`（三語）也補上了 newsletter 訂閱者管理操作 + 7 種 email status badge 含義 + 手動清除步驟。super_admin 補架構與技術細節，user 補日常操作。



過去 7 天 email_status 系列功能（v4.2.0–v4.3.1）的收尾，把使用者該知道的東西放到對的地方。

### Dashboard
- 新區塊「Email 寄送狀態」放在國家分布之後
- **CRM 聯絡人 8 格**：訂閱中 / 退信 / 無效 / 已退訂 / 暫時失敗 / 信箱滿 / 寄件擋 / 收件擋
- 點任一格 → `/contacts?email_status=X` 預先套用篩選
- **外部訂閱者 1 格**：在 newsletter_subscribers / blacklist / unsubscribes 但不在 contacts 的 distinct email；點擊 → `/admin/newsletter/lists`
- ⚠ 沒 email 的聯絡人不算（修正先前 `COALESCE` 邏輯把 NULL email 算 ok 的問題）
- 新 RPC：`dashboard_email_status_stats()`

### 聯絡人列表
- email_status 篩選 dropdown 補上 4 個新選項（deferred / mailbox_full / sender_blocked / recipient_blocked）
- 接受 URL query param `?email_status=X` 自動套用篩選

### in-app 文件（`docs_content` table）
- super_admin 三語各補上：Newsletter / 7 種 email_status / 三條同步路徑 / 雙資料源原則 / Webhook 自動分類 / Dashboard 邏輯 / CamCard assignee_label / Hunter / last_activity 規則
- 過去 7 天的 v4.2.x、v4.3.x 變更全部反映在 `/docs` 頁

### GitHub Pages 停用
- 刪除 `docs/_config.yml` / `docs/_includes/` / `docs/index*.md` / `docs/admin/newsletter*.md`
- 新增 `docs/.nojekyll` 保險
- 真正使用者文件改回 in-app `docs_content` table（`/docs` 頁讀取）

### i18n
- 新增 `dashboard.emailStatusSection` / `crmContacts` / `externalEmails` 三個 key（zh-TW / en / ja）

## v4.3.1 — feat(sendgrid): webhook 細分 7 種狀態（2026-04-25）

v4.3.0 加了 4 種新狀態，但 webhook 只能粗分 bounced / invalid / unsubscribed。這版讓 webhook 能根據 SendGrid event 的 `reason` 自動分到 7 種正確類別。

### 改動
- **`classifyByReason()` 取代 `classifyDropReason()`** — 新增 SMTP code / 關鍵字偵測：
  - `5.2.1` / `5.2.2` / "mailbox full" / "over quota" → `mailbox_full`
  - DKIM / SpamTrap / SenderNotAuthenticated / `5.7.134` → `sender_blocked`
  - "Relay denied" / "Transport rules" / "hop count" / `5.7.129` / `5.4.14` → `recipient_blocked`
  - i/o timeout / "no route to host" / `5.0.0` / "service unavailable" → `deferred`
  - "mx info" / "unrecognized address" → `invalid`
  - `5.1.1` / `5.5.0` / "user unknown" → `bounced`
- **`bounce` event 也走分類**：原本一律標 `bounced`，現在 `type='blocked'` + reason 會被分到 `recipient_blocked` / `sender_blocked` 等
- **`spamreport` 改成 `sender_blocked`**：spam 是寄件人聲譽問題，不是收件人故障
- **`newsletter_blacklist` 寫入時帶 status** — 跟 v4.3.0 加的 column 對齊

## v4.3.0 — feat(email-status): 新增 4 種細粒度寄送狀態（2026-04-25）

原本 `email_status` 只有 `bounced` / `invalid` / `unsubscribed` 3 種，但 SendGrid Activity log 的失敗 / drop / blocked 還可細分為「暫時錯誤 / 信箱滿 / 寄件方問題 / 收件方擋信」等。新增 4 種狀態，這些都會被自動排除寄送，但聯絡人本人或團隊發現可恢復時，可以手動清除狀態。

### 新增狀態
- **`deferred`**（暫時無法寄送）— 上次寄送遇到網路 timeout / 500 service unavailable
- **`mailbox_full`**（信箱已滿）— 對方信箱 quota 滿
- **`sender_blocked`**（寄件方問題）— DKIM / SpamTrap / 寄件人認證問題（我方可修）
- **`recipient_blocked`**（收件方擋信）— Relay denied / Transport rules / Hop count 等對方政策

### DB 改動
- **`contacts_email_status_check`** constraint 擴充為 7 種值
- **`newsletter_blacklist`** 新增 `status` column（外部 email 也能分類）
- 從 SendGrid Activity log 補回 4/17、4/19、4/24 三批共 ~345 個聯絡人 + 228 筆 blacklist，並依分類設定 status

### 程式改動
- **i18n**：zh-TW / en / ja 各加 4 個 label + 4 個 description
- **聯絡人列表 / 詳情頁**：banner + badge 支援 7 種狀態
- **電子報名單詳情頁**：stats 卡新增「待處理」格、行內 badge 7 種樣式、排序順序更新
- **寄送過濾**：原本就已排除任何 non-null email_status，新狀態自動生效

### 操作手冊
- 看到聯絡人有 `deferred` / `mailbox_full` / `sender_blocked` / `recipient_blocked` badge，**不需要刪除聯絡人**
- 確認問題已解決（例如對方清空信箱、我方修好 DKIM、對方加白名單）後，到聯絡人詳情頁點「清除狀態」即可恢復寄送

## v4.2.3 — feat(sendgrid): webhook 加 dropped 事件 + 統一 suppression policy（2026-04-25）

SendGrid 寄送後的 drops（pre-send 拒發，例如 invalid / bounced address / spam）原本 webhook 不處理，要等每日 cron 才會同步。加上即時處理，同時把 webhook 的 suppression 邏輯對齊 v4.2.1 的 policy：CRM 聯絡人只更新 `contacts.email_status`，非 CRM 才寫 blacklist。

### 改動
- **新增 `dropped` event 處理**：根據 `reason` 分類為 bounced / invalid / unsubscribed，即時更新狀態
- **統一 suppression 邏輯**：抽出 `markSuppressed()` helper，bounce / dropped / spamreport / unsubscribe 都走同一條路
- **修 bug**：舊 webhook 的 `bounce` handler 只寫 blacklist，沒更新 `contacts.email_status`，導致 CRM 聯絡人退信後頁面看不出來；改成優先更新 `email_status`

## v4.2.2 — fix(newsletter): quick-send 顯示可寄送人數（2026-04-25）

quick-send 頁面顯示的名單人數沒有扣除退信/退訂（選 491 人的名單，實際只會寄 488），和名單詳情頁不一致。

### 改動
- **新增 API `GET /api/newsletter/lists/stats`**：回傳每個 list 的 `{ total, eligible }`，eligibility 套用與 send flow 相同的過濾條件（unsubscribed_at / blacklist / unsubscribes / contact.email_status）
- **quick-send 頁面**：
  - 顯示 `eligibleCount / memberCount` 格式（當有差異時）
  - 總計改顯示「可寄送」人數，附帶「排除退信/退訂 N 人」提示
  - 寄送 confirm 和按鈕都用 eligible 人數

## v4.2.1 — fix(newsletter): 退信狀態以 contacts.email_status 為準（2026-04-25）

前一版會把退信的 CRM 聯絡人同時寫入 `contacts.email_status` 和 `newsletter_blacklist`，資料重複且不一致（v4.2.0 sync 後 林楨特 / 劉家豪 兩人只有 blacklist 沒有 email_status）。改成：CRM 聯絡人以 `email_status` 為 canonical，`newsletter_blacklist` 只用於非 CRM 的外部 email。

### 改動
- **DB 清理**：林楨特 / 劉家豪 的 `email_status` 回填 `'bounced'`，從 `newsletter_blacklist` 移除
- **`sendgrid/import-suppressions`**：bounces / invalids 同步時先更新 `contacts.email_status`，再只把**非 CRM 聯絡人**的 email 寫入 blacklist
- **`campaigns/[id]/send`**：filter 加入 `contacts.email_status IS NOT NULL` 檢查；移除 blacklist 後這些人仍會被正確排除

## v4.2.0 — feat(newsletter): 收件名單管理強化 + SendGrid 狀態整合（2026-04-25）

收件名單管理頁（`/admin/newsletter/lists/[id]`）加入完整的管理能力，SendGrid 退信/退訂狀態全面整合到寄送流程。

### 名單管理
- **欄位排序**：Email / CRM 聯絡人 / 加入時間 / 狀態 都可點擊 header 排序
- **新增聯絡人**：Modal 搜尋 CRM 聯絡人（姓名/email），自動 find-or-create subscriber，防重複加入
- **刪除**：每列垃圾桶按鈕從名單移除（只刪 junction，不刪 subscriber 本體）
- **Stats 區塊**：5 格（總訂閱者/已連結聯絡人/可寄送/退信+無效/已退訂）

### SendGrid 整合
- **寄送過濾**：`newsletter_blacklist` 和 `newsletter_unsubscribes` 中的 email 自動從寄送名單排除
- **狀態 badge**：名單列表顯示 4 種狀態（訂閱中/退信/無效/已退訂），來源交叉比對 contact.email_status + blacklist + unsubscribes + subscriber.unsubscribed_at
- **同步按鈕**：名單頁可手動觸發 `/api/sendgrid/import-suppressions`
- **Vercel Cron**：每日 03:00 Asia/Taipei 自動同步 SendGrid 狀態
- **API**：新增 `POST/DELETE /api/newsletter/list-members`；`import-suppressions` 加 GET handler + CRON_SECRET auth

### CI 修正
- **Node.js 24 升級**：`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 解決 actions/checkout@v4 deprecation warning
- **ECONNRESET 修正**：workflow 加 actions/setup-node cache + npm retry config（fetch-retries=5, timeout=60s）
- **npm ci → npm install**：避免 Windows/Linux lock file 跨平台不同步造成 EUSAGE
- **Jekyll Liquid error 修正**：`render_with_liquid: false` front matter + exclude CHANGELOG.md / newsletter-templates/

## v4.1.0 — feat(camcard): pending 名片審核人 label + 批次指派 + 篩選（2026-04-23）

Po 要處理大量名片王匯入，不同批次給不同人確認。加 `assignee_label` 短文字欄位當標籤（非 FK，最彈性），目前 1187 筆 pending 全部 backfill 為 `PO`。

### 改動
- **DB migration `camcard_pending_assignee_label`**：`camcard_pending.assignee_label text`（nullable）+ 部分索引 `(assignee_label) WHERE status='pending'`；1187 筆 pending 回填 'PO'
- **API**:
  - `/api/camcard/pending` GET 加 `assignee` query param (exact label 或 `__unassigned__` 代 NULL)、回傳 `assignee_label`
  - **新 `/api/camcard/assignees`** GET: 回各 label 數量 + unassigned 數量；PATCH: `{ ids, assignee_label }` 批次更新
- **UI `/admin/camcard`**:
  - filter bar 加「審核人」下拉，顯示所有 label 與未指派數
  - 卡片標題右側藍色 badge `👤 PO` 顯示審核人
  - 底部 bulk action bar 新增「指派審核人」按鈕 → prompt 輸入標籤 → 批次更新
  - 空字串當取消指派

### 用法
- 匯入新一批 500 張給別人審核：匯入後去 `/admin/camcard` → 篩選 `(未指派)` → 全選 → 「指派審核人」輸入 `Eva` → 之後 Eva 用 `審核人 = Eva` 篩選只看她要做的
- Label 是自由文字，不一定要是 mycrm 的使用者（可用 `AD-June` / `訪客` 之類）

### package.json 4.0.0 → 4.1.0

## v4.0.0 — feat(newsletter): AI 輔助撰稿 + 自動翻譯 + 乾淨 skeleton（2026-04-23）

MAJOR bump 標示 newsletter 工作流重構。Po 決定 mycrm 接手後不再使用 listmonk HTML，未來電子報都走「中文輸入 → AI 以過往語氣生成 → AI 自動翻譯英日版 → 編輯 → 寄出/Substack」。

### 1. 乾淨 skeleton 重寫
3 份 `email_templates` skeleton 從 listmonk 表格型（5400-5900 bytes）重寫成簡潔 email-safe HTML（~2500 bytes），支援 placeholder：`{{subject}}` / `{{period_label}}` / `{{intro_html}}` / `{{stories_html}}` / `{{{unsubscribe}}}`。Logo + 社群 icon 搬到 `newsletter-assets/shared/` 當穩定路徑。

### 2. `POST /api/newsletter/ai-compose`
Input: Chinese outline + stories（每段 title/outline/optional image/links）+ `translate` boolean。Process:
- 對每個目標語言（zh-TW 必定、en + ja 若 translate=true）:
  - 從 `newsletter_tone_samples` 載入該語言最近 2 份 plain_text 當 few-shot
  - 用 Portkey + Gemini 2.5 Flash 依每段大綱 + tone few-shot 生成段落 HTML
  - en/ja 時 title 也翻譯
  - 渲染 skeleton（替換 placeholder）
  - 寫 `newsletter_campaigns` draft，綁對應語言 list (zh-TW/en/ja)
- 回傳 `{ results: [{ lang, id, error? }] }`，前端跳到 zh-TW campaign 的 quick-send

### 3. `/admin/newsletter/ai-compose` 表單頁
- 期別 YYYY-MM、自動翻譯 toggle、開場介紹（中文）
- 動態 story cards：標題 / 大綱 / 圖片（上傳到 `newsletter-assets/<period>/`）/ 連結（URL + label 多組）
- 「AI 生成電子報」紫色按鈕 → 送 API → 跳 quick-send

### 4. Campaigns index 整合
右上角新增「🪄 AI 撰寫」紫色按鈕（primary）+ 「空白新增」次要。

### 改動
- DB: 3 份 email_templates skeleton rewrite（via MCP SQL）
- Storage: `newsletter-assets/shared/` 新增 logo / facebook / linkedin / website
- 新 `src/app/api/newsletter/ai-compose/route.ts`（300+ 行）
- 新 `src/app/(dashboard)/admin/newsletter/ai-compose/page.tsx`（dynamic story form + image upload）
- `campaigns/page.tsx`: 新按鈕佈局
- `package.json` 3.14.0 → 4.0.0
- 使用者文件（docs/admin/newsletter.md 三語）將於下輪補 AI 撰寫章節

### 範圍內但未做
- TipTap WYSIWYG 完整整合：暫不做。AI-compose 產出的 HTML 乾淨、可直接用 quick-send 的 split view + image upload 編輯。完整 WYSIWYG 涉及拆 content-from-skeleton 雙層編輯，下輪視需求再做。

### Workflow 範例（5 月）
1. 到 `/admin/newsletter/ai-compose`
2. 期別 `2026-05`、開場 textarea 寫「5 月重點」，自動翻譯打勾
3. 「新增段落」輸入 3-4 段故事（標題 + 大綱 + 圖片 + 連結）
4. 按「AI 生成電子報」→ 約 30-60 秒產生 3 份草稿
5. 跳 quick-send 頁編輯中文 → 儲存 → 切到 en/ja campaign 檢查 → 編輯 → 寄出/發布 RSS

## v3.14.0 — feat(newsletter): quick-send 分割檢視 + 圖片一鍵上傳（2026-04-23）

Po 要求像 `/email/compose` 那樣提升編輯器體驗。考量 4 月電子報仍是 listmonk 表格型 HTML（TipTap WYSIWYG 會 flatten 表格），本版先做**結構安全**的增強：

1. **三態檢視 tab**：預覽 / 編輯 / **分割**（左 HTML 原始碼 + 右即時預覽，邊打邊看）
2. **插入圖片按鈕**：編輯 / 分割模式下可按「插入圖片」→ 檔案 picker → 自動上傳到 `newsletter-assets/<period>/` → 游標處插入 `<img>` tag。period 由 campaign slug 推導（`2026-04-zh-tw` → `2026-04`），否則 fallback 當月
3. 檔名 sanitize：非 ASCII 用 `asset-<timestamp36>.ext` fallback 避免 Storage key 拒收

### 改動
- `src/app/(dashboard)/admin/newsletter/quick-send/[id]/page.tsx`：`viewMode` state (`preview | edit | split`)、`editorRef` + `imageInputRef`、`handleImageUpload` + `periodFolder` helper、3-tab UI
- `package.json` 3.13.3 → 3.14.0

### 下一步（需要 Po 確認方向）
TipTap WYSIWYG / AI 輔助撰寫的完整 workflow（Po 每段故事給大綱+照片+連結，AI 以過往語氣生成，再編輯）下次討論後實作。

## v3.13.3 — chore(newsletter): PDF print CSS 再強化（hide unsub + link 視覺）（2026-04-23）

Po 檢查 PDF 輸出後回報 3 點：
1. URL 還是不能點 — 改 CSS 讓 URL fallback 視覺當 link (同色+underline)，用戶看到即可理解是 link。anchor 本身能否 clickable 取決於 PDF viewer；Chrome "Save as PDF" 通常保留。
2. PDF 底部有 2 個 unsubscribe — 新增 print CSS hide `a[href*="unsubscribe"]` + `{{{unsubscribe` 佔位符；email 還是照寄（stored HTML 不動，SendGrid 寄時 substitute 真 URL）
3. 新 campaign 要自動套規則 — 已經是如此。Print CSS 在 `quick-send/[id]/page.tsx` 的 `previewHtml` useMemo 注入，**所有** campaign preview/print 自動套用。未來 5 月新 campaign 直接吃同一套規則，不需 per-campaign 設定。

### 改動
- `src/app/(dashboard)/admin/newsletter/quick-send/[id]/page.tsx` print CSS：
  - URL fallback 顏色改成 link teal + underline（視覺當 link，不再灰字）
  - `a[href*="unsubscribe"], a[href*="{{{unsubscribe"] { display: none }` — PDF hide
  - 註解更新說明此規則自動套全 campaigns
- `package.json` 3.13.2 → 3.13.3

## v3.13.2 — fix(newsletter): PDF 匯出邊界 + 連結保留（2026-04-23）

Po 回報 PDF 版面不夠整齊、連結點不開。兩個問題根源：
1. Email HTML 沒 print CSS → 瀏覽器預設 margin/顏色模式弄壞版面
2. `window.print()` 對 iframe 列印時，Chrome 常把 `<a>` anchor flatten 掉 → PDF 裡連結不可點

### Fix
- **Print CSS 注入** (iframe srcDoc 層，不動 stored HTML)：
  - `@page { size: A4; margin: 8mm }`
  - `-webkit-print-color-adjust: exact` 保留背景顏色
  - `img { max-width: 100%; page-break-inside: avoid }` 避免圖片跨頁裁切
  - `h1-h4 { page-break-after: avoid }`
  - `div[style*="padding:0px 24px"]`/`padding:16px 24px` → `page-break-inside: avoid`（故事區塊不跨頁）
  - `tr, td { page-break-inside: avoid }`（表格不裂）
  - `a { color: #0D9488; underline; word-break: break-all }` 連結視覺強化
- **URL fallback**：每個 `a[href^="http"]:not(:has(>img))::after { content: " (" attr(href) ")" }`，列印時連結文字後面會附灰色 URL，萬一 PDF anchor flatten 掉仍可 copy-paste。圖檔連結（logo / 社群 icon）不會掛 URL 文字。
- **exportPdf 改走新視窗列印**（繞 iframe 的 anchor flatten quirk）：`window.open('', '_blank')` → 寫入 previewHtml → 等所有 img `load`（3 秒 safety timeout）→ `window.print()`。PDF 裡的連結現在是真 hyperlink。

### 改動
- `src/app/(dashboard)/admin/newsletter/quick-send/[id]/page.tsx`：`previewHtml` useMemo 注入 print CSS；`exportPdf()` 改為新視窗列印
- `package.json` 3.13.1 → 3.13.2

### 使用者行動
瀏覽器可能擋 popup（「瀏覽器阻擋了彈出視窗」訊息），允許 popup 後重按即可。

## v3.13.1 — chore(newsletter): 4 月中文 HTML 再清 39 個冗餘 `<br>`（2026-04-23）

Po 要求再清 HTML。做了個 audit：
- 14 張圖全部在 Supabase Storage ✓
- 17 條連結全部有效、無 `#` 死連結 ✓
- 零外部 CDN 殘留（listmonk / mlcdn / lovable 都清掉了） ✓
- 2 個 `{{{` 佔位符是 unsubscribe 模板（SendGrid 寄送時會 substitute）
- 發現 46 個 `<br>`，其中 38 個是 `</p>` 後面的冗餘 br（paragraph 本身就有段距）

SQL 清：
- `</p>` 後面的 `<br>` 全部移除（38 個）
- 連續 2+ `<br>` 壓縮成單個（1 處）

剩 7 個 `<br>` 全都是有意義的分行（`📅 時間 <br> 📍 地點` 類）。

`package.json` 3.13.0 → 3.13.1。HTML 從 26187 → 26029 bytes。

## v3.13.0 — feat(contacts): 互動紀錄顯示 email 追蹤狀態（已開啟/已點擊/彈信）（2026-04-23）

Po 要求：聯絡人詳情頁的互動紀錄，如果是可追蹤的信件（有 `campaign_id` 的電子報），旁邊直接顯示信件狀態 badge — 開啟、點擊、彈信等，讓使用者一眼看出互動熱度。

### 改動
- `src/app/(dashboard)/contacts/[id]/page.tsx`：
  - `Log` interface 加 `campaign_id`；SELECT 查詢也加進去（兩處 fetch + 1 處 update log 的 select）
  - 新 `CampaignEmailStatus` 型別 + `emailStatus: Record<campaign_id, status>` state
  - `load()` 多 fetch 一次 `email_events` for this contact，group by `campaign_id` → 聚合成 delivered / opened / clicked / bounced / spam / unsubscribed 六態
  - 互動紀錄 render 端：email log 有 campaign_id 就根據聚合狀態顯示 badge（已寄達 / 已開啟 / 已點擊 / 彈信 / 垃圾信 / 已退訂），`title` hover 顯示發生時間
  - 視覺優先序：clicked > opened > delivered（只顯示一個狀態），bounced/spam/unsub 並列附加
- `package.json` 3.12.0 → 3.13.0

### 資料來源
`email_events` 表是由 `/api/email/webhook` SendGrid webhook 處理寫入的。需要 SendGrid 端 Event Webhook 設定指向那個 endpoint（URL 已長期在用，無需本次動作）。

### 範圍
- 只顯示 `type=email` 且 `campaign_id IS NOT NULL` 的 log（即 newsletter campaigns）；手動寄信沒綁 campaign_id，不會掛 badge
- 如果 SendGrid webhook 因網路等原因沒跑，badge 就不會出現 — 背景有 `/api/email/backfill-events` 可補

## v3.12.0 — feat(newsletter): 刪舊 wizard + 名單詳情 + 複製/新建 + 連結補齊（2026-04-23）

Po 要求一口氣處理 4 件事：刪舊 wizard、名單可點進看成員、缺複製/新建、補齊剩下的連結並優化排版。

### 1. 舊 wizard 下線
- 刪除 `src/app/(dashboard)/admin/newsletter/page.tsx`（955 行舊 wizard）
- `src/lib/features.ts` 的 `newsletter` 路徑指到 `/admin/newsletter/campaigns`

### 2. 收件名單頁
- `/admin/newsletter/lists` index：4 份 list + 各 list 訂閱者數
- `/admin/newsletter/lists/[id]` 詳情：列出所有訂閱者（email / 姓名 / CRM 聯絡人連結 / 加入時間 / 訂閱狀態），帶搜尋 + 3 個統計 tile（總數 / 已連結 / 已退訂）
- Quick-send 頁每份 list 的人數旁加 `→` 連結直接跳到詳情
- Campaigns 頁右上新連結「收件名單管理 →」

### 3. 複製 / 新建電子報
- `POST /api/newsletter/campaigns` — 建空白草稿（帶最小預設 title / content）
- `POST /api/newsletter/campaigns/[id]/duplicate` — 複製既有 campaign 成新草稿，title 加 " (副本)"、清除 status / sent_at / slug 等狀態、list_ids/content_html 沿用
- Campaigns index 頁頂右「+ 新增電子報」按鈕、每列末加「複製」icon button（都會自動跳到 quick-send 繼續編輯）

### 4. 四月中文電子報 HTML 清理
- 3 個 `href="#"` 社群 icon 補上 CancerFree 的 facebook / linkedin / website URL
- 移除過時「新聞連結」指向 `preview--linky-news-hub.lovable.app`（Po 確認沒用）
- 版面微優化：分數像素 padding 四捨五入為整數、連續 3+ `<br>` 壓縮成單一

### 改動
- 刪 `src/app/(dashboard)/admin/newsletter/page.tsx`
- 新 `src/app/(dashboard)/admin/newsletter/lists/page.tsx` + `lists/[id]/page.tsx`
- 新 `src/app/api/newsletter/campaigns/route.ts` + `[id]/duplicate/route.ts`
- 改 `campaigns/page.tsx`：新增/複製按鈕 + 名單管理連結
- 改 `quick-send/[id]/page.tsx`:每份 list 人數變連結
- `src/lib/features.ts`: newsletter 路徑更新
- DB: 4 月中文 campaign HTML SQL 整理（3 socials + 移 lovable + cosmetic regex pass）
- `package.json` 3.11.0 → 3.12.0

## v3.11.0 — feat(newsletter): HTML 編輯器 + unsubscribe 替換 + 圖示搬家 + nav 整合（2026-04-23）

Po 預覽試用後提三個問題：(1) 沒地方編輯 HTML、(2) 裡面的連結要檢查、(3) unsubscribe 要導到 mycrm 的 `/unsubscribe` 頁。發現還有舊 wizard 和新 Campaigns 兩頁沒串起來。

### 1. Quick-Send 加 HTML 編輯器
- 預覽右上角「編輯 HTML」切換按鈕
- 編輯模式顯示 `<textarea>` 原始 HTML（monospace、600px 高、spellCheck off）
- 編完回預覽自動 live preview；按「儲存草稿」持久化到 DB（`content_html` 欄位）
- 改 `/api/newsletter/campaigns/[id]` PATCH 也支援 `content_html` 欄位

### 2. Unsubscribe 連結：SendGrid substitutions 接 mycrm
電子報 HTML 帶 listmonk 留下的 `{{{unsubscribe}}}` 和 `{{{unsubscribe_preferences}}}` 佔位符。send 路由每個收件人 sign 一個 JWT token（HMAC-SHA256，365 天過期、payload `{email, campaignId, exp}`），組成 `https://crm.cancerfree.io/unsubscribe?token=<jwt>`，透過 SendGrid personalizations 的 `substitutions` 欄位替換 — 每位收件人拿到屬於自己的 token。點下去會走現有的 `/unsubscribe` 頁 + `/api/newsletter/unsubscribe` API（既有驗 HMAC 邏輯）。

### 3. 社群圖示 CDN 搬家
`assets.mlcdn.com`（MailerLite CDN）的 3 張 icon（facebook / linkedin / website）也搬到 Supabase Storage `newsletter-assets/2026-04/`。`scripts/migrate-newsletter-images.mjs` 現支援 mlcdn + listmonk 兩種 pattern，可擴充。電子報現在完全不依賴外部 CDN。

### 4. Nav 串起兩頁
- Sidebar 「電子報」entry 從 `/admin/newsletter` 改指 `/admin/newsletter/campaigns`（新流程）
- 舊 `/admin/newsletter` wizard 頂部加黃色 banner「⚠ 舊版 wizard，建議用新版 Campaigns 流程」+ 按鈕「前往 Campaigns →」
- 新 `/admin/newsletter/campaigns` 右上角加小字連結「舊版 Wizard / 訂閱管理 →」備查

### 還有待 Po 確認的連結
HTML 仍有兩處不確定：
- `href="#"`（社群 icon 的 facebook/linkedin/website 3 處）— CancerFree 的品牌社群網址沒填，Po 需要提供我才能改
- `https://preview--linky-news-hub.lovable.app/` — 看起來像 lovable.dev 的預覽 URL，可能是還沒上線的「新聞連結」dev URL，Po 需確認要替換成正式網址還是移除

### 改動
- `src/app/(dashboard)/admin/newsletter/quick-send/[id]/page.tsx`：加 `contentHtml` state、showEditor toggle、編輯模式 textarea、save 包 content_html
- `src/app/api/newsletter/campaigns/[id]/send/route.ts`：import crypto、`signUnsubToken()`、personalizations 加 substitutions
- `scripts/migrate-newsletter-images.mjs`：URL pattern 擴充為 listmonk + mlcdn
- `src/app/(dashboard)/layout.tsx`：sidebar newsletter entry 指向 `/campaigns`
- `src/app/(dashboard)/admin/newsletter/page.tsx`：舊 wizard 頂部 banner
- `src/app/(dashboard)/admin/newsletter/campaigns/page.tsx`：右上角導引連結
- 資料：April 中文 campaign 的 3 張 mlcdn 圖示已遷移到 Storage
- `package.json` 3.10.2 → 3.11.0

## v3.10.2 — fix(ocr): name_local 日文/中文名片不再誤判「無法識別姓名」（2026-04-23）

Po 在 Telegram 新增日本人名片回報「❌ Recognition failed: could not identify name」，但到 Portkey dashboard 看 Gemini 其實有正常回應。實際回傳 JSON：
```
{"name":"","name_en":"","name_local":"藤崎 啓司",
 "company":"千葉県商工労働部 企業立地課", ...}
```

Gemini 把日文姓名放在 `name_local`（漢字本地欄位），但 bot 名片 /a 流程和 camcard 管理員確認流程的 fallback 只做 `name → name_en`，漏了 `name_local` → 整張卡被丟進 `failed_scans`。

### Fix
- `src/app/api/bot/route.ts` L749：fallback 鏈補第三階 `name_local`
- `src/app/api/camcard/[id]/confirm/route.ts` L89-90：同步補 `name_local` + `company_local`

LinkedIn `/li` 路徑的 prompt 早就把中文/日文漢字放在 `name` 欄位本身，不需此修復。

### 改動
- bot/route.ts 一行 fallback
- camcard confirm/route.ts 兩行 fallback（name + company）
- `package.json` 3.10.1 → 3.10.2

## v3.10.1 — fix(newsletter): preview 空白 + 圖片搬家到 Storage + docs（2026-04-23）

Po 實測回報 3 件事：(1) quick-send 頁的 preview iframe 一片空白、(2) 測試信收到但沒圖片、(3) 要寫使用者文件。

### 1. preview 空白 fix
iframe 原本用 `ref.srcdoc = campaign.content_html` 在 useEffect 裡 set，race condition + React 不認這個 mutation。改用 React 的 `srcDoc` prop（`useMemo` 產 HTML，iframe 拿到 prop 自動 re-render）。

### 2. 圖片搬家：listmonk CDN → Supabase Storage
Po 要求「以後直接存系統」+ 4 月這期先抓回來。
- 新 Storage bucket `newsletter-assets`（public、10 MB/檔、image/* 白名單）
- `scripts/migrate-newsletter-images.mjs` 一次性工具：parse campaign HTML → 下載所有 listmonk URL → 上傳 Storage（路徑 `<period>/<filename>`）→ 改寫 `<img src>` 並 PATCH 回 DB
- 檔名 sanitize：非 ASCII（中文）Storage key 會拒收，fallback 用 `asset-<8-char-sha256>.ext` 形式
- 4 月中文電子報：11 張圖全部遷移，listmonk URL 清零，改指 Supabase Storage

### 3. 文件
- 新檔 `docs/admin/newsletter.md` + `.en.md` + `.ja.md` — subscriber / list / quick-send / PDF / RSS / Substack 設定 / 圖片 Storage / 不污染 last_activity 的保證 都寫進去
- `docs/admin/index.{md,en.md,ja.md}` 表格加一列「電子報」

### 改動
- `src/app/(dashboard)/admin/newsletter/quick-send/[id]/page.tsx`：iframe 改 `srcDoc` prop、useEffect 換 useMemo
- `scripts/migrate-newsletter-images.mjs` 新檔
- DB：新 bucket `newsletter-assets`
- `docs/admin/newsletter.{md,en.md,ja.md}` 新檔
- `docs/admin/index.{md,en.md,ja.md}` 更新
- `package.json` 3.10.0 → 3.10.1

### 測試用戶端行動
- 測試信沒看到圖片，通常是 **Gmail/Outlook 預設擋遠端圖片**。點信件頂部「顯示圖片」/「信任此寄件者」後就會載入。
- 現在圖片都在 Supabase Storage public bucket，CORS 友善、長期穩定。

## v3.10.0 — feat(newsletter): CSV 匯入 + quick-send + RSS + PDF（2026-04-22）

Po 提供 497 筆 SendGrid 4 月中文未寄名單 + 4 月內容 docx/PDF，要求打通整條 newsletter pipeline：CSV → 收件人 → 電子報編輯 → 寄送 → PDF 匯出 → RSS 給 Substack 抓草稿。

### 改動

**DB migrations**
- `newsletter_campaigns_list_ids_published_slug`: 加 `list_ids uuid[]` / `published_at timestamptz` / `slug text` + 兩個 partial index
- `reverse_link_subscriber_to_contact`: 新 trigger，當 `newsletter_subscribers` INSERT / email update 時自動連到既有 contact（補既有 forward trigger 缺的反向）

**Data**
- 新 list `2604-zh-unsent` (2026-04 中文未寄名單)
- Import 497 subscribers from CSV (`scripts/import-newsletter-subscribers.mjs` 有 fetch failed 問題，改用 `/tmp/import-direct.mjs` with chunked 50 batches)
- Backfill 194/497 連到既有 contacts (剩 303 是純 subscriber)
- 新 campaign `5491d2a2-3a2b-4369-8261-bada98254061` `2026-04-zh-tw` (從 `newsletter_tone_samples` 撈 HTML，status=draft)

**APIs**
- `/api/newsletter/campaigns/[id]` GET / PATCH — 讀/改 campaign
- `/api/newsletter/campaigns/[id]/send` POST — via SendGrid personalizations (1000/chunk)，寫 interaction_logs with `send_method='sendgrid'` (不污染 last_activity)，更新 sent_at/sent_count/status；支援 `testOnly + testEmail`
- `/api/newsletter/campaigns/[id]/publish` POST — flip `published_at`
- `/api/newsletter/feed.xml` GET — 公開 RSS 2.0 feed，Substack RSS importer 用；只輸出 `published_at IS NOT NULL` 的 campaigns

**Pages**
- `/admin/newsletter/campaigns` — 列表頁，連到 quick-send
- `/admin/newsletter/quick-send/[id]` — 編輯主旨/預覽文字/收件名單、HTML iframe preview、「測試寄送到單一 email」、「正式寄送」、「發布到 RSS」、「匯出 PDF」(`window.print` on preview iframe)
- `/newsletter/view/[slug]` — 公開 view page，Substack RSS `<link>` 指這；用 slug 或 id 都能開

**Other**
- `package.json` 3.9.0 → 3.10.0

### Substack pipeline 操作方式
1. mycrm `/admin/newsletter/quick-send/[id]` 做好內容 → 按「發布到 RSS」
2. Substack Settings → Import from RSS → URL 填 `https://crm.cancerfree.io/api/newsletter/feed.xml`
3. Substack 定期 poll，抓到新 item 自動建草稿
4. Po 在 Substack 登入確認排版、按 publish

### 還沒做（下輪）
- AI 自動寫稿：`/api/ai-newsletter-compose` 接 Gemini + `newsletter_tone_samples` few-shot
- 老 wizard `/admin/newsletter` 的 `tag_ids → list_ids` 遷移（wizard 11 處 UI 要改；quick-send 先行不阻塞）
- unlinked subscribers 手動配對介面 `/admin/newsletter/unlinked`

## v3.9.0 — feat(contacts): 建立者篩選（2026-04-22）

Po 要求聯絡人列表能依「誰建立的」篩選。

### 改動
- `src/app/api/contacts/all/route.ts`：SELECT 加 `created_by` uuid（配合原本就有的 `users!created_by(display_name)`）
- `src/app/(dashboard)/contacts/page.tsx`：
  - `Creator` interface + `creators` state、`fetchAll()` 多 fetch 一次 `users(id, display_name)`
  - `selectedCreators: string[]` 多選
  - filter bar 在 Email Status 和「認識於」輸入框中間加「建立者」下拉（多選 checkbox，含選幾位顯示 badge 數字、底部「清除」）
  - Filter 邏輯加 `matchCreator`（與其他 filter AND）
  - URL `?creator=uuid1,uuid2` 可直接初始化
  - 重用既有 `contacts.creator` i18n key（「建立者」/「Creator」/「作成者」— 無新 key）
- `package.json` 3.8.2 → 3.9.0

### 行為
- 不選 → 顯示全部
- 選一位以上 → 只顯示那些人建立的聯絡人
- 跟其他 filter 都是 AND：例如「選 Po + Tag=VIP + 國家=TW」會同時套三個條件

## v3.8.2 — fix(bot): `/p 姓名 | 公司` 超出 Telegram 64-byte callback_data 上限（2026-04-22）

Po 實測 `/p 姜至剛|衛福部食藥署` bot 無反應，但 `/p 姜至剛` 正常。追到根因：v3.8.1 把 name+company 用 JSON base64 塞進 `callback_data`，**Telegram 硬上限 64 bytes 當場爆表**（`create_p_` + base64(`{"n":"姜至剛","c":"衛福部食藥署"}`) = 65 bytes，超 1）。Telegram 直接回 400 拒收整則 inline_keyboard 訊息，bot 看起來像沒反應。

### Fix
改用 session 承載任意長度的 name / company：
- `/p 姓名 | 公司` 找不到 → `setSession(fromId, 'confirm_create_p', { name, company })`
- `callback_data` 改固定字串 `confirm_create_p` / `cancel_p`（各 17 bytes 以內，遠低於 64）
- Callback handler 優先讀 session context，若拿不到就 fallback 舊格式 `create_p_<base64>`（in-flight 舊訊息相容，24 小時後可刪）
- `cancel_p` 也記得 `clearSession` 避免 dangling state

### 改動
- `src/app/api/bot/route.ts`：`/p` 找不到段改 session 模式；callback handler 加 `confirm_create_p` 分支，保留 legacy 解析；`cancel_p` 清 session
- `package.json` 3.8.1 → 3.8.2

## v3.8.1 — fix(hunter): 回報三態 + /p 帶公司 + 編輯重試 + help 更新（2026-04-22）

v3.8.0 送出後 Po 實測：/p 戴建丞 建立後 bot 完全靜默（像沒動作）、且真實情況下 Hunter 對純中文名 + 政府單位基本查不到。本版處理三個具體 gap。

### A. Hunter 查詢結果一律回報（Telegram 不再沉默）
`enrichContactEmail` 改回傳 `{ status, email }` 六態：
- `found` — 查到並寫回
- `not_found` — 查了 Hunter 但無結果（cron 30 天後重試）
- `skipped_cjk_name` — 純 CJK 名 Hunter 參數驗證會直接 400，未送，**不記 hunter_searched_at**（未來補英文名即可重試）
- `skipped_no_company` — Hunter 沒 company 不能查，**不記**
- `skipped_no_key` — 系統未設 API key
- `error` — 網路/API 錯誤（記 searched_at、30 天重試）

三語 `enrichStatusMessage()` 把 status 翻成使用者可讀訊息。Bot `/a` / `/li` / `/p` 建立新聯絡人三處都呼叫，**不管查到沒都發一則狀態訊息**。Web 新增/批次上傳仍是 fire-and-forget（背景），編輯頁特殊情況會 alert。

### B. `/p 姓名 | 公司` 帶公司語法
Bot 新指令語法（向下相容）：
- `/p 戴建丞` — 現有行為
- `/p 戴建丞 | 經濟部` — 找不到時建立新聯絡人**同時填入公司**
- `/p 戴建丞, 經濟部` — 逗號分隔也接受

callback payload 從 `base64(name)` 改 `base64(JSON {n, c})`，callback handler 相容舊格式。bot-messages.ts 三語 help 同步更新。

### C. 編輯聯絡人自動重試
`contacts/[id]` 編輯儲存時：若 `email` 仍空 + (`company` 從空變填 OR `name_en` 從空變填)：
- 自動把 `hunter_searched_at` 設 null
- Fire `/api/hunter/enrich` 背景查
- 查到的話 alert 顯示新 email 並 reload

意味著「名片 OCR 沒抓到公司 → 事後手動編輯補公司」也能觸發 Hunter 第二次查詢。

### 改動
- `src/lib/hunter.ts`：`EnrichStatus` / `EnrichResult` 型別 + `enrichStatusMessage(r, lang)` 三語訊息；`splitName` 對 CJK-only 名直接 return empty（防 Hunter 400）
- `src/app/api/bot/route.ts`：
  - `/a` 名片存檔後 Hunter 段改 call shared helper、一律 `sendMessage(status)`
  - `/li` 大段 inline Hunter 碼 refactor 為 10 行 shared helper 呼叫
  - `/p 姓名` 加 `| 公司` 語法解析、callback payload 改 JSON
  - `create_p_*` handler 解析新 JSON 並帶 company insert
- `src/app/(dashboard)/contacts/[id]/page.tsx`：`saveEdit()` 加 Hunter 重試邏輯
- `src/app/api/hunter/enrich/route.ts`：回傳完整 `EnrichResult`
- `src/lib/bot-messages.ts` 三語：`/p` help 句更新為 `[姓名] 或 /p 姓名 | 公司`
- `src/messages/{zh-TW,en,ja}.json`：`contacts.hunterFoundEmail` toast key
- `docs/features/contacts.{md,en.md,ja.md}` 三語：Hunter 章節擴充（bot 三態訊息、編輯重試、CJK 限制說明）
- `package.json` 3.8.0 → 3.8.1

### 戴建丞現況處理
- DB 手動 reset `hunter_searched_at = null`
- 現狀 `name='戴建丞'`, `name_en=null`, `company='經濟部'`, `email=null`
- Hunter 目前仍不會查（CJK-only name）→ 建議 Po 編輯補上 `name_en`（例如「Chien-Cheng Tai」）→ 編輯儲存會自動重試
- 但政府單位 Hunter 命中率極低，實際能不能查到靠運氣

## v3.8.0 — feat(hunter): 全新建流程自動查 email + 每日 cron 清舊帳（2026-04-22）

Po 反映：原本 Hunter.io Email Finder 只有 `/li` LinkedIn 辨識時會自動查，其他新建路徑（`/a` 名片、批次上傳、手動新增、`/p 姓名` 找不到）都沒用上，舊 800 筆沒 email 的聯絡人也沒排程清理。重點是 Hunter Free tier 50/mo 但「找不到不扣 credit」，所以可以積極批次清。

### 改動
- **`src/lib/hunter.ts`（新）**：抽共用模組
  - `enrichContactEmail(contactId, nameEn, name, company)` — 單查，寫回 email + hunter_searched_at
  - `runHunterBatch({ maxContacts, cooldownDays, remainingBuffer })` — 批次查，執行前檢查 Hunter 帳號 credits，低於 buffer 就 skip
  - `getHunterAccount(apiKey)` — 讀 plan / used / available / remaining
- **新建聯絡人自動查 email 空的四條路徑**：
  - `/a` 名片 bot 流程 (`route.ts:1805`)：OCR 無 email → fire Hunter → 查到訊息通知
  - `/p 姓名` 找不到 (`route.ts:1642`)：新增「建立新聯絡人」按鈕流程 → callback `create_p_*` 建 minimal contact → 等照片 + 查 Hunter
  - 批次上傳 (`batch-upload/page.tsx:201`)：每筆 insert 後 fire-and-forget `/api/hunter/enrich`
  - 手動新增 (`contacts/new/page.tsx:353`)：submit 無 email → fire-and-forget enrich
  - `/li` 保留原 inline 邏輯不動（低風險、已經 stable）
- **`/api/hunter/enrich`（新）**：client-side 新建流程用的包裝 endpoint
- **`/api/hunter/cron`（新）**：cron route，每天 02:00 TPE/JST 跑 50 筆 backlog
  - auth 用 `Bearer CRON_SECRET`
  - credit buffer = 5（Hunter 帳號剩 < 5 searches 就 skip 這次）
  - 800 筆舊帳約 16 天清完一輪（30 天 cooldown 擋重查）
- **`vercel.json`**：加 `crons: [{ path: "/api/hunter/cron", schedule: "0 18 * * *" }]`
- **Vercel env**：新增 `CRON_SECRET`（production + development）。原 `CRON_SECRE`（拼錯 T）保留備查，可後續手動刪
- **`src/app/api/admin/hunter/route.ts`**：POST 重構為 `runHunterBatch({ maxContacts: 100 })` 一行

### 部署後要做
1. Vercel dashboard 手動補 `CRON_SECRET` 到 **Preview** 環境（CLI 對 preview all-branches 模式有限制）
2. 確認舊 `CRON_SECRE` 可以刪除後手動清掉（本次不動避免誤刪還有其他地方在讀）

## v3.7.1 — refactor(last_activity): 排除所有 SendGrid 寄送（含 ad-hoc 群發）（2026-04-21）

v3.7.0 只用 `campaign_id IS NOT NULL` 過濾，Po 指出其實**不管是否掛 campaign**，只要是 SendGrid 寄的都不該算進 last_activity（因為 SendGrid 典型用途是自動大量發送）。互動紀錄仍照常寫進 DB，只是不影響「誰跟我最近有互動」的排序訊號。

### 改動
- **DB migration `interaction_logs_send_method`**：
  - `interaction_logs` 加 `send_method text CHECK (in outlook/sendgrid/null)`
  - Backfill：既有 campaign 綁定的 log 統統標 `'sendgrid'`（過去 campaign 都是走 SG 寄的）；3827 筆個別 log 因無法回推維持 NULL
  - 部分索引 `idx_interaction_logs_contact_activity` 配合新 trigger 查詢
  - 兩個 trigger function 過濾條件從 `campaign_id IS NULL` 改為 **`send_method IS DISTINCT FROM 'sendgrid'`** — NULL 視為可計入（向下相容），`'outlook'` 可計入，`'sendgrid'` 排除
  - 全表 backfill contacts.last_activity_at
- `src/app/api/email/send/route.ts`：所有插入的 interaction_logs 帶 `send_method: method`
- `src/app/(dashboard)/contacts/[id]/page.tsx`：個別寄信 insert log 時帶 `send_method: 'outlook'`
- `src/app/(dashboard)/email/compose/page.tsx`：SendGrid 按鈕選中時顯示紫色提示「⚠ SendGrid 寄送不會計入聯絡人最後活動時間（仍會寫互動紀錄）」
- i18n 三語加 `sendgridActivityNote` key
- `package.json` 3.7.0 → 3.7.1

### 行為矩陣
| 寄送途徑 | send_method | 算 last_activity? |
|---|---|---|
| 聯絡人頁寄信（個別） | `outlook` | ✅ |
| `/email/compose` Outlook | `outlook` | ✅ |
| `/email/compose` SendGrid | `sendgrid` | ❌ |
| Newsletter campaign | `sendgrid` | ❌ |
| Bot /met /work /meet | NULL (非 email) | ✅（type=note/meeting） |

## v3.7.0 — feat(mail): 寄信附加聯絡人照片 + fix: last_activity 排除 newsletter（2026-04-21）

### 1. 寄信可附加聯絡人已上傳的照片
Po 的工作流：拍合照 → `/p` bot 上傳 → 在聯絡人頁寫感謝信 → 要附照片進去。原本只能再從本機上傳一次同樣的檔案，冗餘。

- 寄信 modal 新增「聯絡人照片」區塊（有照片才出現）
- 顯示該聯絡人所有已上傳照片的縮圖 gallery
- 點縮圖即從 Supabase Storage 抓圖、轉 base64、加到附件；再點一下移除
- 已附加狀態用藍框 + 藍色勾勾 icon 標示
- 共用 5 MB 單檔上限
- i18n 三語同步 4 個新 key

### 2. Newsletter 群發不再污染 last_activity
Po 提醒：一封 newsletter 寄給 4000+ subscribers，如果每個 contact 的 `interaction_logs` 都算活動，last_activity_at 會被洗到全部「今天」，訊號崩潰。

**Heuristic**：`interaction_logs.campaign_id IS NOT NULL` → 是 newsletter campaign 送出 → **排除**不算活動。個別 1-to-1 email（contact detail 頁、bot 等）`campaign_id` 都是 NULL 會照算。

- DB migration `last_activity_exclude_newsletter_campaigns`：兩個 trigger function 都加 `AND il.campaign_id IS NULL` 過濾；全表 backfill
- 現有 3907 筆 note/meeting/email log 中，80 筆 campaign 送出的被排除，3827 筆個別互動繼續算

### 邊界
- Ad-hoc 群發（`/email/compose` 沒綁 campaign_id）仍會算活動。使用者一次寄給 10 人通常還是想 follow up，不過度過濾。未來若要更嚴，可加 `is_bulk` 欄位或用 batch size 判斷。

### 改動
- `src/app/(dashboard)/contacts/[id]/page.tsx`：
  - `tempAttaches` shape 擴展可選 `photoId`
  - `toggleContactPhotoAttach()` handler
  - mail modal 加 "聯絡人照片" 區塊（含 hover / attached 狀態）
- `src/messages/{zh-TW,en,ja}.json`：`contactPhotos` / `attachPhoto` / `photoAttached` / `attachPhotoFailed`
- DB migration `last_activity_exclude_newsletter_campaigns`
- `package.json` 3.6.2 → 3.7.0

## v3.6.2 — refactor(contacts): last_activity 簡化 + fix: 照片上傳也算活動（2026-04-21）

v3.6.0 加了「最後活動」欄位到聯絡人列表，Po 回饋：**欄位在 UI 上多餘** — 既然預設排序就把最近有活動的人推到頂，多一欄日期反而資訊重複。而且他舉的實際場景暴露了另一個 bug：拍了三好健嗣的合照上傳後，三好沒浮到頂。

**根因**：照片上傳只寫 `contact_photos` 表，沒寫 `interaction_logs`（即使有合照附註，寫的也是 `type='system'` 被 trigger 過濾掉）。所以 `last_activity_at` 不會被 bump，照片上傳不算活動。

### 改動
- **DB migration `contact_photos_bump_last_activity`**：
  - 新 trigger `trg_contact_photos_last_activity` 監聽 `contact_photos` INSERT/DELETE，以 `GREATEST(interaction_logs MAX, contact_photos MAX, created_at)` 公式重算
  - 舊 `update_contact_last_activity()` 函式同步擴大 — 加 note/meeting/email 時不能 REGRESS 一個更晚時間的照片活動
  - Backfill 全表：把過往的照片時間戳納入既有 `last_activity_at`
  - 驗證：奥津徹 + 三好健嗣 (今天上傳照片) 都正確浮到 last_activity_at = 2026-04-21
- **UI 拿掉「最後活動」欄位**（v3.6.0 新增的）— 預設排序生效但不佔列寬
- i18n `lastActivity` key 三語皆刪（孤兒）
- `package.json` 3.6.1 → 3.6.2

### 背後模型（保留紀錄供日後調整）
`contacts.last_activity_at` 目前訊號來源：
- ✅ `interaction_logs` type IN (`note`, `meeting`, `email`)
- ✅ `contact_photos` 任何 row (INSERT/DELETE)
- ❌ `interaction_logs` type=`system`（刻意排除，避免 bot 自動產生的「名片新資料」/「合照附註」這種系統記錄污染訊號）

## v3.6.1 — feat(newsletter): 匯入過去 3 期電子報當 AI tone corpus（2026-04-21）

Po 提供 2026 年 2、3、4 月電子報（中/英/日各一份，9 個檔）作為未來 AI 撰寫新電子報的語氣參考語料庫。

### 改動
- **DB migration `newsletter_tone_samples`**：
  - `newsletter_tone_samples` 表：`language` (zh-TW/en/ja check)、`period` (YYYY-MM)、`html_content`、`plain_text` (HTML strip 後)、`title` (自動抓 h1/h2)、`source_file`
  - 索引 `(language, period DESC)` 方便按語言撈最新幾期做 few-shot
  - RLS：authenticated 可讀；寫入走 service role
- **`scripts/import-newsletter-tone-samples.mjs`**（新）：讀 `NEWSLETTER_CORPUS_DIR` 下的月份資料夾 → 偵測語言 (中/英/日 keyword) → parse period (2604 → 2026-04) → strip HTML → upsert。冪等（重跑會刪掉同 lang+period 後再 insert）

### 匯入結果（2026-04-21 執行）
| period | zh-TW | en | ja |
|---|---|---|---|
| 2026-02 | 2989 chars | **0 chars (原檔為空)** | 3046 chars |
| 2026-03 | 2742 | 4848 | 2815 |
| 2026-04 | 4402 | 8399 | 4629 |

9 筆中 8 筆有效。2026-02 英文版原始檔只有 3 bytes — Po 需要重新提供該月英文版（不影響目前使用，AI 可用另外 2 期英文做 few-shot）。

### 還沒做（下次 session）
- `/api/ai-newsletter-compose` 接入 Gemini few-shot：從 `newsletter_tone_samples` 按語言撈最新 3 期 → 注入 system prompt 當 tone reference → 用戶的 outline + 照片 → 生出符合該語氣的新電子報 section HTML
- Admin UI：`/admin/newsletter/compose` 讓 Po 輸入 outline bullets + 上傳照片 → 預覽 + 寄測試
- 仍 block 在「SendGrid CSV 匯入 subscribers」未完成

### 範圍
- `package.json` 3.6.0 → 3.6.1
- 新檔：`scripts/import-newsletter-tone-samples.mjs`
- DB migration：`newsletter_tone_samples`

## v3.6.0 — feat(contacts): 依最後活動時間排序（2026-04-21）

Po 反映有些舊聯絡人最近有新活動紀錄，但列表按 created_at 排序就藏在後面很難找。加「最後活動時間」欄位讓這些聯絡人浮到前面，保留原本「建立時間」欄供切換。

### 改動
- **DB migration `contacts_last_activity_at`**：
  - `contacts.last_activity_at timestamptz NOT NULL DEFAULT now()`
  - 部分索引 `idx_contacts_last_activity_at (last_activity_at DESC) WHERE deleted_at IS NULL`
  - Trigger `trg_update_contact_last_activity`：`interaction_logs` INSERT/UPDATE/DELETE 時，把該 contact 的 last_activity_at 重算成 `MAX(created_at) WHERE type IN ('note','meeting','email')` 或 fallback `contacts.created_at`
  - 意外遷移：UPDATE 若改變 contact_id（極罕見），新舊兩邊都會重算
  - Backfill 執行完 2374 筆聯絡人中 1568 有活動紀錄，805 無活動退回 created_at
- **API `/api/contacts/all`**：`select` 加 `last_activity_at`，預設排序改 `.order('last_activity_at', { ascending: false })`
- **UI `/contacts`**：
  - 表格加一欄「最後活動」，點 header 可排序
  - 欄位值若等於 `created_at` 顯示「—」避免資訊重複
  - 保留原「建立時間」欄
  - 預設順序依 API（活動時間 DESC）
- i18n 三語加 `lastActivity` key
- `package.json` 3.5.1 → 3.6.0

### 範圍定義（用戶確認）
- 「活動紀錄」只算 type = `note` / `meeting` / `email`（排除 `system`/`scan`）
- 無活動紀錄的聯絡人 fallback 到 `created_at`（不會永遠沉底）
- UI 加切換 = 點欄位 header 切換排序

## v3.5.1 — fix(auth): /api/me 用 email 查 + feat(mail): 單聯絡人改用 TipTap（2026-04-21）

### 1. 刪除按鈕真正原因
終於找到 Po 明明是 super_admin 卻看不到刪除按鈕的根源：**auth.users.id ≠ public.users.id**。`/api/me` 原本用 `.eq('id', user.id)` 查 public.users，auth id 和 public id 不同 UUID，查不到 row → role 回空字串 → 前端 `role === 'super_admin'` 判斷永遠 false。聯絡人詳細頁的 `currentUserRole` state 也因此從來沒被正確填進去。

修法：
- `/api/me` 改用 `.ilike('email', user.email).maybeSingle()`，加詳細註解避免下次又有人踩雷
- contact detail page 改用 `/api/me` fetch profile（而非 client-side query），canDelete 權限判斷 `super_admin OR 建立者` 救回來
- 拿掉上 commit 偷渡的「永遠顯示」fallback
- 刪除按鈕的 `ml-auto` 拿掉，回到原本 inline 位置（跟 編輯/寄信/合併 同一列）

### 2. 單聯絡人寄信 UI 統一
原本單聯絡人「寄信」modal 用 `<textarea>`，而群發郵件用 TipTapEditor，UI / 功能都差很多。把 modal body 換成 TipTapEditor，AI 生成 call `returnHtml: true` 產生 HTML 格式，套用範本時 bump editor key 讓 TipTap 重新渲染 HTML content。

### 改動
- `src/app/api/me/route.ts`：email lookup + 完整型別 + 防呆註解
- `src/app/(dashboard)/contacts/[id]/page.tsx`：
  - `load()` 改用 `/api/me`
  - 救回 `currentUserRole` state + `canDelete` 判斷
  - 刪除按鈕拿掉 `ml-auto`
  - 寄信 modal `<textarea>` → `<TipTapEditor>`
  - AI 生成加 `returnHtml: true`，範本套用 + AI 生成都 bump `mailEditorKey`
- `package.json`：3.5.0 → 3.5.1

## v3.5.0 — feat(trash): 批次永久刪除 + fix(contacts): 刪除按鈕可見性（2026-04-21）

### 1. 刪除按鈕可見性 fix
Po 回報「編輯/寄信/合併都看到，就是沒有刪除」。DB 確認 `pohan.chen@cancerfree.io` role 是 super_admin，email case 一致、RLS policy 是 `qual=true`，code 邏輯 `currentUserRole === 'super_admin' || created_by === currentUserId` 正確，但前端 role state 在某些情境下沒正確設進來（暫時無法在生產端 repro，診斷成本高）。把前端 canDelete 改成「已登入就顯示」，真正的權限檢查由 backend `DELETE /api/contacts/[id]` 把關（原本就有 super_admin OR creator check，會回 403）。改完 Po 一定看得到按鈕，不是 super_admin / creator 的人按了會 alert 錯誤 — 符合 CRM 常見做法。

另外把 client 的 profile 查詢改成 `ilike` + `maybeSingle()`，並加 error / warn log，方便以後遇到類似問題可以看 console 診斷。

### 2. 回收區批次永久刪除
`/admin/trash` 以前要一筆一筆按「永久刪除」。加：
- 表格第一欄 checkbox，header 有全選 / 取消全選（含 indeterminate 狀態）
- 選取 >0 時右上 banner 冒出「永久刪除選取 (N)」紅字按鈕
- 永遠顯示的「全部永久刪除」紅底按鈕（一鍵清空整個回收區）
- 新 API `DELETE /api/contacts/trash/bulk`，body `{ ids: [...] }` 或 `{ all: true }`，super_admin only，會一併清 Storage 名片圖，CASCADE 清 contact_cards / contact_tags / interaction_logs
- i18n 三語同步（warningBanner / selectAll / bulkDeleteSelected / deleteAll / confirmBulkDelete / confirmDeleteAll / bulkDeleteSuccess / bulkDeleteFailed）

### 改動
- `src/app/api/contacts/trash/bulk/route.ts`（新）
- `src/app/(dashboard)/admin/trash/page.tsx`：多選狀態、bulk handler、checkbox 欄、bulk action banner
- `src/app/(dashboard)/contacts/[id]/page.tsx`：canDelete 放寬 + profile 查詢 robustness
- `src/messages/{zh-TW,en,ja}.json`：trash namespace 加 8 個 key
- `package.json`：3.4.0 → 3.5.0

## v3.4.0 — feat(bot): Portkey gateway 容錯 Gemini 503（2026-04-21）

Telegram bot 最近在 Google AI Studio 免費 tier 碰到 503（Gemini 被降低優先級）。原本的 `withGeminiRetry` 只做「1 次重試、固定等 3 秒」，救不回大部分失敗。引入 [Portkey](https://portkey.ai) AI Gateway 代理 Gemini，取得 **loadbalance 兩把 Gemini project key + 3 次指數退避重試（1 → 2 → 4 秒）** 加集中觀測能力。兩把 key 50/50 隨機分流，單一 project 壓力減半，大幅降低觸發 free-tier priority degradation 的機率；策略定義在 Portkey Config，可從 dashboard 即時調整而不需 redeploy。

### 改動
- `src/lib/gemini.ts`：
  - 新增 `portkey-ai` 依賴，以 OpenAI-compatible chat completions API 包 Gemini 呼叫
  - 以 `config: process.env.PORTKEY_CONFIG_ID` 指向 Portkey dashboard 上的 config（loadbalance + retry 在那邊定義；virtual key 也在那邊存放 Google AI keys）
  - 遷移：`analyzeBusinessCard` / `parseTaskCommand` / `parseMeetingCommand` / `parseMetCommand` / `parseVisitNote`
  - 新增 `parseLinkedInScreenshot()` — 把 bot route 原本 inline 的 LinkedIn OCR 邏輯收攏
  - 移除 `withGeminiRetry()`（Portkey 已做更完整的重試）
  - `generateEmailContent` 保留原 `@google/generative-ai`（`safety_settings` BLOCK_NONE 不透過 Portkey 無法乾淨透傳；且該函式只由 web `/api/ai-email` 呼叫，不在本階段範圍）
- `src/app/api/bot/route.ts`：
  - 4 處 `withGeminiRetry(() => ..., onFirstFailure)` 改為直接呼叫 parseXxx / analyzeBusinessCard
  - `/li` LinkedIn 路徑 40 行 inline 程式碼換成一行 `parseLinkedInScreenshot(...)`
- `.env.local.example`：新增 `PORTKEY_API_KEY` 與 `PORTKEY_CONFIG_ID`
- `package.json`：3.3.9 → 3.4.0，加 `portkey-ai`

### 範圍（刻意限縮）
- ✅ Bot 指令全受保護：`/a` 名片、`/li` LinkedIn、`/work` 任務、`/meet` 會議、`/met` 拜訪筆記（含 visit note parse）、teams-bot 的會議解析
- ✅ 副作用：`/api/ocr`、`/api/ai-format`、`/api/linkedin/parse` 因共用 `gemini.ts` 自動受惠
- ❌ 不升級 Gemini 付費 tier、不換模型、不動 `failed_scans` retry queue — 留作後續 iteration

### 部署前需手動做
1. 到 https://app.portkey.ai，用 2 把 Gemini project API key 建 2 個 Virtual Keys
2. 建一個 loadbalance Config 指向兩個 VK（weight 0.5 / 0.5、retry on 429/5xx）
3. 把 Portkey API key 與 Config ID 填進 Vercel env vars（production / preview / development 三環境）
4. `GEMINI_API_KEY` 仍保留（`generateEmailContent` 走原生 SDK 還需要它）

### 不影響
- DB schema 無變更
- `ai_models` / `ai_endpoints` 使用者自訂 key 機制維持
- 影像處理（`imageProcessor.ts`）維持 1024×1024 JPEG q85
- 使用者介面訊息維持「🔍 辨識中...」，Portkey 重試期間靜默（7 秒內完成）

## v3.3.9 — Chore: newsletter wizard step 4 簡化（2026-04-21）

SendGrid API 寄信時會自己做 rate limiting，`daily_limit` / `send_hour` 這兩個欄位只是假的節流、沒有實際意義（使用者也跟我確認過）。把兩個 input 與相關「N 天完成」計算統統拿掉，step 4 只剩「排程寄送時間（留空 = 立即寄送）」一欄。

### 改動
- `src/app/(dashboard)/admin/newsletter/page.tsx`：
  - 刪 `dailyLimit` / `sendHour` 狀態、UI 輸入、`estimateDays()` 工具函式、schedule summary 區塊
  - `duplicateCampaign` / `campaignPayload` 不再帶 `daily_limit` / `send_hour`（DB column 還在，有 default 值 500 / 9，不影響既有資料）
  - step 4 現在只剩 datetime-local 一欄 + 說明
- `src/messages/{zh-TW,en,ja}.json`：刪 5 個 keys（`dailyLimit` / `sendHour` / `scheduleSummary` / `estimatedCompletionDate` / `daysToComplete`）、加 2 個（`scheduleHintImmediate` / `sendSummary`）、改 `startTime` 措辭
- `package.json`：3.3.8 → 3.3.9

### 不影響
- DB schema 不變（`newsletter_campaigns.daily_limit` / `send_hour` 保留不 drop；之後再遷移時再拆）
- 寄送 API（`/api/email/send`）本來就沒吃這兩個欄位
- 既有 campaign 的 `daily_limit` / `send_hour` 值保留（UI 不顯示而已）

## v3.3.8 — Refactor: 自動產生的 note 改用 `type='system'`（2026-04-21）

架構債清理。`/notes` 原本靠 6 條 `.not('content', 'ilike', '<prefix>%')` 把系統筆記擋掉，每新加一個 prefix 就要兩邊同步，容易漏（像昨天的 `【名片新資料】` 就是被漏掉的受害者）。

### 改動
- **7 處寫入點**從 `type: 'note'` 改 `type: 'system'`：
  - `src/app/api/bot/route.ts:524, 581, 1830`（bot 拍名片 / 合照附註 / 新增名片）
  - `src/app/(dashboard)/contacts/batch-upload/page.tsx:207`（批次上傳）
  - `src/app/(dashboard)/contacts/new/page.tsx:354`（手動新增）
  - `src/app/(dashboard)/contacts/[id]/page.tsx:630, 735`（名片更新 / 合照附註）
- **DB migration**：把既有 339 筆 `type='note'` 的系統筆記改成 `type='system'`（三語 prefix 全覆蓋）
  - before: meeting=3140, system=1382, email=726, note=371
  - after:  meeting=3140, system=1721, email=726, **note=32**（剩下的 32 筆就是真正的使用者筆記）
- **`/notes/page.tsx`**：刪掉 6 條 `.not('content', 'ilike', ...)`、改用單一 `.neq('type', 'system')`

### 不影響
- `/contacts/[id]` 詳情頁的互動時間軸依然顯示所有類型（含 system），使用者看得到「這人何時被匯入 / 合併」的歷史
- `admin/reports` 不依 type='note' 計數（grep 確認過）

### 動到的檔
- `src/app/api/bot/route.ts`
- `src/app/(dashboard)/contacts/batch-upload/page.tsx`
- `src/app/(dashboard)/contacts/new/page.tsx`
- `src/app/(dashboard)/contacts/[id]/page.tsx`
- `src/app/(dashboard)/notes/page.tsx`
- DB migration: `migrate_auto_notes_to_system_type`
- `package.json`：3.3.7 → 3.3.8

## v3.3.7 — Fix: 筆記搜尋漏掉兩個系統自動筆記的過濾（2026-04-20）

使用者反饋：`/notes` 類別選「筆記」時，會看到 `【名片新資料】...` 這種系統自動產生的資料。

原因：`notes/page.tsx` 的 DB filter 清單有列其他 4 條（Telegram bot / 名片王匯入 / 批次上傳 / 名片王合併），但漏掉 Telegram bot 的這兩條：
- `【名片新資料】...`（拍名片時）
- `【合照附註】...`（合照附註時）

修正：補上兩條 `.not('content', 'ilike', ...)`。

### 動到的檔
- `src/app/(dashboard)/notes/page.tsx`：filter 清單加 2 條
- `package.json`：3.3.6 → 3.3.7

### 後續架構債（非本次範圍）
自動產生的 note 分散在 7 處、只能靠字串 prefix 濾掉；理想做法是加 `subtype` 欄位或統一用 `type='system'`。現階段維持字串比對。

## v3.3.6 — Fix: 測試寄信沒附附件（2026-04-20）

使用者反饋：「我測試信件時候附件好像不會 attached。」

原因：`/api/email/test-send` 完全沒寫附件處理邏輯，`handleTestSend()` 也只用 JSON 送請求、沒帶附件檔。群發 (`/api/email/send`) 的 multipart/form-data 流程沒複製到測試寄信這邊。

修正：
- `/api/email/test-send` 比照群發 route 加 `multipart/form-data` 處理：讀 FormData、把 files 轉 base64、Outlook 送 Graph API 的 `attachments`、SendGrid 送 `attachments` 陣列
- `handleTestSend()` 有附件時改用 FormData 送，沒有就沿用 JSON

### 動到的檔
- `src/app/api/email/test-send/route.ts`：加 `FileAttachment` / `TestSendBody` types、multipart 解析、Outlook + SendGrid 附件傳遞
- `src/app/(dashboard)/email/compose/page.tsx`：`handleTestSend` 附件時改走 FormData
- `package.json`：3.3.5 → 3.3.6

## v3.3.5 — Feat: Outlook TO/BCC 可選；修正 BCC 寄信數錯字（2026-04-20）

兩個相關修正（`/email/compose`）：

### 1. Outlook 加 TO/BCC 選擇
- 原本 Outlook 群發鎖死 BCC：寄件人自己在 TO、所有收件人放 BCC，互相看不到。
- 新增 sub-mode toggle（跟 SendGrid 的做法對齊）：
  - **BCC**（預設，現有行為）：1 封郵件，收件人互相看不到
  - **全部 TO**：1 封郵件，所有收件人在 TO，互相看得到（內部介紹 / 小組討論情境）
- 後端 `/api/email/send` 接 `outlookMode: 'bcc' | 'to'`，Graph API 的 to/bcc 欄位依此切換。

### 2. 修正成功訊息錯字
原本訊息「已成功寄出 {N} 封」誤導：Outlook BCC 與 SendGrid BCC 都是 **1 封**郵件寄到 N 位聯絡人，不是 N 封。改成語意正確：

| 模式 | 訊息 |
|---|---|
| Outlook BCC | 1 封郵件送達 N 位聯絡人（BCC，互相看不到） |
| Outlook TO | 1 封郵件送達 N 位聯絡人（全部 TO，共同可見） |
| SendGrid BCC | 1 封郵件送達 N 位聯絡人（SendGrid BCC） |
| SendGrid 個人化 | 已寄出 N 封個人化郵件（每人一封） |

寄件確認信（SendGrid）的統計句也跟著調整。

### 動到的檔
- `src/app/api/email/send/route.ts`：加 `outlookMode`、回傳 `emailCount`/`mode`、`buildConfirmationHtml` 接 `mode` 參數
- `src/app/(dashboard)/email/compose/page.tsx`：UI toggle、請求帶 `outlookMode`、成功訊息依模式切換 key
- `src/messages/{zh-TW,en,ja}.json`：新增 9 個 keys（3 語言同步）
- `package.json`：3.3.4 → 3.3.5

## v3.3.4 — Fix: TipTap 段落間空行在預覽 / 寄出時被 margin collapse 吃掉（2026-04-20）

使用者反饋：寫信時段落間空一行，預覽時空行不見。

原因：TipTap 對「連按兩次 Enter」產生 `<p></p>` 空段落。HTML 瀏覽器的 margin collapse 會讓相鄰 `<p>` 的上下 margin 合併，空 `<p></p>` 本身沒內容也沒 line-height → 視覺上完全消失，不管幾個空行都一樣。

修正：`TipTapEditor` 對輸出內容和 preview HTML 做一次 `<p></p>` → `<p>&nbsp;</p>` 轉換，讓空段落保留 line-height。三個使用此元件的頁面（`/admin/templates` / `/email/compose` / `/admin/newsletter`）全部受惠。收件端（Gmail/Outlook）也會正常顯示空行，不再被壓扁。

### 動到的檔
- `src/components/TipTapEditor.tsx`：加 `preserveBlankParagraphs()` helper，`onUpdate` 與 `previewHtml` 各套一次
- `package.json`：3.3.3 → 3.3.4

## v3.3.3 — Fix: 郵件範本頁手機可看、內文就地展開、編輯器升級 TipTap（2026-04-20）

三點使用者反饋修正（`/admin/templates`）：

1. **手機看不到內文** — 原本只有桌面 `<table>`，手機上欄位擠成一團看不清楚。改成響應式卡片列表，手機/桌面共用一套版面。
2. **網頁版要看內文要按編輯** — 列表無內文預覽，必須開啟 modal。改為點範本標題列展開，內文就地 render。
3. **範本編輯器比群發陽春** — 原本 `<textarea rows={8}>`，純文字、無工具列。改用跟 `/email/compose` 共用的 `<TipTapEditor>`：粗體/斜體/清單/連結/圖片/變數 `{{name}}` 等、附預覽模式與 AI 排版。

### 動到的檔
- `src/app/(dashboard)/admin/templates/page.tsx`：table → 可展開卡片、textarea → TipTapEditor、新增 `expandedId` state
- `package.json`：3.3.2 → 3.3.3

### 不用動
- i18n：新增的 UI 只靠 icon + 既有 keys（`common.edit`/`common.delete`、`templates.attachCount`），無新翻譯需求
- TipTapEditor 本身：沿用同一元件，不改它的實作

## v3.3.2 — Fix: 聯絡人照片刪除、手機多選寄信（2026-04-20）

### 🐛 Bug #1：聯絡人照片刪不掉
`contacts/[id]/page.tsx:deletePhoto` 不檢查 Supabase delete error，失敗時靜默吞掉；且 storage 檔案沒一起刪，留垃圾。

修正：
- 加 error 檢查 + 失敗時 alert
- 刪 DB 後順手 `supabase.storage.from('cards').remove([storage_path])` 清理檔案
- `ContactPhoto` interface 加 `storage_path`
- `load()` 查詢把 `storage_path` 一起 select 回來

### 🐛 Bug #2：手機版無法多選聯絡人寄信
`contacts/page.tsx` 桌面版 table（L666）有 checkbox，但 `sm:hidden` 的手機卡片版**完全沒 checkbox**，所以手機上無法選取多人。`selectedIds` 永遠空 → 「寄信給 N 人」按鈕不出現。

修正：
- 手機卡片加上選取 checkbox（每張左側）
- 手機清單頂部加「全選 / 已選 N 人」bar
- 選取狀態用琥珀色 border 高亮（和桌面版 `bg-amber-50` 呼應）
- 新增 i18n keys：`contacts.selectAll`、`contacts.selectedCount`

選完後畫面頂部原有的「寄信給 N 人」+「批次編輯」按鈕會自動出現（已在 header，不分桌機手機）。

## v3.3.1 — 放寬 users 表 SELECT（保留 OAuth token 防護）（2026-04-20）

### 動機
v3.3.0 把 `public.users` 設成全操作限 super_admin，結果**非 super_admin 使用者**在 `/contacts`、`/contacts/[id]`、`/admin/trash` 等頁面看「建立者 / 刪除者」欄時全部空白（因為 Supabase join `users(display_name)` 被 RLS 擋）。

### 變更
- **RLS policy 改為 per-op**：
  - `users_select` — authenticated 全員可讀（UX 修好）
  - `users_insert / users_update / users_delete` — 仍限 `is_super_admin()`
- **Column-level privilege**：
  - authenticated 可 SELECT 15 個欄位：`id / email / display_name / role / granted_features / last_login_at / created_at / telegram_id / teams_user_id / teams_conversation_id / teams_service_url / locale / theme / ai_model_id / gemini_model`
  - `provider_token` + `provider_refresh_token` 不 grant → **這兩個欄位只有 service_role 讀得到**（它們是活的 Microsoft Graph OAuth bearer token，員工讀到會能盜用同事身份寄 email）

### 驗證
- 已執行 `SELECT column_name FROM information_schema.column_privileges WHERE grantee='authenticated'` 確認 `provider_token` / `provider_refresh_token` 不在 grant 清單
- Supabase Security Advisor 無新問題

### Tradeoff
- `role` 和 `granted_features` 對所有員工公開 — 不是安全問題（大家知道誰是 super_admin、誰有 bulk_email 權限對內部工具無害）
- 寫入仍只有 super_admin（等於「誰能改 role」這件事本身是 super_admin 的特權，與 v3.3.0 一致）

## v3.3.0 — RLS 全面部署 + 安全硬化（2026-04-20）

Supabase Security Advisor 從 **18 ERRORS + 23 WARN = 41 問題** → **0 ERROR + 15 WARN**。

### 設計原則

共享 CRM：「登入 = 可信員工，全員看得到所有聯絡人」。管理權限沿用現有 `users.granted_features` 陣列（12 個 feature）+ `role='super_admin'`。

### Migration（已 apply 到 Supabase myCRM project via MCP）

**1. Helper functions**
- `has_feature(feature_key text) → bool`：super_admin 自動全有 / 否則檢查 `granted_features @> ARRAY[key]`
- `is_super_admin() → bool`：以 JWT email 查 `public.users.role`

**2. ai_endpoints：api_key 欄位限 service_role**
- RLS + column privilege 雙層防護
- `REVOKE SELECT ON ai_endpoints FROM anon, authenticated` + `GRANT SELECT (id, name, base_url, is_active) TO authenticated`
- 寫入 policy 限 `is_super_admin()`
- **結果**：即使員工登入也看不到 Gemini API key；只有 service role（API routes）能讀

**3. Tier 0 — 核心共享（11 張表 RLS + authenticated 全員讀寫）**
`contacts`、`contact_tags`、`contact_cards`、`contact_photos`、`interaction_logs`、`pending_contacts`、`gemini_models`（讀）、`ai_models`（讀）
- 例外：`contacts` 的 `DELETE`（永久刪除）需 `has_feature('trash')`
- `gemini_models` / `ai_models` 的**寫入**限 `is_super_admin()`

**4. Tier 1 — Feature-gated writes（15 張表）**
| Table | Feature gate |
|---|---|
| `tags` | `tags` |
| `countries` | `countries` |
| `email_templates`, `template_attachments` | `email_templates` |
| `prompts` | `prompts` |
| `camcard_pending` | `camcard` |
| `duplicate_pairs` | `duplicates` |
| `failed_scans` | `failed_scans` |
| Newsletter 一家 7 張表 | `newsletter` |

**5. Tier 2 — super_admin only**
- `users`：全部操作限 super_admin（讀/寫都是）。**注意**：非 super_admin 使用者看不到其他人的 display_name，未來可能要引入 view 或 API route 補 UX
- `system_settings`、`docs_content`、`medical_departments`：讀全員、寫 super_admin

**6. Tier 3 — user-scoped**
- `user_prompts`：`user_id = 目前使用者的 users.id`
- `feedback`：自己看自己的 + super_admin 看全部；UPDATE/DELETE 限 super_admin

**7. Service-role-only（無 policy）**
- `bot_sessions`、`telegram_dedup`：RLS 開啟但無 policy → 只走 service_role（Telegram webhook）

**8. Function search_path 硬化（14 個 function）**
`ALTER FUNCTION ... SET search_path = public, pg_temp`

**9. Storage bucket policies**
- 移除舊的 `Public read cards`（允許 LIST all files）和偽裝成 service-role 的 `Service role upload cards`
- `cards` / `camcard` / `template-attachments`：authenticated 可 INSERT/UPDATE/DELETE；SELECT 不需 policy（bucket `public=true` 直接 URL 可讀）
- `feedback` bucket：保留既有 "auth users can upload own feedback screenshots" INSERT policy，新增 authenticated DELETE

**SQL 檔**：`supabase/rls_security.sql`（consolidated）

### 剩下的 15 個 warnings（都是設計使然）

- 8 × `rls_policy_always_true`：核心共享 table 的 `USING(true)`／`WITH CHECK(true)` — 這就是共享 CRM 設計
- 2 × `rls_enabled_no_policy`：`bot_sessions` / `telegram_dedup` 刻意只給 service_role
- 3 × `extension_in_public`：`pg_trgm` / `pg_net` / `citext` — 移動風險高，不動
- 1 × `auth_leaked_password_protection`：需手動到 Dashboard → Authentication → 打開 "Prevent sign-ups with compromised passwords"
- 1 × bot-related infos（RLS 開啟無 policy）

### ⚠️ 手動動作（user 需做）

1. 到 Supabase Dashboard → Authentication → Policies → 打開 **"Prevent sign-ups with compromised passwords"**
2. **關注**：非 super_admin 使用者在 `/contacts` 等頁面看聯絡人時，「建立者」欄可能變空白（因為 `users` 表限 super_admin）。如果要修，之後可加一個 `users_public` view 或 API route

## v3.2.3 — TypeScript 錯誤清零（40 → 0，含 3 個真 bug 修正）（2026-04-20）

### 🔴 修到的真 bug（都是 TS 告狀才發現的）

- **`bot/route.ts:1191`** — `/lang` 指令用了 `from`（undefined），應該是 `fromId`。實際執行會拋 ReferenceError，使用者切語言會失敗。
- **`bot/route.ts:1295, 1326`** — `generateEmailContent()` 回 `{ text, subject? }`，但程式把整個 object 當 HTML 存：`body_html: body` 變 `[object Object]`。Bot 的 AI 郵件預覽 + 送出都拿錯內容。
- **`reset-mfa/route.ts:49-50`** — `service.auth.admin.mfa.listFactors()` 回的是 `{ factors: Factor[] }`，程式當成 `{ totp: [], phone: [] }` 存取，`allFactors` 永遠空，reset MFA 永遠回報 `deleted: 0`。

### 其他修正

- **`tsconfig.json`**：`target` 從 ES2017 → ES2020；`exclude` 加入 `supabase/functions/**/*`（Deno 邊緣函式，不該被 Node TS 編譯）→ 一次消掉 21 個 Deno 相關假錯誤
- **`src/types/heic-convert.d.ts`**（新檔）：補缺失的模組宣告
- **`admin/prompts/page.tsx`**：`PROMPT_USER_EDITABLE` Record 補上 `meeting_parse: false`
- **`bot/route.ts:773`**：`cardData.rotation && cardData.rotation !== 0` → `cardData.rotation`（truthy 檢查已排除 0，`!== 0` 多餘）
- **`hunter/route.ts:163`**：`.select('id', { count: 'exact', head: true })` 在 update query 不支援，改成 `.select('id')` + `data.length`
- **TipTap v3 遷移**（`TipTapEditor.tsx`）：
  - `setContent(html, true)` → `setContent(html, { emitUpdate: true })` × 2
  - `extendMarkToLink({ href: '' }).unsetLink()` → `extendMarkRange('link').unsetLink()`
- **Supabase relation 型別轉換**（7 處）：`as X` → `as unknown as X`（supabase-js 推論 relation 為陣列，程式當 1:1 物件用）
  - `admin/newsletter/page.tsx:661`、`admin/trash/page.tsx:116`、`notes/page.tsx:88`
  - `bot/route.ts:170, 645`、`linkedin/parse/route.ts:56`、`lib/gemini.ts:62`

### 結果
- `npx tsc --noEmit` → **0 errors**
- i18n audit 仍然乾淨（只有 6 個 DB filter literal 刻意保留）

## v3.2.2 — 完成 i18n 遷移尾巴 11 個檔案（2026-04-20）

### 變更項目
- 剩下 11 個檔案的 hardcode 中文全部改用 `t()`：
  - `admin/reports/page.tsx`：tag/country filter、互動類型、時間/地點表頭
  - `contacts/batch-upload/page.tsx`：OCR 失敗 / 處理失敗 / `legacyCardFront` / `cardAlt`
  - `notes/page.tsx`：跳至 placeholder（4 個 `.ilike()` DB filter literals 保留並加 `// i18n:` 註記）
  - `admin/models/page.tsx`：4 個 placeholder（endpoint / API key / model id / model name）
  - `admin/users/page.tsx`：MFA 重設 confirm / alert / 「已設定」「未設定」「重設中...」「重設」
  - `tasks/page.tsx`：指派時間 / 指派人 title
  - `PermissionGate.tsx`：沒有權限 / 請聯絡管理員
  - `email/compose/page.tsx`：「我」label
  - `feedback/page.tsx`：上傳截圖 button
  - `unassigned-notes/page.tsx`：（空白）fallback
  - `layout.tsx`：Next.js metadata 改用 `generateMetadata` async function + `getTranslations('app')`
- 使用既有的 key（`scripts/add-final-keys.mjs` 昨晚已 seed）
- Three-language key count: **1105 / 1105 / 1105**，sync diff = 0

### 最終結果
Audit 顯示剩 6 行，全是**刻意 SKIP**的 DB filter literals（`.includes('新增名片')` / `.ilike('%透過 Telegram Bot 新增名片%')` 等）— 這些字串由 bot / batch-upload / camcard 寫入 DB 當 log 內容，UI 篩選這些 log 時需 literal 比對，不能改。都附上 `// i18n: ...` 註解說明原因。

真實 i18n 違規：**0**

### Remote trigger 關閉
昨晚建的 `mycrm-i18n-nightly`（`trig_01GfPK42u2uhprqGa5jmnbqd`）在 02:13 JST 觸發但沒 push（推測 remote agent 缺 GitHub push token）。已 disable trigger 避免日後空轉。Lesson: 需 write-back 的工作不適合 remote scheduled trigger，本地 `/loop` 或手動執行較可靠。

## v3.2.1 — Newsletter migration + skeleton templates 已部署（2026-04-20）

### 變更項目
- **已 apply**：`supabase/newsletter_subscribers.sql` 的 migration 已透過 Supabase MCP 執行到 myCRM 專案
  - 3 張表建好：`newsletter_subscribers`（0 rows）、`newsletter_lists`（4 rows seeded）、`newsletter_subscriber_lists`（0 rows）
  - `link_subscriber_to_contact` trigger 上線
  - RLS 啟用（authenticated read / service_role write）
  - citext extension 啟用
- **已 insert**：3 份 newsletter skeleton 模板已寫入 `email_templates` 表
  - `Newsletter Skeleton — 中文月報`（5879 bytes）
  - `Newsletter Skeleton — English`（5402 bytes）
  - `Newsletter Skeleton — 日本語`（5405 bytes）
- **Advisor fix**：`link_subscriber_to_contact` 函式加上 `SET search_path = public, pg_temp` 防止 function_search_path_mutable 警告
- SQL 檔同步更新，下次 re-run idempotent

### 已部署驗收
```
newsletter_subscribers  → 0 rows（等 CSV 匯入）
newsletter_lists        → 4 rows（zh-TW/en/ja/zh-TW-marketing）
email_templates (skel)  → 3 rows
```

### 下一步（等 user 提供資料或決策後才動）
- 跑 `scripts/import-newsletter-subscribers.mjs` 匯入 4 份 CSV
- 建 `/admin/newsletter/compose` UI
- 實作 AI tone-aware compose（等 user 提供歷史電子報 corpus）
- 改 newsletter wizard：`tag_ids` → `list_ids`
- 建 `/admin/newsletter/unlinked` 報表頁

## v3.2.0 — Newsletter subscriber schema + import 腳本鋪底（2026-04-20）

### 變更項目
- `supabase/newsletter_subscribers.sql`：新增 3 張表 + trigger，可手動在 Supabase Dashboard SQL Editor 執行
  - `newsletter_subscribers`（獨立於 contacts 的訂閱戶池）
  - `newsletter_lists`（群組；預先 seed 4 個：`zh-TW / en / ja / zh-TW-marketing`）
  - `newsletter_subscriber_lists`（M:N junction，處理 email overlap）
  - 自動 link trigger：contact email 變更時，同 email 的 subscriber 會自動 link `contact_id`
  - Backfill query：對已有 contacts 和 subscribers 做一次性 link
  - citext extension（case-insensitive email）
  - RLS 啟用：authenticated 可讀、service_role 可寫（管理寫入走 API route）
- `scripts/import-newsletter-templates.mjs`：把 `docs/newsletter-templates/` 三份 skeleton 塞進 `email_templates`（冪等 upsert by title）
- `scripts/import-newsletter-subscribers.mjs`：SendGrid CSV → subscribers。支援多個 CSV → 多個 list 對應；同 email 出現在多份 CSV 會被合併成同一 subscriber 並掛到多個 list。column alias 可調整（預設認 `email / first_name / last_name` 各種拼寫）

### 還沒做（要等資料或決策）
- 執行 SQL migration（需要 Supabase 權限 + user review）
- 執行 template import 腳本（需要 service role env var 或 user 手動跑）
- 執行 CSV import（等 user 提供 4 份 CSV 路徑 + 確認欄位名稱）
- `/api/ai-newsletter-compose` endpoint（等 user 提供歷史電子報作為 tone corpus）
- 新增 `/admin/newsletter/unlinked` 管理頁面（未 link subscribers 清單）
- `newsletter_campaigns` 改用 `list_ids` 取代 `tag_ids`

## v3.1.0 — 查重規則升級 (A+B+E+F) + API 統一化（2026-04-20）

### 變更項目
- **規則 A**：`email` 比對改為 case-insensitive（`John@X.com` 跟 `john@x.com` 視為同一）
- **規則 B**：同步比對 `second_email`（主要 email 沒重複時，第二 email 也查）
- **規則 E**：`find_similar_contacts` 也跑在 `name_en` 上（英文名片能找到中文版聯絡人）
- **規則 F**：同樣跑在 `name_local` 上（日文名片亦然）
- **API 統一**：新增 `POST /api/contacts/check-duplicates` 伺服端端點；`contacts/new/page.tsx` 和 `contacts/batch-upload/page.tsx` 原本各自直接呼叫 `supabase.rpc()`，現在全部改走 API — 規則寫在 `src/lib/duplicate.ts` 單一位置，不會再出現 client-side 跟 server-side 行為不同步的問題
- **Telegram Bot**（`src/app/api/bot/route.ts:805`）原本就用 shared helper，更新參數簽章傳入所有 5 個欄位（email/second_email/name/name_en/name_local）
- **回傳結構**：`DuplicateResult.exact` 改為 `Contact[]`（原本是 `Contact | null`，因現在可能同時 match 主 email 與 second_email）

### 未採用（user 2026-04-19 決定）
- C（LinkedIn URL exact）、D（電話 normalize）、G（email domain + similar name）、H（門檻降 0.5）、I（同 company + similar name）— 誤判風險太高或收益有限

### 技術細節
- `lib/duplicate.ts` 的 `.ilike()` 呼叫會 escape `%/_/\\` wildcards，避免 email 內含特殊字元造成 pattern bypass
- 同一個聯絡人若同時符合 exact 和 similar，只回傳在 exact（不重複）

## v3.0.0 — Newsletter 模板骨架化：從 listmonk 重建為 mycrm 三語骨架（2026-04-19）

### 變更項目
- 新增 `docs/newsletter-templates/` 目錄收納月報骨架
- `skeleton-zh-TW.html`、`skeleton-en.html`、`skeleton-ja.html`：三語月報骨架，與原 listmonk 版本視覺一致（teal `#0D9488`、600px 容器、Helvetica Neue），但用 `{{placeholder}}` 取代所有可變欄位（logo / month / substack / intro / upcoming / recap / 社群連結 / opt-out URL）
- `block-section.html`：單一 section 區塊範本，每個 story 複製一份填空（`{{number}}｜{{title}}`、paragraphs、link、image）
- `README.md`：完整 placeholder 字典 + 後續規劃（AI compose endpoint、Supabase Storage 圖片搬家、template import 腳本）
- 骨架擺脫 listmonk 和 mailerlite 的 CDN 依賴（圖片 URL 全都是 placeholder），為後續自主運作鋪路

### 後續（待實作，已記入 project memory）
- 實作 `/api/ai-newsletter-compose`（吃 stories + photos → 填骨架）
- `newsletter_subscribers` + `newsletter_lists` schema + CSV 匯入 + 未 link 訂閱戶報表
- 三語骨架寫入 `email_templates` 資料表

## v2.17.0 — i18n 大規模遷移 + CLAUDE.md 整合 flightpath 規範（2026-04-19）

### 變更項目
- **i18n 遷移**：將 13 個頁面從 hardcode 繁中改為 `next-intl` `t()` 呼叫
  - contacts/[id]、admin/newsletter、admin/camcard、admin/trash
  - contacts/new、email/campaigns/[id]、settings、admin/health
  - contacts/page、TipTapEditor、docs、admin/countries、email-optout Suspense fallback
- 三語 JSON（zh-TW/en/ja）同步新增 334 keys（768 → 1102），en/ja 翻譯已寫入
- 跳過項：DB 字串比對（`.includes('新增名片')` 等）、公開頁自帶 3 語 dict（email-optout、unsubscribe、docs）
- 新增輔助腳本（`scripts/`）：`audit-i18n-darkmode.mjs` 盤點、`extract-zh.mjs` 單檔提取、`add-*-keys.mjs` 批次加入 key
- **CLAUDE.md 整合**：從 flightpath 整合 Behavioral Guidelines、Dark mode 強制、Mobile-first、i18n 三語同步、MFA 強制、RLS、Conventional Commits、效能標準、Vitest/Playwright 測試等章節；移除 DrAva Bot Engine、pnpm 禁令、`{ success, data }` API 格式等不適用 myCRM 的規定

## v2.9.0 — Email 編輯器強化：模板、變數、預覽（2026-04-16）

### 變更項目
- 新增模板選擇器：從 email_templates 載入已存模板，一鍵套用主旨 + 內文
- 新增個人化變數：內文和主旨支援 `{{name}}`、`{{company}}`、`{{job_title}}`，SendGrid 路徑自動替換每位收件人資料
- Outlook BCC 模式使用變數時顯示警告（BCC 無法個人化）
- 新增預覽模式：可選擇模擬收件人，即時看到變數替換後的效果
- 主旨 placeholder 提示可用變數

## v2.8.4 — Microsoft OAuth scope 修正（2026-04-15）

### 變更項目
- 修正 Microsoft token refresh 缺少 `openid` scope 導致寄信失敗

## v2.8.3 — 寄送方式可選 + AI 潤稿修正（2026-04-15）

### 變更項目
- Outlook / SendGrid 寄送方式改為使用者可選（預設仍按人數自動建議）
- 超過 450 人選 Outlook 時顯示警告提示
- AI 潤稿改送純文字（去除 HTML 標籤），避免 Gemini PROHIBITED_CONTENT 錯誤

## v2.8.2 — BCC 修正 + AI 潤稿簡化（2026-04-15）

### 變更項目
- 修正 Outlook 路徑：所有聯絡人放 BCC，To 放寄件人自己（原本第一位聯絡人被放在 To 會被其他人看到）
- AI 潤稿簡化：移除額外描述框，直接一鍵抓內文潤飾成正式郵件
- Gemini 安全過濾器設為 BLOCK_NONE，避免商業郵件被誤擋

## v2.8.1 — 群發郵件 BCC 編輯、AI 撰寫、CC 多 email（2026-04-15）

### 變更項目
- BCC 收件人可展開編輯：點「展開編輯」可檢視所有收件人，點 X 可移除
- CC 欄位支援多個 email（逗號分隔），CC 不建立互動紀錄
- 新增「AI 撰寫」按鈕：可用自然語言描述信件內容，AI 生成郵件（可基於已有內文修改）
- 若主旨為空，AI 會一併生成主旨

## v2.8.0 — 群發郵件功能 + Tag 篩選排序改進（2026-04-15）

### 變更項目
- 新增群發郵件功能：聯絡人頁面篩選後可一鍵寄信，< 450 人走 Outlook Graph API（BCC），>= 450 人走 SendGrid（personalizations 逐封寄出）
- 新增 `/email/compose` 撰寫頁面：BCC 收件人摘要、CC 欄位（預設自己 email）、主旨、TipTap 富文字編輯器
- 新增 `/api/email/send` API：自動判斷 Outlook/SendGrid 路徑，寄完為每位聯絡人建立 email 類型互動紀錄
- Tag 篩選邏輯改為 OR（選多個 tag 時，符合任一即顯示）
- Tags 欄位新增排序功能（點擊 header 可按 tag name 排序）

## v2.7.2 — SendGrid 匯入寫入互動紀錄（2026-04-14）

### 變更項目
- import-suppressions API 重寫：分頁取全部（突破 500 筆限制）、限最近 90 天
- 匯入後自動為 CRM 裡有對應聯絡人建立 system 類型互動紀錄，帶 SendGrid 原始時間戳
- 紀錄內容：`SendGrid 硬退信：{原因}` / `SendGrid 無效信箱：{錯誤}` / `SendGrid 已退訂`
- 重複匯入安全：已有同類型 SendGrid log 的聯絡人不會重複建立
- 沒有對應 CRM 聯絡人的 email 不建 log

## v2.7.1 — Email 狀態加入「可寄信」篩選（2026-04-14）

### 變更項目
- 聯絡人清單 Email 狀態 filter 新增「✉ 可寄信」選項，篩出 email_status 為空（無問題）的聯絡人
- 可配合 Export 功能匯出這份名單直接寄信

## v2.7.0 — SendGrid Email 狀態整合（2026-04-14）

### 變更項目
- DB：contacts 表新增 `email_status` 欄位（bounced / unsubscribed / invalid），從 SendGrid 歷史資料 backfill 54 筆
- 聯絡人清單：新增「Email 狀態」filter dropdown（硬退信 / 已退訂 / 無效信箱）
- 聯絡人清單：email 欄位顯示狀態 badge（紅色硬退信、橘色已退訂、黃色無效信箱），手機版同步
- 聯絡人詳情：互動紀錄區塊頂端新增 SendGrid 狀態橫幅（有狀態時才顯示）
- API `/api/sendgrid/import-suppressions`：匯入後自動同步更新 contacts.email_status
- API `/api/contacts/all`：SELECT 加入 email_status 欄位

## v2.6.9 — 報表欄位完善（2026-04-09）

### 變更項目
- **統一名稱**：「會議」全改為「拜訪」（聯絡人互動紀錄標籤、報表類型顯示）
- **填寫人欄位**：報表新增「填寫人」欄位，顯示互動紀錄填寫者的 display_name
- **完整內容**：內容欄不再截斷，完整顯示並保留換行
- **欄位排序**：點擊欄位標題可排序（聯絡人、公司、類型、日期、填寫人）

## v2.6.8 — 報表新增國家與互動類型篩選（2026-04-09）

### 變更項目
- **國家篩選**：報表可多選國家（從聯絡人 country_code 動態載入）
- **互動類型篩選**：可多選拜訪 / 備忘 / Email

## v2.6.7 — MFA 狀態/重設改用 DB 函數（2026-04-09）

### 變更項目
- **MFA 狀態修正**：改用 DB 函數 `get_users_mfa_status()` 直接查 `auth.mfa_factors`，繞過 JS Admin API 權限問題
- **MFA 重設修正**：改用 DB 函數 `get_auth_user_id_by_email()` 查 auth UUID，取代 `listUsers()` 呼叫

## v2.6.6 — 報表 Tag 篩選根本修正（2026-04-09）

### 變更項目
- **報表 Tag 篩選修正**：改用 Supabase RPC（資料庫函數 `get_interaction_logs_by_tags`），讓 JOIN 在 DB 端完成。原因：當 MD tag 有 904 個聯絡人時，`.in()` 篩選會把 904 個 UUID 放入 URL（約 33,000 字元），超過 PostgREST URL 長度限制導致查詢失敗

## v2.6.5 — 報表移除建立時間欄位、MFA 狀態修正（2026-04-09）

### 變更項目
- **報表移除建立時間**：互動紀錄報表移除「建立時間」欄位（預覽與 Excel）
- **MFA 狀態修正**：改用 `listFactors` 逐一查詢，解決 `listUsers` 不一定包含 factor 資料的問題

## v2.6.4 — 使用者管理顯示 MFA 狀態（2026-04-09）

### 變更項目
- **MFA 狀態欄位**：使用者管理頁新增 MFA 欄位，顯示「已設定」（綠色）或「未設定」（灰色）
- **重設按鈕移至 MFA 欄**：重設 MFA 按鈕只在已設定 MFA 的使用者旁顯示，重設後狀態即時更新

## v2.6.3 — 三項修正（2026-04-09）

### 變更項目
- **名片王匯入語言預設**：根據 OCR 國家碼自動設定語言（JP→日文、TW/CN→中文、其他→英文）
- **報表互動日期**：無會議日期時改顯示互動紀錄的 `created_at` 日期
- **MFA 重設修正**：改用 email 查找 auth user，解決 "User not found" 錯誤；同時修正 MFA factors 屬性名稱（`totp`+`phone` 而非 `factors`）

## v2.6.2 — 名片王匯入新增語言選項（2026-04-09）

### 變更項目
- **名片王匯入語言選項**：每張名片卡片新增語言切換（中/EN/日），確認時會設定聯絡人的溝通語言

## v2.6.1 — 報表改版、MFA 重設修正（2026-04-09）

### 變更項目
- **報表僅保留互動紀錄**：移除聯絡人報表，只保留互動紀錄；過濾掉 `system` 類型及 Telegram Bot 新增名片記錄；Tag 篩選正確套用至互動紀錄
- **報表互動紀錄欄位**：新增時間、地點、建立時間欄位顯示
- **MFA 重設修正**：修正 Next.js 16 async params 問題，管理員重設 MFA 功能恢復正常

## v2.6.0 — MFA 重設、回饋截圖修正、報表 Tag 篩選、移除 Gmail（2026-04-09）

### 變更項目
- **管理員重設 MFA**：使用者管理頁新增「重設 MFA」按鈕，管理員可協助使用者清除 TOTP 驗證器，讓對方重新設置
- **回饋截圖上傳修正**：找到根本原因（`feedback` storage bucket 缺少 INSERT RLS policy），新增 migration 修正；同時修正 storage path 多餘前綴
- **報表 Tag 篩選**：報表產生頁新增 Tag 多選篩選，選取後只顯示有任一所選 tag 的聯絡人（OR 邏輯）
- **移除 Gmail 整合**：報表頁面移除 Gmail OAuth 連結區塊（API routes 保留）

## v2.5.2 — 名片審查多選批次確認（2026-04-09）

### 變更項目
- `/admin/camcard`：每張名片左上角新增 checkbox，載入後自動勾選無重複的卡片
- 有 `duplicate_contact_id` 的卡片 checkbox 呈 disabled，需手動合併或略過
- 已勾選卡片的 border 變綠，視覺上區分選取狀態
- Filter bar 新增「全選 / 取消全選」快捷鈕
- 頁面底部新增浮動確認列：顯示已選 N 張，一鍵送出批次確認
- 批次確認以 5 張一組平行執行，顯示進度條（確認中 X/N）
- 批次確認保留 tagIds 與 importance metadata

## v2.5.1 — Telegram Bot 新增 /lang 語言切換指令（2026-04-07）

### 變更項目
- Telegram Bot 新增 `/lang [zh|en|ja]` 指令，可直接在 Bot 切換回應語言（更新 `users.language`），切換後立即以新語言回覆確認
- `/help` 三語版本均加入 `/lang` 指令說明

## v2.5.0 — 名片審查篩選器；說明文件公開快速開始（2026-04-07）

### 變更項目
- `/admin/camcard`：新增篩選列（搜尋姓名／公司、國家、有重複、有 Email、排序），支援 400ms debounce 搜尋與一鍵清除
- `GET /api/camcard/pending`：新增 `search`、`has_duplicate`、`country_code`、`has_email`、`sort` 篩選參數
- `middleware.ts`：`/docs` 路由不再要求登入，未登入使用者可直接瀏覽快速開始文件

## v2.4.5 — 名片王匯入編輯功能（2026-04-03）

### 變更項目
- `/admin/camcard`：每張名片新增「編輯」按鈕，開啟 modal 可編輯所有 OCR 欄位（中文名、英文名、日文名、公司、職稱、Email、電話、地址等）後再確認匯入
- 新增 `PUT /api/camcard/[id]/update` API，更新 `camcard_pending.ocr_data`

## v2.4.4 — 個人設定頁 MFA inline 設定（2026-04-02）

### 變更項目
- feat: 個人設定頁 MFA 區塊改為 inline enrollment，點「啟用 MFA」後直接展開 QR Code + 驗證碼輸入，不再跳轉到 /mfa/setup 頁面
- i18n: mfa 新增 scanQr / manualEntry / cancel 三個 key

## v2.4.3 — Hunter.io 統計刷新、Footer 台北時間（2026-04-02）

### 變更項目
- fix: footer deploy 時間改用 `Asia/Taipei` timezone（Vercel build server 為 UTC，原本時間差 8 小時）
- feat: Hunter.io 統計區塊新增「重新整理」按鈕，可即時刷新無 email 聯絡人數量

## v2.4.2 — Teams Bot 改名 Dr.Ave（2026-04-02）

### 變更項目
- feat: manifest.json Bot 名稱 myCRM Bot → Dr.Ave，更換 color.png（ava.png 192×192）與 outline.png（白色透明），重新打包為 DrAve-Bot.zip

## v2.4.1 — fix: Bot slash command 在 waiting session 中無法正確 dispatch（2026-04-02）

### 變更項目
- fix: `handleText` 入口加統一 session-clear check，任何 slash command 在 active session 下都先 clear session 再正常 dispatch，修正 `/help`、`/search`、`/email` 等指令在 waiting 狀態下無效的問題

## v2.4.0 — 三語文件、Dr.Ave、MFA強制、Export授權、回饋表單（upcoming）

### 變更項目

- **文件全面三語化**：`docs/` 所有 Markdown 文件補齊英文（`*.en.md`）與日文（`*.ja.md`）版本；掃描補齊 Web UI i18n 三份語言檔缺漏 key
- **Teams Bot 改名 Dr.Ave**：更新 manifest.json Bot 名稱為 Dr.Ave；更換 color.png / outline.png 頭像；重新打包 zip（圖片由管理員提供）
- **MFA 強制登入（TOTP）**：所有使用者登入後強制設定 TOTP；新增 `/mfa/setup`（首次設定）與 `/mfa/verify`（每次登入驗證）頁面；middleware 加入 AAL 檢查；`/settings` 新增 MFA 管理區塊
- **聯絡人 Export 獨立授權**：Export 功能納入 `granted_features` 權限系統，新增 `export_contacts` 權限，預設所有人關閉；`/admin/users` 可個別授權；無權限者 Export 按鈕 disabled
- **系統回饋表單**：新增 `feedback` 表與 Storage bucket；Sidebar 新增「💬 回饋」入口；Bug 無截圖時送出前確認提示；新增 `/admin/feedback` 管理頁（列表、詳情、狀態更新，super_admin 限定）；回饋資料格式支援 Claude Code 讀取分析
- **TODO**：Supabase 備份策略（Synology NAS + Databasus）待後續版本規劃
- **DB**：新增 `feedback` 表
- **i18n**：zh-TW / en / ja 新增 mfa.*、feedback.*、contacts.exportNoPermission

---

## v2.3.1 — bot /n /v 支援直接帶聯絡人名字（2026-03-31）

### 變更項目
- fix: bot `/n 姓名` 及 `/v 姓名` 現可直接帶聯絡人名字，不再落入 fallback

## v2.3.0 — 功能權限管理系統（2026-03-31）

### 變更項目
- 新增 `users.granted_features TEXT[]` 欄位（需執行 DB migration）
- Super admin 可在使用者管理頁對每個使用者勾選開放功能
- 側邊欄：10 個可授權功能對所有使用者可見，super admin 專屬功能（AI模型、使用者管理、系統健康）僅 super admin 可見
- 無權限頁面顯示「沒有權限，請聯絡管理員」而非跳轉
- `/docs` 頁面改為需登入才能查看
- 新增 `src/lib/features.ts` 功能定義檔
- 新增 `src/components/PermissionGate.tsx` 權限守門元件
- 新增 `src/lib/checkPermission.ts` API 保護工具函式

### DB Migration（需手動執行）
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS granted_features TEXT[] DEFAULT '{}';
```

## v2.2.13 — 聯絡人頁移除電話欄、Bot 指令統一不用 @（2026-03-31）

### 變更項目
- 聯絡人列表頁移除電話欄位（表格和卡片視圖）
- Telegram Bot `/a` 和 `/p` 指令改為直接輸入姓名，不再需要 `@` 前綴（`/a 姓名`、`/p 姓名`）

## v2.2.12 — Hunter.io 顯示剩餘 credit（2026-03-31）

### 變更項目
- Hunter 介面加上本月剩餘／已用 credits（呼叫 Hunter /v2/account API）

## v2.2.11 — 修正新增聯絡人頁面輸入凍結問題（2026-03-31）

### 變更項目
- 將 Field 元件移至 NewContactPage 外部，避免每次 state 更新時 React unmount/remount 所有 input

## v2.2.10 — 修正新增聯絡人頁面 i18n 缺失 key（2026-03-31）

### 變更項目
- 補上 contacts.sectionBasic、contacts.sectionNotes（三語言）

## v2.2.9 — 聯絡人列表突破 1000 筆限制（2026-03-31）

### 變更項目
- `/api/contacts/all` 改用分批分頁（每批 1000 筆）累積所有聯絡人，解決 PostgREST max_rows=1000 硬上限問題

## v2.2.8 — 聯絡人列表改用 API route（2026-03-31）

### 變更項目
- 聯絡人列表改從 `/api/contacts/all`（service role）拉資料，繞過 PostgREST max_rows=1000 限制

## v2.2.7 — 聯絡人頁面修正（2026-03-31）

### 變更項目
- 聯絡人列表：fetch 上限從 1000 → 10000，修正聯絡人數顯示不完整
- 修正 `common.page` 顯示 raw key（參數名稱 `page` → `current`）

## v2.2.6 — Hunter 補查改進（2026-03-31）

### 變更項目
- 每次查詢上限從 50 → 100 筆
- 新增「重置查詢紀錄」按鈕，清空所有無 email 且查過未找到的 hunter_searched_at

## v2.2.5 — Dashboard 統計改用 DB 聚合（2026-03-31）

### 變更項目
- 國家分布、Tag 分布改用 SQL RPC（`dashboard_country_stats`, `dashboard_tag_stats`）
- 不再受 Supabase 前端 1000 筆上限影響，支援萬筆以上聯絡人

## v2.2.4 — 旋轉修正、筆記跳頁、Hunter明細（2026-03-30）

### 變更項目
- 名片旋轉：修正 params 未 await 導致 404（Next.js 15 async params）
- 筆記搜尋：跳頁輸入框移至頂部「第 X / Y 頁」旁邊
- Hunter 補查：結果明細分成「已找到」和「找不到」兩區塊分別顯示

## v2.2.3 — 修正語言檔根本問題（2026-03-30）

### 變更項目
- 修正 `src/i18n/request.ts` import 路徑：`../../messages/` → `../messages/`
- 刪除根目錄多餘的 `messages/` 資料夾（舊版本遺留，導致所有新 i18n key 無效）
- 現在所有語言 key 皆從正確的 `src/messages/` 載入

## v2.2.2 — 旋轉修正、科別標籤（2026-03-30）

### 變更項目
- 名片旋轉：修正二次旋轉失敗問題（URL 帶 `?t=` 時 Storage path 解析錯誤）
- 聯絡人：將「部門」標籤改為「科別」（符合醫療場景）

## v2.2.1 — 排序、旋轉、語言修正、Hunter明細（2026-03-30）

### 變更項目
- **國家管理排序**：點擊代碼/中文名/英文名欄位可排序，支援升降序切換
- **筆記搜尋**：新增日期排序切換（最新/最舊在前）；分頁加入跳頁輸入框
- **任務語言修正**：補齊三語 `tasks.status.*`（pending/done/postponed/cancelled）
- **名片圖片旋轉**：聯絡人頁名片圖 hover 顯示旋轉按鈕，點擊後自動旋轉 90° 並存回 Storage
- **Hunter 補查明細**：補查完成後顯示每位聯絡人查詢結果（姓名、公司、找到的 email）
- **語言補齊**：新增 `notes.sortNewest/sortOldest`、`hunter.searchDetail` 三語

---

## v2.2.0 — Hunter補查管理、語文Migration、筆記分組、Bot多語言、名片王分頁（2026-03-30）

### 變更項目

- **Hunter.io 補查管理頁面**：`/admin/health` 新增 Hunter.io 區塊；API Key 設定；顯示無 email 聯絡人統計（未查過 / 查過找不到 / 本月已查）；手動觸發補查按鈕；優先查從未查過的，超過 30 天再查，已有 email 完全跳過
- **聯絡人語文預設規則更新**：TW / CN → 中文；JP → 日文；其他 → 英文；跑 DB Migration 批次更新所有既有聯絡人
- **筆記搜尋頁改版**：以聯絡人分組顯示，每人預設最新 3 筆，依聯絡人最新筆記時間排序；超過 3 筆顯示「查看全部 →」跳聯絡人詳情頁；搜尋維持分組；未歸類筆記維持在 `/unassigned-notes`
- **Telegram Bot 多語言回覆**：所有 Bot 回覆訊息支援中 / 英 / 日三語自動切換；語言判斷順序：`users.language` → Telegram `language_code` → fallback 中文；新增 `bot-messages.ts` 語言包與 `getBotLanguage()` 共用函式
- **名片王匯入審查分頁**：`/admin/camcard` 加入分頁功能（PAGE_SIZE=20），支援直接跳頁
- **DB**：`contacts` 新增 `hunter_searched_at` 欄位；`system_settings` 補入 `hunter_api_key`

---

## v2.1.3 — 全面修正 i18n namespace 不符問題（2026-03-29）

### 變更項目

- **新增 `mail` namespace**：對應 contacts/[id] 頁面的寄信功能（原 `sendEmail` key 名不符）
- **新增 `models` namespace**：對應 AI 模型管理頁面（原 `aiModels` key 名不符）
- **新增 `tasks` namespace**：任務頁面全部 i18n key
- **新增 `countries` namespace**：國家管理頁面全部 i18n key
- **新增 `reports` namespace**：報表頁面全部 i18n key（含 Gmail 整合、排程）
- **補齊 `dashboard`**：title、recentContacts、countryDistribution、countryOther、pendingNotes、noNotes
- **補齊 `contacts`**：backToList、fax、addressEn、country、importance、creator、cardImages、interactionLogs、logPlaceholder、noLogs、loadMore、editContact、scanCard、sectionCompany/Contact/Social/Met、metAt/Date、referredBy、extraData、addTag、noTagsMatch、sendMail、uploadCard
- **補齊 `unassignedNotes`**：assignTitle、assignSearch、searching、notFound
- **補齊 `notes`**：allTypes、clearDate、confirmDelete、meetingDate
- **補齊 `users`**：colName/Email/Telegram/Teams/Role/LastLogin/Actions、selfRoleHint、updating、demoteToMember、promoteToAdmin
- **補齊 `settings`**：teamsBot、teamsBound/Unbound、aiModel、light/dark、assistants、assistantsHint、noAssistants、saved、saving
- **補齊 `templates`**：colTitle/Subject/Attachments/Created、aiGenerating、generate、uploading、uploadBtn、saving
- 同步 root `/messages/`

---

## v2.1.2 — 修正缺漏的 i18n keys（2026-03-29）

### 變更項目

- **新增 `batch` namespace**：批次上傳頁面重寫後所需的全部 key（status、dupLegend、progress 等）
- **新增 `login` namespace**：登入頁面的 subtitle、button、hint、errors.*
- **新增 `contacts.logTypes`**：聯絡人詳情頁的互動紀錄類型標籤（筆記、會議、郵件、系統）
- **新增 `notes.types`**：筆記搜尋頁的類型篩選標籤（筆記、會議、郵件）
- 同步 root `/messages/` 與 `src/messages/`

---

## v2.1.1 — 改用 Hunter.io Email 補查；修正 i18n root messages（2026-03-29）

### 變更項目

- **Hunter.io 取代 Apollo.io**：LinkedIn 聯絡人無 email 時改用 Hunter.io Email Finder API 補查（`system_settings` key: `hunter_api_key`）
- **修正 i18n root messages**：同步 `messages/` 根目錄語言檔，修正部署後 `nav.trash`、語文篩選、維護頁等 key 未生效的問題

---

## v2.1.0 — 系統維護模式、OCR 重試、Apollo Email 補查、筆記過濾、回收區改進（2026-03-29）

### 變更項目

- **筆記搜尋過濾**：筆記搜尋頁排除系統自動產生的預設紀錄（「透過 Telegram Bot 新增名片」、「從名片王匯入」開頭的紀錄）
- **聯絡人篩選加語文**：聯絡人列表頁新增語文篩選下拉（全部 / 中文 / EN / 日文）；修正語文欄位 i18n 顯示（english → EN）
- **回收區 sidebar 修正**：三份語言檔補上 `nav.trash` key，修正側邊欄顯示 `nav.trash` 原始 key 的問題
- **回收區聯絡人詳情**：回收區列表聯絡人姓名改為可點擊，彈出 Modal 顯示完整詳情（唯讀），含還原與永久刪除操作
- **系統維護模式**：新增 `system_settings` 表；Bot 新增 `/stop` 指令（super_admin 限定），開啟後所有非 super_admin 使用者的 Bot 輸入與 Web 頁面均顯示維護中訊息；新增 `/maintenance` 頁面
- **LinkedIn 截圖存儲**：Bot `/li` 與網頁 LinkedIn 截圖確認建立聯絡人後，截圖壓縮存入 Storage，`card_img_url` 填入截圖 URL
- **姓名 fallback 統一**：名片掃描與 LinkedIn OCR 統一套用 `if (!name && name_en) name = name_en` 邏輯
- **Gemini OCR 自動重試**：抽出 `callGeminiWithRetry()` 共用函式；OCR 失敗後回覆「⏳ 辨識失敗，3 秒後自動重試...」，等 3 秒重試一次；重試仍失敗才存入 `failed_scans`；適用所有 Bot Gemini 呼叫（名片、/li、/p、/n）
- **Apollo Email 補查**：整合 Apollo.io API；LinkedIn 建立的聯絡人若無 email，背景自動呼叫 Apollo `people/match` 查詢；查到則更新 `contacts.email` 並追加通知使用者；API Key 存於 `system_settings` 表
- **DB**：新增 `system_settings` 表（`maintenance_mode`、`apollo_api_key`）
- **i18n**：zh-TW / en / ja 新增 v2.1 相關 key（nav.trash、maintenance、languageFilter、language.english 簡化為 EN）

---

## v2.0.0 — 權限強化、回收區、照片 EXIF、語文欄位、醫師欄位（2026-03-29）

### 變更項目
- **說明書修正**：修正 Quick Start Telegram Bot 綁定步驟說明
- **刪除權限限制**：聯絡人刪除僅限建立者與 super_admin；非權限使用者隱藏刪除按鈕
- **軟刪除 / 回收區**：所有刪除改為軟刪除（deleted_at），新增 `/admin/trash` 回收區頁面（僅 super_admin 可查看、還原、永久刪除）
- **網頁端照片 EXIF**：上傳合照時前端自動提取 GPS 座標與拍攝日期（exifr），呼叫 reverse geocode 取得地名，顯示日期以拍攝日期為準
- **語文欄位**：contacts 新增 language 欄位（中文/英文/日文），依 country 自動預設（TW→中文、JP→日文、其他→英文）
- **醫師欄位**：contacts 新增 hospital（自由輸入）與 department（科別，自由輸入）欄位
- **DB**：contacts 新增 deleted_at、deleted_by、language、hospital、department 欄位
- **i18n**：zh-TW / en / ja 新增 v2.0 相關 key
- **拜訪紀錄擴充**：interaction_logs 新增 meeting_time、meeting_location 欄位；Web UI 拜訪表單新增時間與地點欄位；報表 Excel 新增對應欄位；Bot 新增 `/n`（自然語言 AI 解析）與 `/v` `/visit`（逐步詢問）兩種拜訪紀錄指令


## v1.9.9 — 相簿頁改版：一人一張縮圖（2026-03-26）

### 變更項目
- 相簿頁改為每位聯絡人只顯示一張封面縮圖，多張時顯示 +N 標示
- 點擊縮圖開啟 lightbox 放大顯示
- 修正根目錄 messages/ 缺少 nav.photos 翻譯鍵（sidebar 顯示「相簿」）

## v1.9.8 — 修正 sidebar 翻譯顯示（2026-03-26）

### 變更項目
- 補全 nav 命名空間所有缺少的 i18n 鍵（appTitle、logout、tasks、reports、tags、models、users、prompts、countries、newsletter、failedScans、duplicates、camcard、health）
- 修正 sidebar 顯示「nav.photos」而非「相簿」的問題
- 修正相簿頁圖片改用 `<img>` 標籤（解決 Supabase signed URL 無法顯示問題）
- 修正相簿頁照片依聯絡人分組顯示

## v1.9.7 — 全域相簿搜尋 + LinkedIn 截圖轉聯絡人（2026-03-26）

### 變更項目
- **全域相簿搜尋**：新增 `/photos` 頁面，跨所有聯絡人顯示合照；支援以附註、拍攝地點、聯絡人姓名關鍵字搜尋；grid 縮圖排列，點擊展開原圖
- **API**：新增 `GET /api/photos?q=` route，JOIN contacts，支援關鍵字過濾
- **Sidebar**：新增「相簿」入口（所有登入使用者可見）
- **LinkedIn 截圖轉聯絡人**：新增 Bot 指令 `/li`，傳送 LinkedIn Profile 截圖 → Gemini Vision OCR → 確認後寫入聯絡人（source='linkedin'）
- **LinkedIn 網頁入口**：新增聯絡人下拉選單「LinkedIn 截圖」，解析後 pre-fill 新增表單
- **API**：新增 `POST /api/linkedin/parse` route（Gemini Vision，回傳 name/title/company/linkedin/email/notes）
- **i18n**：zh-TW / en / ja 新增 photos、linkedin 相關 key


## v1.9.6 — /p 支援多張照片與共同附註（2026-03-25）

### 變更項目
- feat: `/p` 上傳合照支援多張（照片或以檔案傳送皆可），每新增一張即更新計數訊息
- feat: 按「完成」後詢問共同附註，附註存入互動紀錄；多張時顯示張數
- feat: `processPersonalPhoto` 改為接受 `fileIds[]` 批次處理

## v1.9.5 — 合照附註功能（2026-03-25）

### 變更項目
- feat: Bot `/p` 上傳合照後詢問附註，附註存入 `contact_photos.note` 並同步寫入互動紀錄
- feat: 網頁合照區塊支援點擊照片下方加入/編輯附註，儲存後同步寫入互動紀錄
- db: `contact_photos` 新增 `note text` 欄位（需執行 migration）

## v1.9.4 — /a 命令正確填入英文姓名欄位（2026-03-25）

### 變更項目
- fix: `/a` 新增名片時，`name_en`（英文姓名）與 `name_local`（日文姓名）獨立對應各自欄位，不再被誤合併到 `name` 欄位；修正日本名片背面英文姓名無法填入的問題

## v1.9.3 — 支援 HEIC/HEIF 照片格式（iPhone 照片）（2026-03-25）

### 變更項目
- fix: 加入 `heic-convert` 套件，處理前自動偵測並轉換 HEIC/HEIF 為 JPEG，解決 Sharp 不支援 HEIF 壓縮格式的錯誤

## v1.9.2 — 修正新增聯絡人頁面重要性顯示與網址驗證（2026-03-24）

### 變更項目
- fix: 新增聯絡人頁面重要性按鈕顯示 H/M/L（原本因 i18n key 不存在而顯示錯誤）
- fix: 網站/LinkedIn/Facebook 欄位改用 `type="text"`，允許 `www.xxx.com` 格式不帶 https://

## v1.9.1 — 修正名片 Storage 路徑含非 ASCII 字元錯誤（2026-03-24）

### 變更項目
- fix: 確認/合併名片時，Storage 檔名自動移除中日文等非 ASCII 字元，避免 Supabase "Invalid key" 錯誤
- fix: 純中/日文名稱（無英文）的檔名 fallback 為 `card`

## v1.9.0 — 支援多張名片 + 合照功能（2026-03-24）

### 變更項目
- feat: Bot 掃名片確認後，同步 INSERT 至 `contact_cards` 表
- feat: 新指令 `/a`（取代 `/ab`）— 新增任意名片，OCR 比對現有資料，確認後填入空白欄位，衝突存備註
- feat: 新指令 `/p` — 新增合照，壓縮後存入 `contact_photos`，自動讀取 EXIF 時間/GPS 並 reverse geocode 地名
- feat: 新建 `contact_photos` table（含 taken_at, latitude, longitude, location_name）
- feat: 新增 `processPhotoWithExif` / `extractExif` / `reverseGeocode` 工具函式
- feat: 聯絡人詳情頁名片顯示正反面並排
- refactor: 移除 `/ab` 指令，改以 `/a` 統一處理名片新增
- feat: 聯絡人詳情頁新增「合照」區塊，顯示日期/地點（EXIF 自動讀取）
- feat: 新增 `/api/geocode` route（代理 Nominatim reverse geocoding）
- feat: Web 上傳名片時，OCR 衝突欄位自動存入備註（interaction_logs）

## v1.8.3 — 修復 /ab 背面名片 bug 及聯絡人刪除失敗（2026-03-23）

### 變更項目
- fix: /ab 照片確認步驟，防止 session 殘留導致照片存到錯誤聯絡人
- feat: /ab 無參數支援，自動帶入上一位聯絡人（同 /email、/note 行為）
- fix: 修正 5 個 contacts FK 的 NO ACTION，改為 SET NULL / CASCADE，解決聯絡人無法刪除問題
- refactor: 抽出 processBackCardPhoto() helper 避免重複邏輯

## v1.8.2 — 網址可點擊連結（2026-03-23）

### 變更項目
- 聯絡人詳細頁：網站、LinkedIn、Facebook 欄位改為可點擊連結（新分頁開啟）
- 名片王審查頁：網站欄位改為可點擊連結
- 自動補全 `https://` 前綴，避免無協定網址連結失效

## v1.8.1 — 聯絡人重要性欄位（2026-03-23）

### 變更項目
- **DB**：`contacts` 新增 `importance text not null default 'medium'`，CHECK constraint 限制值為 `high` / `medium` / `low`
- **聯絡人列表**：每筆顯示三顆橫排綠色圓點 icon，亮起顆數代表重要程度（🟢🟢🟢 高 / 🟢🟢⚪ 中 / 🟢⚪⚪ 低），不顯示文字
- **聯絡人列表篩選**：頂部 filter bar 新增「重要性」下拉選單（全部 / High / Medium / Low），支援 `?importance=` query string，可與搜尋、tag、場合篩選疊加
- **聯絡人詳情頁**：「基本資料」區塊新增「重要性」欄位，可編輯（segmented control）
- **新增聯絡人表單**：新增「重要性」欄位，預設 Medium
- **API**：`GET /api/contacts` 新增 `importance` 過濾參數；`POST` / `PATCH` 接受 `importance` 欄位
- **i18n**：zh-TW / en / ja 新增 `importance` 相關 key


## v1.8.0 — 名片王審查頁面加入分頁（每頁 50 筆）（2026-03-23）

### 變更項目
- `GET /api/camcard/pending`：新增 `limit` / `offset` query 參數，回傳 `{ cards, total }` 格式（原本回傳陣列）
- `/admin/camcard` 頁面：加入翻頁按鈕（上一頁 / 下一頁），頭部顯示「第 N / M 頁」
- 每頁固定 50 筆，當前頁顯示完畢後自動重新載入下一批

## v1.7.16 — 修正名片王確認人：改用 session cookie 直接查 email（2026-03-23）

### 變更項目
- confirm/merge route 改用 `createClient()` 讀 session cookies → `auth.getUser()` → 用 email 查 `users` 表取 `display_name`
- 移除對 middleware header 和 body param 的依賴（前兩種方式都不可靠）
- 還原 middleware 移除 v1.7.15 加入的 request header 修法（無效且複雜）

## v1.7.15 — 修正 middleware x-user-id 改為 request header（2026-03-22）

### 變更項目
- middleware 改用 `NextResponse.next({ request: { headers: requestHeaders } })` 將 `x-user-id` 寫入 **request header**，route handler 才能正確讀取（舊版誤設 response header，route handler 讀不到）
- 保留 Supabase session cookies 以維持 auth 正常運作

## v1.7.14 — 修正名片王確認人：改用 middleware header 傳遞 user ID（2026-03-22）

### 變更項目
- middleware 驗證 session 後將 user ID 寫入 `x-user-id` response header，confirm/merge route 直接讀取，徹底繞開 Route Handler cookie auth 失效問題

## v1.7.13 — 修正名片王確認人：server 永遠從 DB 查 display_name（2026-03-22）

### 變更項目
- confirm/merge route 不再信任前端傳來的 `confirmedByName`，改為永遠用 `confirmedByUserId` 從 `users` 表查正確的 display_name，根本解決 email fallback 被寫入互動紀錄的問題

## v1.7.12 — 修正名片王確認人 display_name 快取問題（2026-03-22）

### 變更項目
- `resolveUser()` 偵測到 display_name 含 `@`（email 退回值）時強制重新抓取 `/api/me`，確保始終使用正確的顯示名稱

## v1.7.11 — 修正聯絡人頁面 extra_data 巢狀物件造成崩潰（2026-03-22）

### 變更項目
- `extra_data` 值若為物件（非字串）時改用 `JSON.stringify()` 顯示，避免 React 渲染崩潰

## v1.7.10 — 修正名片王確認人顯示名稱（改用 /api/me 取 display_name）（2026-03-22）

### 變更項目
- `resolveUser()` 改用 `auth.getUser()` 取 user.id + `/api/me` 取 display_name，解決瀏覽器 RLS 限制導致只能拿到 email 的問題

## v1.7.9 — 修正名片王確認人：改回瀏覽器 auth.getUser()（2026-03-22）

### 變更項目
- 捨棄 `/api/me` fetch 改回使用瀏覽器端 `supabase.auth.getUser()`，與第一版可運作的邏輯一致
- `resolveUser()` fallback 同樣使用 `auth.getUser()`，徹底消除 race condition

## v1.7.8 — 修正名片王確認人：action 時即時取 user（2026-03-22）

### 變更項目
- 新增 `resolveUser()` helper：確認/合併/批次確認時，若 `myUser` 尚未載入則即時呼叫 `/api/me`，確保每次 action 都能取得正確的確認人身份

## v1.7.7 — 修正名片王確認人識別改用 /api/me（2026-03-22）

### 變更項目
- 名片王審查頁：改用 `/api/me`（伺服器驗證）取得登入者 ID，解決 `getSession()` 快取失效導致確認人未記錄的問題
- SQL 補正 Brandon Possin、Brian Lim 的 created_by 與互動紀錄確認人

## v1.7.6 — 修正名片王確認人未記錄問題（2026-03-22）

### 變更項目
- confirm/merge route 新增 session cookie fallback：前端 myUser 未載入或批次確認未傳 userId 時，自動從 cookie 讀取登入者
- 修正 handleBatchConfirm 未傳 confirmedByUserId/Name 的問題
- SQL 補正 Bella Hsu 的 created_by 與互動紀錄

## v1.7.5 — 修正名片王確認後照片消失問題（2026-03-22）

### 變更項目
- 修正 confirm route 誤帶不存在的 `storage_path` 欄位導致 `card_img_url` 更新失敗，確認後照片顯示破圖
- 修補已確認 5 筆聯絡人的 `card_img_url`（Allen Chong、Andrew Chen、Chris Kim、Angela Feng、Akiyuki Takaya）
- 修正 import script `created_at` 固定為 `2020-01-01` 未生效問題

## v1.7.4 — 名片王 FK 修正 + 建立時間設為掃描時間（2026-03-22）

### 變更項目
- **FK 違反修正**：`created_by` 只在 `public.users` 查到對應 profile 時才設定，避免 FK constraint 錯誤
- **`created_at` 設為掃描時間**：從名片王確認的聯絡人 `created_at` 使用 `camcard_pending.created_at`，讓時間序列與實際掃描時間一致，不與手動建立的聯絡人混在一起

## v1.7.3 — 名片王確認人 server-side 解析 + created_by（2026-03-22）

### 變更項目
- **confirm/merge route 改為 server-side 讀取確認人**：使用 cookie-based session 取得當前登入者 ID，再以 service role 查 `display_name`，完全不依賴前端傳值，解決 confirmedByName 顯示 email 的問題
- **`contacts.created_by` 自動填入**：從名片王確認建立的聯絡人，`created_by` 自動設為確認者的 user ID
- **前端移除 `confirmedByName` 傳遞**：確認人邏輯全移至後端，前端不再需要傳 `confirmedByName`

## v1.7.2 — 確認人名稱修正（2026-03-22）

### 變更項目
- **`/api/me` 新增**：使用 service role 讀取目前登入者的 `display_name`，解決瀏覽器 client 受 RLS 限制無法讀取 `users` 表的問題
- **名片王審查頁**：確認人改由 `/api/me` 取得，互動紀錄顯示正確的 display_name 而非 email

## v1.7.1 — 名片王正反面配對 + 擴充聯絡人欄位（2026-03-21）

### 變更項目
- **名片王 Script 正反面配對**：自動配對 `{Name}-Card Front.jpg` / `{Name}-Card Back.jpg`，兩張圖一起送 Claude OCR（單次 API call），產生一筆 `camcard_pending` 紀錄
- **`(2)` 重複背面處理**：忽略 `*-Card Back(2).jpg` 重複掃描，以第一張為準
- **新聯絡人欄位**：`address_en`（英文地址）、`fax`（傳真）、`department`（部門）、`extra_data JSONB`（OCR 溢出資料）
- **OCR Prompt 更新**：新增傳真、英文地址、部門指示；雙語地址自動分配至 `address` / `address_en`；不認識的欄位存入 `extra_data`
- **聯絡人詳情頁**：顯示新欄位；有 `extra_data` 時顯示「其他資訊」區塊
- **編輯表單**：新增傳真、英文地址、部門欄位
- **i18n**：zh-TW / en / ja 新增 `addressEn`、`fax`、`department`、`extraData` 鍵

---

## v1.7.0 — 重複審查、名片王匯入、Newsletter 抑制名單、系統狀態（2026-03-21）

### 變更項目
- **聯絡人合併**：詳情頁新增「合併聯絡人」功能，搜尋目標聯絡人後合併，空白欄位從來源補入，名片/互動紀錄/Tag 全部轉移，來源聯絡人刪除
- **重複聯絡人審查 `/admin/duplicates`**：掃描相同 Email 及姓名相似配對，支援保留左/右/標記不是重複，合併確認 Modal
- **名片王批次匯入 Script** `scripts/camcard-import/import.ts`：本機 ts-node 腳本，Claude OCR 辨識，寫入 `camcard_pending` 暫存表，支援 `--dry-run`/`--resume`
- **名片王暫存審查 `/admin/camcard`**：按公司分組，確認新增 / 合併至現有聯絡人 / 略過 / 批次新增，重複偵測警告
- **系統狀態 `/admin/health`**：檢查 Supabase / Gemini / Telegram Bot / SendGrid / Teams Bot，顯示延遲 bar，支援 30 秒自動重整
- **`/docs` 存取控制**：未登入只顯示 Quick Start section，已登入顯示全部三章節；新增 zh-TW/en/ja 三語 Quick Start 內容
- **SendGrid 抑制名單匯入** `POST /api/sendgrid/import-suppressions`：拉取 hard bounce / invalid email / 全域退訂寫入黑名單與退訂表
- **聯絡人 Email 黑名單 badge**：詳情頁 Email 旁顯示「黑名單」/「已退訂」badge，即時查詢 newsletter 狀態
- **Newsletter 黑名單/退訂分頁**：加入搜尋 + server-side 分頁（每頁 50 筆）
- **筆記刪除**：筆記搜尋頁每筆 hover 顯示刪除按鈕，confirm 後刪除
- **DB Migration**：新增 `duplicate_pairs`、`camcard_pending` 表，`contacts` 新增 `source`/`imported_at` 欄位，啟用 pg_trgm，新增三個相似度搜尋 RPC
- **i18n**：zh-TW / en / ja 新增 `nav.duplicates`、`nav.camcard`、`nav.health`、`notes.confirmDelete`
- **Sidebar**：新增重複審查、名片王匯入、系統狀態三個 admin 項目

---


## v1.6.4 — Bot `/met` 批次套用認識場合（2026-03-19）

### 變更項目
- **Bot 新指令 `/met {數量} {描述}`**：AI（Gemini）解析場合/日期/介紹人，顯示最近 N 筆聯絡人確認，確認後批次更新並寫互動紀錄
- **新增 `gemini.ts parseMetCommand`**：Gemini 解析自然語言場合描述，支援「昨天」「上週五」等日期

---

## v1.6.3 — 認識場合記錄（2026-03-19）

### 變更項目
- **Migration**：`contacts` 新增 `met_at`（場合）、`met_date`（日期）、`referred_by`（介紹人）欄位
- **聯絡人列表**：多選 checkbox、批次編輯 Modal（填入三個欄位並寫 interaction_log）、`met_at` 場合篩選
- **聯絡人詳情**：新增「認識資訊」區塊顯示三個欄位
- **新增/編輯聯絡人表單**：新增「認識資訊」區塊

---

## v1.6.4 — Bot `/met` 批次套用認識場合（待實作）

### 變更項目
- **Bot 新指令 `/met {數量} {描述}`**：AI（Gemini）解析場合、日期、介紹人，顯示最近 N 筆聯絡人確認，確認後批次更新並寫互動紀錄

---

## v1.6.3 — 認識場合記錄（待實作）

### 變更項目
- **`contacts` 新增欄位**：`met_at`（場合）、`met_date`（日期）、`referred_by`（介紹人自由文字）
- **網頁批次編輯**：聯絡人列表多選後批次填入三個欄位，同步寫 interaction_log
- **聯絡人列表新增 `met_at` 篩選**

---

## v1.6.1 — 辨識失敗審查帶入名片圖片（2026-03-19）

### 變更項目
- **辨識失敗審查 → 手動建立聯絡人** 按鈕改為帶入名片圖片：開啟新增聯絡人頁面時自動顯示該名片圖片，儲存後自動關聯至聯絡人（不重新上傳）
- **新增 `/api/link-card`**：將已存在的 Storage 圖片直接關聯至聯絡人，同步將 `failed_scan` 標為已審查
- **新增聯絡人頁 OCR 支援**：當由失敗審查進入時，可直接對該圖片執行 OCR 辨識

---

## v1.6.0 — Newsletter 功能（2026-03-19）

### 變更項目
- **新增 Newsletter 管理頁 `/admin/newsletter`**（僅 super_admin）：Campaign Wizard（基本設定/編輯內容/收件人/排程）、列表、詳情、複製、暫停/繼續
- **SendGrid Email API 整合**：分批寄送（每天上限 500 封、自訂時間）、Open/Click Tracking
- **SendGrid Event Webhook `/api/sendgrid/webhook`**：同步開信、點擊、退訂、bounce、spam 事件到資料庫
- **TipTap 富文字編輯器**（`src/components/TipTapEditor.tsx`）：支援變數（`{{name}}`）、附件上傳、預覽模式、測試信
- **收件人邏輯**：Tag 聯集 + 手動勾選，自動排除退訂者和黑名單，寄送前鎖定名單快照至 `newsletter_recipients`
- **退訂頁面 `/unsubscribe`**：公開頁面，HMAC-SHA256 JWT token 驗證，選填退訂原因
- **黑名單管理**：hard bounce 和 spam 自動加入，可手動管理
- **互動紀錄**：每位收件人各寫一筆 interaction_log（type=email）
- **Supabase Edge Function `send-newsletter`**：pg_cron 每小時整點觸發，依 send_hour 過濾，分批寄送
- **DB Migration**：新增四張表（含 RLS）：`newsletter_campaigns`、`newsletter_recipients`、`newsletter_unsubscribes`、`newsletter_blacklist`
- **Sidebar**：新增「Newsletter 管理」（僅 super_admin）；i18n 三語言同步更新
- **新增環境變數**：`SENDGRID_API_KEY`、`SENDGRID_FROM_EMAIL`、`SENDGRID_FROM_NAME`、`SENDGRID_WEBHOOK_SECRET`

---


## v1.5.5 — AI 生成信件參考現有內文、修正語言偵測（2026-03-19）

### 變更項目
- AI 生成信件時，現有內文（template 載入或使用者手動輸入）自動作為參考內容傳入 Gemini
- 修正語言偵測邏輯：以使用者的 prompt 語言為準，不受範本或互動紀錄語言影響

## v1.5.4 — 修正收件人欄位離焦未自動加入（2026-03-19）

### 變更項目
- 修正 To/CC/BCC 輸入框：輸入 email 後直接點擊其他欄位（未按 Enter）時，自動將該 email 加入收件人清單

## v1.5.3 — 修正 Bot 確認存檔失敗（2026-03-19）

### 變更項目
- 修正按「✅ 確認存檔」時失敗的根本原因：`pending.data` 含有 `rotation` 欄位，但 contacts 表無此欄位，導致 insert 失敗
- 修正 `throw error` 拋出非標準 PostgrestError 導致錯誤訊息顯示 `[object Object]`
- 統一 callback catch block 的錯誤序列化方式

## v1.5.2 — Bot 錯誤診斷日誌強化（2026-03-19）

### 變更項目
- 加強 Telegram bot 名片處理錯誤的 console.error 日誌，完整序列化錯誤物件以便診斷 `[object Object]` 問題
- 修正 catch block 錯誤訊息提取：非 Error 物件改用 JSON.stringify 顯示，避免輸出 `[object Object]`

## v1.5.1 — Provider token 自動刷新、刪除聯絡人、新增聯絡人修正（2026-03-19）

### 變更項目
- **Microsoft token 自動刷新**：登入時加入 `offline_access` scope，儲存 refresh token；存取憑證快到期時自動透過 Microsoft 刷新，最長可維持 ~90 天免重新登入
- **新 API `/api/provider-token`**：前端寄信前呼叫此端點，確保取得最新 token
- **`getValidProviderToken(userId)`**：Bot（Telegram/Teams）確認行程、寄信時統一使用此函數取得有效 token
- **刪除聯絡人**：`super_admin` 可刪除所有聯絡人；上傳者可刪除自己上傳的聯絡人
- **新增聯絡人修正**：修正照片未儲存（`Uint8Array` → `Blob`）、互動紀錄未寫入的問題
- **CC / BCC 多收件人**：寄信支援 CC、BCC，以逗號分隔
- **Lightbox 縮放**：聯絡人名片圖片支援滾輪縮放、拖曳平移、雙指捏合
- 版本 1.5.0 → 1.5.1

## v1.5.0 — /meet 行程排程指令（Telegram + Teams）（2026-03-19）

### 變更項目
- **新指令 `/meet` / `/m`**：Telegram Bot 與 Teams Bot 均支援，AI 解析會議描述後顯示確認訊息，使用者確認後建立 Outlook 行事曆邀請
- **AI 解析**：自動識別時間、時長（30/60/90/120 分鐘）、參與者（僅組織成員）、地點
- **確認流程**：Telegram inline keyboard、Teams Adaptive Card，均含「確認建立」與「取消」按鈕
- **Outlook 行程**：確認後呼叫 Microsoft Graph `POST /me/events`，自動傳送會議邀請給被點名的組織成員
- **`meeting_drafts` 資料表**：暫存 AI 解析結果，確認或取消後自動刪除
- **登入 scope 加入 `Calendars.ReadWrite`**：使用者需重新登入一次
- 版本 1.4.4 → 1.5.0

## v1.4.4 — 寄信聯絡人選擇器、AI 生成主旨、多語言（2026-03-19）

### 變更項目
- **收件人 chip 選擇器**：To/CC/BCC 改為 chip 輸入，打名字/email 可搜尋 CRM 聯絡人，Enter 可新增任意 email
- **多聯絡人互動紀錄**：寄信後自動幫所有選到的 CRM 聯絡人各新增一筆互動紀錄
- **AI 同時生成主旨**：AI 生成信件時回傳 `{subject, html}`，自動填入主旨欄
- **AI 語言跟隨描述**：prompt 加入「語言請與使用者描述相同」指示
- **忽略名片掃描紀錄**：AI 生成時略過「透過 Telegram Bot 新增名片」的互動紀錄
- 聯絡人清單在開啟 Modal 時一次載入，後續全 client-side 過濾，不增加 DB 負擔
- 版本 1.4.3 → 1.4.4

## v1.4.3 — 修正寄信 Microsoft 存取權限錯誤（2026-03-19）

### 變更項目
- **修正寄信 provider_token 問題**：`@supabase/ssr` cookie session 不保留 `provider_token`，改從 `users` 表讀取
- **auth callback 強化**：登入時將 `provider_token` 寫入 `users.provider_token`（與 Bot 共用同一機制）
- 頁面 `load()` 一併讀取 `provider_token`，`handleSendMail` 改用 DB token
- 版本 1.4.2 → 1.4.3

## v1.4.2 — 寄信支援 CC / BCC 與多收件人（2026-03-19）

### 變更項目
- **CC / BCC 欄位**：寄信 Modal 新增副本、密件副本輸入框
- **多收件人**：To / CC / BCC 均支援逗號分隔多個地址（例：`a@co.com, b@co.com`）
- **`graph.ts`**：`sendMail` 函式新增 `cc` / `bcc` 參數，自動解析並填入 `ccRecipients` / `bccRecipients`
- 版本 1.4.1 → 1.4.2

## v1.4.1 — 名片圖片放大 Lightbox（2026-03-19）

### 變更項目
- **名片 Lightbox**：聯絡人頁面名片縮圖 hover 時顯示放大鏡圖示，點擊開啟全螢幕 Lightbox 檢視大圖
- **Lightbox 關閉方式**：點擊背景遮罩、右上角 ✕ 按鈕、或按 Escape 鍵皆可關閉
- 版本 1.4.0 → 1.4.1

## v1.4.0 — Vercel Cron 自動文件生成 + Teams Bot 診斷強化（2026-03-19）

### 變更項目
- **Vercel Cron**：新增 `vercel.json` 排程，每日凌晨 2:00（台北時間）自動呼叫 `/api/docs/cron` 重新生成 6 份說明書（zh-TW/en/ja × user/super_admin）並 upsert 進 Supabase
- **Teams Bot invoke 診斷**：新增完整 logging（RAW body、auth result、invoke value）方便查 Vercel Logs 排查問題
- **Teams Bot invoke 格式相容**：新增第三種 value 格式解析（`value.data.action`），確保所有 Teams invoke payload 格式皆可處理
- **Teams Bot invoke catch-all**：invoke block 結尾加上保底 `invokeResponse`，防止格式解析失敗時回傳錯誤格式

## v1.3.9 — 名片辨識失敗審查、/AI 指令、助理 tag picker、多項 UX 改善（2026-03-18）

### 變更項目
- **名片辨識失敗處理**：若 AI 無法識別姓名，照片保留在 Storage，存入 `failed_scans` 資料表，通知使用者已回報管理員；Super Admin 新增「辨識失敗審查」頁面可查看圖片並標記完成
- **新增 /AI 指令**：Telegram Bot 與 Teams Bot 皆支援 `/AI`，顯示目前帳號使用的 AI 模型名稱與端點
- **Telegram 503 重試**：`sendMessage` 遇到 503 時自動通知使用者「3 秒後重試」，重試失敗再告知無法傳送
- **助理選人改版**：個人設定 → 我的助理，改為 tag 式 picker（已選顯示可移除 tag，點「+ 新增助理」展開下拉選單）
- **任務指派人顯示**：指派人欄位 fallback 改為 email username（@ 前面），不再顯示完整 email
- **名片存檔後回傳連結**：確認存檔後 Bot 回傳可點擊的聯絡人頁面連結
- **國家新增自動填入**：輸入 2 字母 ISO code 後自動帶入中英日名稱與 emoji（收錄 60+ 國家）
- **DB migration**：新增 `failed_scans` 資料表（含 RLS）

## v1.3.8 — 任務管理強化 + 檔案限制 + 助理選擇（2026-03-18）

### 變更項目
- **任務管理**：新增任務編號（#N）、顯示指派時間與指派人、Supabase Realtime 即時更新狀態
- **Bot bug fix**：Telegram 按完成後 `completed_by` 改寫 email（之前誤寫 UUID）
- **Teams bot**：task_done 加入詳細 log + 若帳號未綁定給予明確錯誤訊息
- **檔案大小**：附件上傳限制從 2MB 改為 5MB（Email 附件、範本附件）
- **個人設定 → 助理**：從 email 輸入框改為 tag 式選人（從系統使用者清單中點選）
- **DB migration**：tasks 表新增 `task_number` SERIAL 欄位

## v1.3.7 — /docs TOC 移至左側 + Mermaid 流程圖（2026-03-18）

### 變更項目
- TOC（本頁目錄）從右欄移至左側導覽列（與 GitHub Pages Just the Docs 相同位置）
- 整合 mermaid.js，文件中的 mermaid code block 自動渲染為流程圖
- 更新 zh-TW 使用者文件：加入系統運作流程、名片辨識、任務指派等示意圖
- 更新 zh-TW Super Admin 文件：加入系統架構、Teams 綁定、RLS 權限流程圖
- 行動版新增可折疊的 TOC 面板

## v1.3.6 — /docs 頁面排版大幅改善（2026-03-18）

### 變更項目
- `/docs` 改為三欄式佈局：左側章節導覽 | 中間內容 | 右側目錄（TOC）
- 右側 TOC 自動從 markdown 標題（h1~h3）產生，含 IntersectionObserver 高亮目前段落
- 標題層級大幅改善：h1=1.875rem + 底線、h2=1.375rem + 底線、h3=1.125rem
- 表格、code block、blockquote 樣式全面優化（含深色模式）
- 標題加 anchor id，支援 TOC 錨點跳轉
- `marked` 自訂 renderer 以產生 slug id

## v1.3.5 — /n alias + /w 自動偵測聯絡人 + Teams 通知診斷（2026-03-17）

### 變更項目
- Bot：新增 `/n` 作為 `/note` 的別名
- Bot `/w`：AI 解析任務時自動偵測提及的外部聯絡人姓名，從 contacts 表搜尋並關聯（優先於 session 記錄）
- Bot `/w`：Teams 通知錯誤改為 console.error 記錄，便於診斷
- Bot `/w`：appUrl 回退補上 NEXT_PUBLIC_APP_URL

## v1.3.4 — 說明書改由 Claude Code Skill 生成（2026-03-17）

### 變更項目
- 說明書改由 `/generate-docs` Claude Code Skill 手動生成，不再依賴 Vercel serverless function
- 移除 `/api/docs/generate` route 及說明書頁面的生成按鈕
- 新增 `.claude/commands/generate-docs.md` skill

## v1.3.3 — 可折疊側邊欄 + 任務去重 + 任務聯絡人連結 + Teams 聯絡人通知（2026-03-17）

### 變更項目
- 側邊欄：桌面版新增折疊/展開切換按鈕，狀態儲存於 localStorage
- Telegram Bot：webhook update_id 去重，防止 AI 回應過慢導致重複建立任務
- 網頁任務列表：顯示關聯聯絡人姓名（可點擊跳至聯絡人頁面）
- Teams Bot：/w 指派任務時，同步傳送 Adaptive Card 給被指派者（含聯絡人姓名與公司）
- DB：新增 telegram_dedup 表（防重複）及 tasks.contact_id 欄位

## v1.3.2 — Dashboard 聯絡人連結 + 個設 Teams 狀態 + 任務聯絡人脈絡 + 全欄排序（2026-03-17）

### 變更項目
- Dashboard：總聯絡人數字卡片可點擊跳至聯絡人列表
- 個人設定：新增 Teams Bot 綁定狀態顯示（已綁定 / 未綁定）
- Telegram /w：指派任務給團隊成員時，通知訊息同時顯示相關聯絡人姓名與公司
- 聯絡人列表：姓名、公司、職稱、Email、電話、建立時間 欄位全部支援點擊排序

## v1.3.1 — 行動版聯絡人卡片 + Teams Bot 綁定狀態 + OCR 多語系姓名（2026-03-17）

### 變更項目
- 聯絡人列表：手機新增卡片式瀏覽，標題列按鈕在小螢幕自動折疊
- 使用者管理：新增 Teams Bot 欄位，顯示各用戶的 Teams Bot 綁定狀態
- Telegram /u 指令：成員列表改為 ✅/⬜ 同時顯示 Telegram 和 Teams 綁定狀態
- OCR prompt 更新：名片同時含中文、日文、英文姓名時分別存入對應欄位（name/name_local/name_en）
- 說明書語言切換器：加上 Globe 圖示與外框，更易識別
- 側邊選單：報表管理移到說明書上方

## v1.3.0 — 說明書多語言 + Prompt 自訂 + 報表權限 + 聯絡人篩選 + Dashboard 統計互動（2026-03-17）

### 變更項目
- **Task 66** Migration：新增 `docs_content`、`prompts`、`user_prompts` 表；`report_schedules` 新增 `owner_id`
- **Task 67** 新增 `src/lib/prompts.ts`：`SYSTEM_PROMPTS` 常數 + `getPrompt()` 三層優先級函式
- **Task 68** 新增 `/api/docs/generate` route：呼叫 AI 生成 3 語言 × 2 section 說明書，upsert `docs_content`
- **Task 69** 更新 `/docs` 頁面：語言切換按鈕、從 `docs_content` 撈內容、Markdown 渲染（marked）
- **Task 70** 新增 `/admin/prompts` 頁面：4 個 prompt 編輯 + 還原系統預設
- **Task 71** 更新 `/settings`：新增個人 `email_generate` prompt 編輯 + 還原組織預設
- **Task 72** 更新所有 AI 呼叫（OCR、email、任務解析）改用 `getPrompt()`
- **Task 73** 更新報表頁：依角色過濾排程（member 只看自己），報表資料範圍依 `created_by` 過濾
- **Task 74** `/contacts/new` 新增國家欄位 ✅（已完成）
- **Task 75** 聯絡人列表新增國家篩選 dropdown（單選）
- **Task 76** Dashboard 新增國家分布統計區塊（長條圖，可點擊跳轉 `/contacts?country=`）
- **Task 77** Dashboard Tag 分布每行改為可點擊 `<Link>` 跳轉 `/contacts?tag=`
- **Task 78** 聯絡人列表：URL query 初始化篩選、國家多選 dropdown、職稱三段排序（asc/desc/無）
- **[Task 67]** 新增 `src/lib/prompts.ts`：`SYSTEM_PROMPTS` 常數 + `getPrompt()` 三層取值
- **[Task 68]** 新增 `/api/docs/generate` route：讀 PRD → AI 生成 6 份說明書內容 → upsert `docs_content`；設定 Vercel build hook
- **[Task 69]** 更新 `/docs` 頁面：語言切換按鈕（繁中/EN/日），內容從 `docs_content` 撈取
- **[Task 70]** 新增 `/admin/prompts` 頁面（super_admin）：4 個 prompt 編輯 + 還原系統預設
- **[Task 71]** 更新 `/settings`：新增 `email_generate` prompt 編輯區塊 + 還原組織預設
- **[Task 72]** 更新所有 AI 呼叫（OCR、email 生成、任務解析、說明書生成）改用 `getPrompt()`
- **[Task 73]** 更新 `/admin/reports`：依角色過濾規則（owner_id），資料範圍依角色限縮
- **[Task 75]** 聯絡人列表新增國家篩選 dropdown（可與 Tag 篩選同時使用）
- **[Task 76]** Dashboard 新增國家統計長條圖，每行可點擊跳轉 `/contacts?country={code}`
- **[Task 77]** Dashboard Tag 分布改為可點擊，跳轉 `/contacts?tag={name}`，加 `›` 箭頭
- **[Task 78]** 聯絡人列表：URL query 初始化篩選（`?tag` / `?country`）+ 職稱欄三段式排序
- **i18n**：三份語言檔補 `dashboard.countryDistribution`、`dashboard.countryOther`、`contacts.countryFilter`

---


## v1.2.3 — 文件更新與 Dashboard 修復（2026-03-17）

### 變更項目
- **修復 Dashboard Tag 計數錯誤**：Tag 人數一律顯示 1 的 bug（`contact_tags(count)` 回傳值誤用陣列長度）已修正
- **Dashboard 隱藏零人 Tag**：count = 0 的 Tag 不再顯示於首頁統計區塊
- **修復外部 Telegram 使用者錯誤訊息**：改為「此 Bot 為 CancerFree Biotech 內部專用」
- **文件：第一次登入補充 Teams Bot 綁定說明**
- **文件：Telegram 綁定步驟改用 `@userinfobot`，補充 Bot 名稱 `@CF_CRMBot`**

---

## v1.2.2 — Bot 修復與強化（2026-03-17）

### 變更項目
- **修復 Telegram 重複 callback 錯誤**：`answerCallbackQuery` 移到 DB 操作之前，避免 Telegram retry 觸發「找不到暫存資料」錯誤；已處理的 callback 靜默回傳 ok（冪等）
- **Telegram OCR 結果顯示國家**：辨識結果新增 `🌍 國家` 欄位，顯示 emoji + 中文名稱（如 `🇹🇼 台灣`）

---

## v1.2.1 — Teams Bot 修復（2026-03-16）

### 變更項目
- **修復 Teams Bot 無法回覆**：`getBotToken` 改用 tenant-specific 端點（支援 single-tenant App Registration）
- **修復帳號自動綁定失敗**：email 比對改為大小寫不敏感（`ilike`），解決 Microsoft Graph 回傳大寫 email 與 DB 小寫不符問題
- **補充 Teams Bot 說明文件**：新增帳號自動綁定流程說明

---

## v1.2.0 — UX 強化 + 國家欄位 + 寄信強化（2026-03-16）

### 變更項目
- **Email copy 按鈕**：聯絡人詳情頁 email / 電話旁加複製圖示，點擊顯示「✅ 已複製」提示
- **多張名片上傳（最多 6 張）**：新增聯絡人和補充名片均支援，壓縮後合併送 AI 辨識，新增左右對照確認介面
- **新增國家欄位**：`contacts.country_code` FK → `countries.code`，現有聯絡人預設 NULL
- **`countries` 資料表**：super_admin 管理，預設台灣 🇹🇼、日本 🇯🇵、美國 🇺🇸、韓國 🇰🇷、新加坡 🇸🇬、印度 🇮🇳，支援中/英/日多語名稱與旗幟 emoji
- **新增 `/admin/countries` 頁面**（僅 super_admin）
- **全新寄信介面**：可編輯收件人（To）、套用範本附件自動帶入、AI 生成內文（帶入最近互動紀錄）、臨時附件上傳（每檔 2MB）
- **行動版 sidebar**：手機顯示 hamburger 滑出抽屜；平板收縮為 icon-only，hover 展開；桌機完整顯示
- **全站圖片壓縮統一規範**：所有上傳點一律 1024px / JPEG Q85
- **說明書更新**：GitHub Pages 文件反映 v1.2 所有新功能
- **版本號**：package.json / 側邊欄頁腳同步升至 v1.2.0

---


## v1.1.0 — 權限控管改善（2026-03-16）

### 變更項目
- **側邊欄權限分離**：標籤管理、未指派筆記、郵件範本移至 `super_admin` 專屬，一般 Member 不再看到
- **側邊欄分隔線**：Super Admin 的管理功能與一般功能之間加一條細線，視覺上明確區分
- **修復 Bot Webhook URL**：Telegram webhook 誤指向 `mycrm.vercel.app`（他人的 SvelteKit app），改為正確的 `mycrm-vert.vercel.app`
- **修復 middleware 攔截 Bot 請求**：`supabase.auth.getUser()` 在 bypass 檢查之前執行，導致 `/api/bot` 被攔截；改為對公開路由提前 return，不觸發 Supabase
- **文件更新**：角色說明、側邊欄說明、管理員功能列表同步更新；修正文件中的 URL

---

## v1.0.1 — Bug fixes & docs 改善（2026-03-16）

### 變更項目
- **修復登入頁語言切換無效**：`/api/set-locale` 未列入 middleware bypass，未登入狀態呼叫會被導向 `/login` 而無法設定 cookie
- **修復圖片上傳未壓縮**：新增聯絡人、名片重新辨識、名片附件上傳三個路徑補上 Canvas 壓縮（1024px、JPEG Q85），與 Bot / 批次上傳行為一致
- **修復 GitHub Pages dark mode**：將按鈕與 JS 合併至 `footer_custom.html`，解決跨檔案時序問題；補強 table `th`/`td`/`tr` dark mode 樣式；修正 header 右上角白色背景
- **文件結構重組**：新增「系統部署（IT）」章節，將環境設定、Telegram Bot 設定、Teams Bot 設定從使用者區移出，使用者與 IT 文件分開

---

## v1.0 — 任務管理 + Teams 整合（已完成 2026-03-15）

### 變更項目
- **Bot 新指令 `/work` / `/w`**：AI（Gemini）解析自然語言，提取任務標題、截止時間、負責人名稱，搜尋 users 表比對成員，建立任務並發 Telegram 通知指派對象；無指派對象時為自我提醒
- **Bot 新指令 `/tasks` / `/t`**：列出待處理任務（assigned to me + I created），每筆附 Inline Keyboard：✅ 完成 / ⏭ 延後 / ❌ 取消；延後需輸入新截止時間
- **任務管理頁 `/tasks`**：三個 Tab（我的提醒 / 我指派的 / 指派給我的）+ 關鍵字搜尋 + 狀態 badge + 完成/延後/取消操作 + 新增/編輯 modal（含多人指派 checkbox）
- **API routes**：`/api/tasks`（GET/POST）、`/api/tasks/[id]`（PATCH/DELETE）；助理可代主管標記完成，`completed_by` 記錄操作者
- **個人設定新增「我的助理」**：主管設定多位助理 Email，`/api/assistants`（GET/POST/DELETE）
- **Microsoft Teams Bot**：`/api/teams-bot` webhook（Adaptive Card 附「標記完成」按鈕、「前往任務管理」連結）；`src/lib/teams.ts` 封裝 Bot Framework token + sendTeamsTaskNotification()
- **提醒機制**：`supabase/functions/send-reminder/index.ts`，掃描 due_at 剛過 1 分鐘的 pending 任務，Telegram 通知指派者與建立者
- **新增資料表**：`tasks`、`task_assignees`、`user_assistants`（含 RLS）
- **新增環境變數**：`TEAMS_BOT_APP_ID`、`TEAMS_BOT_APP_SECRET`、`TEAMS_TENANT_ID`
- **i18n**：新增 `tasks` namespace（zh-TW / en / ja），nav 新增 `tasks` key
- **pg_cron 設定（手動執行一次）**：見 `send-reminder/index.ts` 頂部說明

---


## v0.9 — 報表功能（已完成 2026-03-15）

### 變更項目
- **新增報表管理頁 `/admin/reports`**（僅 super_admin）
- **立即產生**：自由選取時間範圍，網頁呈現表格，可下載 Excel（兩個 Sheet：新增名片 + 互動紀錄）
- **定時寄送**：排程 CRUD UI（週期 radio 選擇器：每週/每月/自訂 cron），排程清單可啟用/停用/刪除
- **Supabase Edge Function `send-report`**：接收 scheduleId 或批次執行所有活躍排程，產生 Excel 並透過 Gmail API 寄出
- **Gmail OAuth**：`/api/auth/gmail` 導向 Google OAuth，`/api/auth/gmail/callback` 交換 token 並存入 `gmail_oauth` 表；`/api/auth/gmail/status` 顯示已連結帳戶
- **callback URL 使用 `NEXT_PUBLIC_APP_URL`**：換網域只需更新環境變數
- **導覽列新增「報表管理」**（BarChart2 圖示，僅 super_admin 可見）
- **新增資料表**：`report_schedules`、`gmail_oauth`（含 RLS：super_admin only）
- **新增 API routes**：`/api/reports/generate`、`/api/reports/schedules`、`/api/reports/schedules/[id]`、`/api/auth/gmail`、`/api/auth/gmail/callback`、`/api/auth/gmail/status`
- **新增環境變數**：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`NEXT_PUBLIC_APP_URL`
- **i18n**：新增 `reports` namespace（zh-TW / en / ja），導覽列新增 `nav.reports` key

---


## v0.8 — 多語言支援 i18n（已完成 2026-03-15）

### 變更項目
- **新增 `next-intl` 套件**：支援繁體中文、English、日本語（cookie-based，無 URL prefix）
- **語言檔**：`messages/zh-TW.json`、`en.json`、`ja.json`，涵蓋全站所有 UI 文字
- **語言切換 UI**：Header 右上角 `🌐` dropdown，個人設定頁語言按鈕群組
- **語言偏好儲存**：`users.locale` 欄位（DB）+ `MYCRM_LOCALE` cookie（1 年），兩端同步
- **API route `/api/set-locale`**：POST 設定語言 cookie
- **所有頁面 hardcode 文字替換為 `useTranslations()` 呼叫**：涵蓋 contacts、notes、unassigned-notes、batch-upload、admin/tags、admin/users、admin/models、admin/templates、settings、dashboard、login 等 14 頁

---


## v0.7.1 — Bot 搜尋強化 + 網頁分頁（已完成 2026-03-15）

### 變更項目
- **Bot `/search` 強化**：搜尋結果不預載互動紀錄，改為每筆附 `[📋 互動紀錄]` 按鈕，點擊後按需載入最新 5 筆，支援 `[載入更多]`
- **分頁：聯絡人列表**：每頁 20 筆，底部頁碼導覽（«‹ 頁碼 ›»），搜尋/篩選後重置第 1 頁
- **分頁：筆記搜尋**：每頁 20 筆，server-side range() + count: exact
- **分頁：未歸類筆記**：每頁 20 筆，assign/delete 後自動修正頁碼
- **無限捲動：互動紀錄時間軸**：預設載入 20 筆，IntersectionObserver 捲到底自動載入下一批

---


## v0.7 — 聯絡人擴充 + 批次上傳（已完成 2026-03-15）

### 變更項目
- **Bot：連續傳圖保護**：同一使用者超過 5 張待確認時，拒絕新照片並提示先處理
- **Bot：`/note`、`/email` 預設上一個聯絡人**：不帶關鍵字時提示「要針對上一位 XXX 嗎？」，`bot_sessions` 新增 `last_contact_id`
- **`contacts` 新增 11 個欄位**：`name_en`、`name_local`、`company_en`、`company_local`、`address`、`website`、`notes`、`second_email`、`second_phone`、`linkedin_url`、`facebook_url`
- **新增 `contact_cards` 子表**：一個聯絡人可掛多張名片（正反面 + label），舊欄位 `card_img_url`/`card_img_back_url` 保留相容
- **名片與主資料脫鉤**：聯絡人主表欄位由使用者手動維護，名片只作附件參考
- **Gemini OCR Prompt 更新**：辨識所有新欄位，直接填入對應欄位
- **批次圖檔上傳 `/contacts/batch-upload`**：最多 50 張，並行（同時 5 張）+ 進度條 + 批次預覽表格 + 批次重複偵測 + 一鍵存檔
- **`interaction_logs.type` 新增 `system`**：系統自動紀錄，顯示系統圖示而非建立者
- **`/contacts/new` 更新**：支援所有新欄位，分四個 section（基本資訊/聯絡方式/社群/備註）
- **`/contacts/[id]` 更新**：顯示所有新欄位、contact_cards 管理（上傳/刪除）、編輯 modal 展開
- **⚠️ 聯絡人合併功能**：延後至後續版本實作

---


## v0.6.1 — 主題修正 + 孤兒圖片清理（已完成 2026-03-15）

### 變更項目

#### 主題系統（Light / Dark）
- **Tailwind v4 dark mode 修正**：在 `globals.css` 加入 `@variant dark (&:where(.dark, .dark *))` 讓 `dark:` utilities 跟著 `next-themes` 注入的 `.dark` class 切換，而非依賴 OS `prefers-color-scheme`（這是 dark mode toggle 完全無效的根本原因）
- **Dashboard Header 加入主題切換按鈕**：Sun / Moon icon button 顯示於右上角使用者名稱旁，可快速切換，無需進入個人設定
- **修正 hydration flash**：Settings 和 Docs 頁面加入 `mounted` state，防止 `useTheme()` 在 hydration 前 `theme === undefined` 導致主題按鈕狀態錯誤
- **修正 `body` 字體**：`globals.css` 改用 `var(--font-geist-sans)` 取代硬碼的 Arial，讓 Geist 字體實際生效
- **修正 docs 頁面 prose dark class 順序**：`prose-code:dark:bg-gray-800` 改為 `dark:prose-code:bg-gray-800`（正確的 Tailwind variant 順序）

#### Bot 孤兒圖片清理
- **A1 — 取消時即時刪圖**：`pending_contacts` 新增 `storage_path` 欄位，上傳名片時同步記錄路徑；使用者點「❌ 不存檔」時，先刪 Supabase Storage 圖檔，再刪 DB 記錄，不留孤兒圖片
- **C — pg_cron 每日定時清理**：啟用 `pg_cron` extension，排程 `cleanup-orphan-cards` 每天凌晨 03:00 UTC 掃描 `cards` bucket，刪除超過 24 小時且未被 `contacts` 或 `pending_contacts` 參照的孤兒圖檔（補強 crash / timeout 等極端情況）

#### DB Migration
- `pending_contacts` 新增欄位：`storage_path TEXT`
- 啟用 `pg_cron` extension
- 新增 cron job：`cleanup-orphan-cards`（每日 03:00 UTC）

---

## v0.6 — Bot 縮寫 + AI Endpoint 管理 + 說明書（已完成 2026-03-14）

### 變更項目
- **Bot：指令縮寫**：`/h`、`/s`、`/e`、`/ab`、`/u`，/help 顯示完整指令與縮寫對照
- **Bot：新增 `/user` / `/u` 指令**：列出所有組織成員的姓名、email、Telegram ID（所有人可用）
- **AI Endpoint 管理**：新增 `ai_endpoints` 表，super_admin 可從 `/admin/models` 管理多個 AI 服務商（名稱、Base URL、API Key）
- **AI Model 改為二層結構**：`ai_models` 表取代 `gemini_models`，model 屬於某個 endpoint
- **`users` 表新增 `ai_model_id`**：指向 `ai_models.id`，取代原本的 `gemini_model` 文字欄位
- **個人設定 model 選擇改為兩層**：先選 endpoint，再選 model
- **`/admin/models` 頁面重構**：支援 endpoint CRUD + 每個 endpoint 底下的 model CRUD
- **新增說明書頁面 `/docs`**：AI 根據 PRD 自動生成，分 User / Super Admin 兩個 section，含右側目錄導覽

---


## v0.5 — Bot 強化 + 網頁功能擴充（已完成 2026-03-14）

### 變更項目
- **Bot：新增 `/help` 指令**：列出所有可用指令
- **Bot：新增 `/search [關鍵字]`**：模糊搜尋聯絡人，回傳名片照片（正反面），每筆附 `[✉️ 發信]` `[📝 筆記]` 快速按鈕
- **Bot：所有指令統一操作模式**：輸入關鍵字 → 列出選項 → 回覆數字選擇
- **Bot：`/email` 發信功能**：場景 D（template + AI 生成都支援），使用觸發者 Microsoft 信箱發出，互動紀錄存完整內文，附件只記檔名
- **Bot：`/note` 改用統一搜尋模式**
- **Gemini model 改為資料庫管理**：新增 `gemini_models` 表，super_admin 可從 `/admin/models` 新增/停用，個人設定 dropdown 從 DB 讀取
- **Email Template：AI 生成功能**：新增「AI 生成」按鈕，輸入描述後 AI 生成完整郵件內文
- **新增 `/api/ai-email` route**：供 AI 生成 email 內容使用
- **RWD**：所有頁面 mobile friendly，sidebar 在 mobile 收合為 hamburger menu
- **筆記搜尋頁 `/notes`**：可依關鍵字、日期範圍、type 搜尋所有互動紀錄
- **Dashboard 強化**：Tag 聯絡人分布統計、未歸類筆記數統計卡片
- **版本資訊 footer**：所有頁面左下角顯示版本號 + Vercel 部署時間
- **`interaction_logs` 新增欄位**：`email_subject`、`email_attachments`（存檔名陣列）
- **新增 Gemini Model 管理頁 `/admin/models`**（僅 super_admin）

---

## v0.4 — Bot 強化 + 聯絡人管理擴充（已完成 2026-03-14）

### 變更項目
- **Bot：存檔確認新增 `[❌ 不存檔]` 按鈕**
- **Bot：支援會議筆記輸入**（/note 指令 + @姓名快速格式）
- **Bot：找不到聯絡人時建立未歸類筆記**（contact_id=null）
- **Bot：支援 `/add_back @姓名` 補充名片反面**
- **Bot：新增 `bot_sessions` 表管理多步驟對話狀態**
- **重複聯絡人偵測**：存檔前比對 email + 姓名相似度（pg_trgm）
- **`interaction_logs` 新增欄位**：`type`（note/meeting/email）、`meeting_date`；`contact_id` 改為 nullable
- **`contacts` 新增欄位**：`card_img_back_url`
- **網頁新增聯絡人**：`/contacts/new`，含照片上傳 + AI 辨識 + 重複偵測
- **網頁編輯聯絡人**：聯絡人詳情頁新增編輯 Modal
- **Export 功能**：Excel/CSV，依目前篩選結果
- **未歸類筆記頁 `/unassigned-notes`**
- **Dashboard 待處理區塊**：最新 5 筆未歸類筆記
- **新增 `/api/ocr` route**
- **新增 `src/lib/duplicate.ts`**
- **Gemini 多語言支援**：支援中英日文名片

---

## v0.3 — 功能擴充（已完成 2026-03-14）

### 變更項目
- **UI 修正**：所有輸入框文字色 `text-gray-900` / `dark:text-gray-100`
- **深色/淺色主題**：`next-themes`，偏好儲存於 `users.theme`
- **角色系統**：`admin` 改名為 `super_admin`，可有多位
- **個人設定頁**：顯示角色、Gemini model dropdown、主題切換
- **Gemini model 個人化**：Bot 掃名片使用該使用者的 model
- **圖片命名規則**：`yymmdd_hhmmss-流水號.jpg`
- **聯絡人 Tag 功能**：`tags` + `contact_tags` 表
- **Tag 管理頁 `/admin/tags`**
- **聯絡人列表 Tag 篩選**
- **郵件範本附件**：真實檔案上傳，單檔限 2MB

---

## v0.2 — 架構重設計（已完成 2026-03-14）

### 變更項目
- **廢除 `authorized_users` 表**，改由 `users` 表統一管理
- **`users` 表**：Microsoft AAD email 為主鍵，telegram_id 綁定
- **角色系統**：`role` 欄位（member / super_admin）
- **聯絡人共享**：`contacts.created_by` → `users.id`
- **互動紀錄歸屬**：`interaction_logs.created_by` → `users.id`
- **個人設定頁 `/settings`**
- **`src/lib/graph.ts`**：Microsoft Graph API 寄信
- **寄信功能**：從聯絡人詳情頁觸發
- **使用者管理頁**：管理 `users` 表，角色切換

---

## v0.1 — 初始版本（已上線）

- Telegram Bot 掃描名片 → Gemini OCR → 存入 Supabase
- Web Dashboard：聯絡人列表、詳情、互動紀錄
- Microsoft AAD SSO 登入（限 @cancerfree.io）
- 白名單管理（authorized_users）
- 郵件範本 CRUD
