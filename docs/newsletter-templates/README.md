# Newsletter Templates

mycrm 電子報模板骨架。從 listmonk 原版 HTML 重整出的乾淨版本，給 AI compose 流程（`/api/ai-newsletter-compose`，尚未實作）當 base。

## 檔案

| 檔案 | 用途 |
|---|---|
| `skeleton-zh-TW.html` | 中文月報骨架（含所有 fixed 區塊 + 變數 placeholder） |
| `skeleton-en.html` | 英文月報骨架（去除 CJK 字型 fallback） |
| `skeleton-ja.html` | 日文月報骨架（加入 Hiragino/Yu Gothic fallback） |
| `block-section.html` | 單一 section 區塊模板（每個 story 複製一份） |

## 骨架變數

| Placeholder | 說明 | 範例 |
|---|---|---|
| `{{subject}}` | 郵件主旨（也塞進 `<title>`） | `CancerFree Biotech 2026 年 5 月月報` |
| `{{logo_url}}` | 公司 logo URL（建議 host 在 Supabase Storage） | `https://...supabase.co/storage/v1/object/public/...` |
| `{{month_label}}` | 月份標籤 | `2026年5月` / `2026 May` / `2026年5月号` |
| `{{substack_url}}` | Substack 或官網的當月文章連結（header 右上 "New update"） | `https://open.substack.com/pub/.../p/...` |
| `{{upcoming_title}}` | 預告區 H2 標題 | `5月重點` |
| `{{intro_html}}` | 本月摘要 innerHTML（段落 + `<ul>` 列點） | 見 skeleton 內原樣範例 |
| `{{upcoming_blocks}}` | 本月預告區塊 innerHTML（多個 `block-section.html` 串接） | |
| `{{recap_title}}` | 回顧區 H2 標題 | `4月回顧` |
| `{{recap_blocks}}` | 上月回顧區塊 innerHTML | |
| `{{facebook_url}}` | Facebook 專頁 | |
| `{{linkedin_url}}` | LinkedIn 專頁 | |
| `{{website_url}}` | 官網 | |
| `{{optout_url}}` | mycrm 個別收件人退訂連結（寄送時 per-recipient 動態產生） | `https://crm.cancerfree.io/email-optout?token=xxx` |

## 區塊變數（`block-section.html`）

| Placeholder | 說明 |
|---|---|
| `{{number}}` | 序號（1、2、3…） |
| `{{title}}` | 事件標題 |
| `{{paragraphs_html}}` | 段落 innerHTML，段落間用 `</p><br>` |
| `{{link_html}}` | 連結行 HTML（可空字串） |
| `{{image_url}}` | 圖片 URL |
| `{{image_alt}}` | 圖片 alt text |

## 跟原版 listmonk 的差異

- ✅ 移除 listmonk `{{{unsubscribe}}}` / `{{{unsubscribe_preferences}}}` → 改用 mycrm `{{optout_url}}`
- ✅ 移除硬編碼的 listmonk image host（`listmonk.avatarmedicine.xyz`）→ 改用 `{{placeholder}}`
- ✅ 社群圖示連結改成 `{{placeholder}}`（原版是 `href="#"`）
- ✅ 簡化 inline style（合併 `padding-left` / `padding-right` 為 `padding:0 X`）
- ✅ `<p>` 標籤加上 `margin:0` 防止預設 margin 破版
- ✅ 視覺保持不變：teal `#0D9488`、600px 容器、Helvetica Neue

## 後續步驟

1. ~~補 `skeleton-en.html` 和 `skeleton-ja.html`~~ ✅ 已完成
2. Logo / 社群 icons 搬到 Supabase Storage（擺脫 listmonk 和 mailerlite 的 CDN 依賴）
3. 寫 `/api/ai-newsletter-compose` endpoint：吃 stories + photos → 填這份骨架
4. 寫 template import 腳本：把這 3 份 skeleton 寫進 `email_templates` 表（3 筆記錄：中/英/日）
5. 設計 compose UI：管理員填入月份、stories、photos，點 AI 生成 → 預覽 → 存為 campaign
