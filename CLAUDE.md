# CLAUDE.md — myCRM

> 此檔案為 Claude Code 的行為規範。每次執行任務前請先閱讀。

---

## Behavioral Guidelines

> 以下為 Andrej Karpathy 啟發的 LLM coding behavioral guidelines（來源：[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)），保留英文原文以維持原意。本節為元規則，規範 Claude 的工作方式；專案具體規範見下方章節。

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Priority（衝突判準）

當上述 Behavioral Guidelines 與本檔 myCRM 專案規範衝突時，依以下規則判定：

- **myCRM 硬性規範凌駕 Surgical Changes**：包含「禁止事項速查」、UI/UX 的 Dark mode 強制與 Mobile-first、i18n 禁止 hardcode、安全性規則（MFA、RLS）。看到違反這些硬性規範的舊程式碼 → **主動修正**，不 match 舊風格。
- **「No error handling for impossible scenarios」不適用 myCRM 錯誤處理章節**：Toast 規則、4xx/5xx 處理、空白狀態、Loading 狀態 所列情境皆視為「可能發生」，必須依規範實作。
- **本檔已明訂的決策不適用「If uncertain, ask」**：MFA 強制、Session 7 天、i18n 三語同步、RLS 啟用、cancerfree.io 網域驗證 等既定規範直接遵守，不需再詢問。
- **其他一切未明訂事項** → 遵循 Behavioral Guidelines 4 原則。

---

## 專案簡介

myCRM 是給 cancerfree.io 全公司使用的 CRM 系統。透過 Telegram Bot 拍名片 → AI 辨識 → 存入 CRM，並提供 Web 管理介面。

---

## 技術棧

- **框架**：Next.js 14 (App Router)
- **語言**：TypeScript
- **樣式**：Tailwind CSS
- **資料庫 / Auth / Storage**：Supabase (PostgreSQL)
- **Telegram Bot**：Telegraf
- **OCR**：Google Gemini 1.5 Flash
- **圖片處理**：Sharp
- **國際化**：next-intl
- **主題切換**：next-themes
- **套件管理**：npm
- **部署**：Vercel

---

## 重要路徑

- Bot Webhook: `src/app/api/bot/route.ts`
- Supabase 工具: `src/lib/supabase.ts`
- Gemini 工具: `src/lib/gemini.ts`
- 圖片處理: `src/lib/imageProcessor.ts`
- Web 頁面: `src/app/(dashboard)/`
- 翻譯檔: `src/messages/{locale}.json`

---

## TypeScript 規則

- 型別名稱使用 PascalCase：`Contact`、`CardImage`
- 優先使用 `interface`，除非需要 union/intersection 才用 `type`
- 所有函式參數和回傳值都要有明確型別

---

## 檔案與命名規範

| 類別 | 規則 | 範例 |
|---|---|---|
| React 元件檔 | PascalCase | `ContactCard.tsx` |
| 工具函式 / hook | camelCase | `useContacts.ts`、`formatDate.ts` |
| 頁面 (App Router) | 資料夾 + `page.tsx` | `app/contacts/page.tsx` |
| API Route | kebab-case | `app/api/contact-merge/route.ts` |
| 翻譯檔 | `src/messages/{locale}.json` | `src/messages/zh-TW.json` |

---

## 樣式規則

### Tailwind CSS

- 使用 Tailwind utility classes，不寫自訂 CSS
- 所有顏色使用 CSS 變數或 Tailwind 的語意化 class，不 hardcode hex 值

### Dark / Light Mode

- 所有頁面**強制支援** Dark / Light Mode
- **禁止** `text-white` 作為可讀文字色
- 文字色：`text-gray-900 dark:text-gray-100`
- 主背景：`bg-white dark:bg-gray-950`
- Border：`border-gray-200 dark:border-gray-800`
- 主題偏好持久化至 `localStorage`，預設跟隨系統

### Mobile-first

- 所有元件以 Mobile-first 設計，再往上適配
- 觸控目標 ≥ 44 × 44px
- `input` / `select` 字型 ≥ 16px（防止 iOS Safari 縮放）
- **禁止** hover-only 互動
- 斷點：`sm`(0-639) / `md`(640-1023) / `lg`(1024-1279) / `xl`(1280+)

---

## 多語系 (i18n)

- 支援語言：`zh-TW`（預設）/ `en` / `ja`
- **禁止** hardcode 任何使用者可見文字
- Client Component：`useTranslations()`
- Server Component：`getTranslations()`
- 翻譯檔位置：`src/messages/{locale}.json`
- 三個語言 JSON 的 key **必須保持一致**
- 新增 key 時，三個語言檔都要同步更新

---

## 資料庫規範

### 命名規則

- 資料表名稱：`snake_case`，複數（`contacts`、`contact_cards`）
- 欄位名稱：`snake_case`（`created_at`、`contact_id`）
- 環境變數：`UPPER_SNAKE_CASE`

### RLS

- 所有資料表**必須**啟用 Row Level Security
- 權限邏輯寫在 RLS policy 中，不依賴前端檢查
- Super Admin（`pohan.chen@cancerfree.io`）不可被降級或刪除

---

## 開發規範

- 所有 API route 使用 service role client
- 前端 Component 使用 anon client
- 圖片一律壓縮後再存 Storage

---

## API 規範

### Route 命名

- 使用 `kebab-case`：`/api/contact-merge`

### 回應格式

錯誤一律回傳：

```json
{ "error": "錯誤訊息" }
```

成功依功能自訂回應結構。

### 分頁

- `page`（預設 1）、`pageSize`（預設 20，上限 100）
- `sortBy`（預設 `created_at`）、`sortOrder`（預設 `desc`）

---

## 錯誤處理

### Toast 規則

| 類型 | 顏色 | 自動關閉 |
|---|---|---|
| success | 綠色 | 3 秒 |
| error | 紅色 | **不自動關閉** |
| warning | 黃色 | 5 秒 |
| info | 藍色 | 3 秒 |

### API 錯誤

- 4xx → 顯示 API 回傳的 `error` 字串（經翻譯）
- 5xx → 顯示通用錯誤「系統發生錯誤，請稍後再試」
- 401 → 自動導回登入頁
- 網路中斷 → 全頁 banner

### Loading 狀態

- 頁面初次載入：Skeleton / Spinner
- 資料重新載入：保留舊資料 + 頂部 progress bar
- 按鈕提交中：loading spinner + disabled（防止重複點擊）

### 空白狀態

- 所有列表/表格在無資料時，須顯示空白狀態插圖 + 說明文字 + CTA

---

## UI 元件規則

| 元件 | 規範 |
|---|---|
| 按鈕 | 主要操作 → Primary，次要 → Secondary / Ghost |
| 表單 | Label 在上方、錯誤訊息在下方、必填加 `*` |
| 表格 | 支援排序、分頁；手機版可橫向捲動 |
| Modal | ESC 可關閉、點擊背景可關閉（破壞性操作除外） |
| 確認對話框 | 破壞性操作（刪除、下架）必須二次確認 |

---

## 安全性規則

- **MFA 強制啟用**：所有使用者登入後必須完成 MFA 註冊（Supabase TOTP），未完成前不可使用任何功能
- **Session 有效期 7 天**：`maxAge: 604800`，過期後強制重新登入，不自動延長
- **Session token 儲存於 httpOnly cookie**，不存 localStorage
- **禁止** `dangerouslySetInnerHTML`（除非經 DOMPurify 處理）
- **禁止** 將 token / 密碼存入 `localStorage`
- **禁止** 敏感資訊使用 `NEXT_PUBLIC_` 前綴
- 所有 API Route 須驗證 Supabase Auth token（除登入/公開頁面/Bot webhook）
- 前後端皆需輸入驗證
- 登入等敏感 API 需設定 Rate Limit
- 後端需二次驗證 email 網域為 `cancerfree.io`（不可僅靠前端）

---

## Git 規範

### Commit Message（Conventional Commits）

```
{type}({scope}): {簡述}
```

- type：`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`
- scope（可選）：`auth`、`bot`、`i18n`、`merge`、`duplicates` 等

### Commit 作者標記（每次 Commit 必填）

每次 commit 訊息末尾**必須**加上 `Co-Authored-By` 標記。

---

## 效能標準

- Lighthouse：Performance ≥ 90、Accessibility ≥ 90、Best Practices ≥ 90
- FCP ≤ 1.5s、LCP ≤ 2.5s、CLS ≤ 0.1、TTI ≤ 3.0s
- 圖片使用 `next/image`，WebP 優先，單張 ≤ 200KB
- 必須設定 `width`/`height` 或 `fill`（避免 CLS）

---

## 測試

- 單元測試：Vitest
- 整合測試：Vitest + Testing Library
- E2E：Playwright
- API 測試：Vitest / Supertest
- 覆蓋率目標：utils ≥ 90%、業務元件 ≥ 80%、整體 ≥ 70%

---

## 版本規則

格式：`MAJOR.MINOR.PATCH`

| 情況 | 動作 | 範例 |
|------|------|------|
| 新功能 | MINOR +1，PATCH 歸零 | 1.0.0 → 1.1.0 |
| Bug fix / 小改進 | PATCH +1 | 1.0.0 → 1.0.1 |
| MINOR 到達 9 後再新增功能 | MAJOR +1，MINOR/PATCH 歸零 | 1.9.x → 2.0.0 |

### 每次 git push 必做

1. 更新 `package.json` 的 `version` 欄位
2. 在 `docs/CHANGELOG.md` 最頂端新增版本條目，格式：

```markdown
## v{VERSION} — {標題}（{YYYY-MM-DD}）

### 變更項目
- ...
```

---

## 禁止事項速查

- ❌ `console.log`（debug 殘留）
- ❌ `text-white` 作為可讀文字色
- ❌ hardcode 使用者可見文字（必須透過 i18n）
- ❌ hover-only 互動
- ❌ `dangerouslySetInnerHTML`（除非 DOMPurify）
- ❌ `localStorage` 存放 token / 密碼
- ❌ `NEXT_PUBLIC_` 存放敏感資訊
- ❌ 違反 Behavioral Guidelines（見本檔頂部）
