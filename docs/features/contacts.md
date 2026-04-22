---
title: 聯絡人管理
parent: 功能說明
nav_order: 2
---

# 聯絡人管理

路徑：`/contacts`

---

## 聯絡人列表

### 搜尋與篩選

- **關鍵字搜尋**：比對姓名、Email、公司名（模糊搜尋）
- **Tag 篩選**：點選 Tag 按鈕只顯示該 Tag 的聯絡人
- **預設排序**：依「最後活動時間」倒序（最近有互動的人在最上面，詳見下方規則）
- **其他排序**：點擊欄位標題切換（姓名 / 公司 / 職稱 / Email / Tags / 建立時間）
- **分頁**：每頁 20 筆，底部頁碼導覽

### 匯出

點擊「匯出 Excel」或「匯出 CSV」下載目前篩選結果（不受分頁限制）。

---

## 新增聯絡人

路徑：`/contacts/new`

分為四個區塊手動填寫：

| 區塊 | 欄位 |
|------|------|
| **基本資訊** | 姓名（中/英/當地語言）、公司（中/英/當地語言）、職稱 |
| **聯絡方式** | Email、第二 Email、電話、第二電話、地址、網站、**國家** |
| **社群媒體** | LinkedIn、Facebook |
| **備註** | 備註文字 |

### 名片 AI 辨識（多張）

1. 點擊「選擇名片照片」，一次選取最多 **6 張**（正面、反面等）
2. 點擊「掃描名片」，系統壓縮後合併送 AI 辨識
3. 頁面左側顯示照片預覽，右側顯示 AI 辨識結果對照
4. 點擊「套用到表單」填入欄位，或「忽略」手動填寫

> 存檔前系統會比對 Email 和姓名相似度，偵測到重複聯絡人時會提示確認。

---

## 批次上傳

路徑：`/contacts/batch-upload`

一次上傳最多 **50 張**名片照片：

1. 點擊或拖曳上傳圖片（支援 JPG / PNG）
2. 系統同時處理最多 5 張（並行上傳 + AI 辨識）
3. 進度條顯示目前進度
4. 辨識完成後顯示預覽表格，可逐筆修改
5. 批次重複偵測（與現有聯絡人比對）
6. 點擊「全部存檔」一次儲存

---

## 聯絡人詳情

路徑：`/contacts/[id]`

### 基本資料區

顯示所有聯絡人欄位，右上角「編輯」按鈕開啟編輯 Modal。

- **Email / 電話**欄位旁有複製圖示，點擊即複製到剪貼簿
- **國家**欄位顯示旗幟 emoji + 中文名稱（如 🇹🇼 台灣）

### 名片管理

一個聯絡人可以掛多張名片（正面、反面、或自訂標籤）：
- 一次選取最多 **6 張**，AI 合併辨識後顯示差異欄位供確認
- 點擊卡片右上角 🗑 刪除

### 互動紀錄時間軸

依時間倒序顯示所有紀錄，類型包含：
- **筆記** (note)
- **會議** (meeting)
- **Email** (email)
- **系統** (system) — 系統自動產生

預設載入 20 筆，捲動到底自動載入更多（無限捲動）。

### 發送 Email

點擊「寄信」按鈕，開啟增強版寄信 Modal：
- **收件人（To / CC / BCC）**：可手動修改，預設帶入聯絡人 Email
- **範本**：選擇後主旨、內文、附件自動帶入
- **AI 生成**：輸入描述，AI 帶入收件人資訊與最近互動紀錄自動產生內文（HTML 格式，TipTap 編輯器）
- **聯絡人照片**：若該聯絡人已透過 bot `/p` 上傳過合照，modal 會顯示縮圖區塊，點一下縮圖即可附加到信件，再點一下移除
- **臨時附件**：上傳本次專用附件（單檔 5MB），不儲存到範本

發送透過 Microsoft Graph（Outlook）送出，自動建立一筆 Email 互動紀錄並將聯絡人推到「最後活動」排序頂端（見下一節）。

---

## 最後活動時間 (`last_activity_at`)

**目的**：讓最近有互動的聯絡人自動浮到列表頂端，不用記名字去搜尋。

### 計算規則
`contacts.last_activity_at` 由 DB trigger 自動維護，取下列時間戳的**最晚者**：
1. `interaction_logs.created_at` — 限 type 為 `note` / `meeting` / `email` 且**非 SendGrid 寄送**
2. `contact_photos.created_at` — 任何照片上傳（bot `/p` 或網頁上傳）
3. 若以上都沒有 → fallback 到 `contacts.created_at`

### 行為矩陣

| 動作 | 算最後活動？ | 寫互動紀錄？ |
|---|---|---|
| 聯絡人詳情頁寄信（Outlook/Graph） | ✅ | ✅ |
| Bot `/met` 拜訪筆記 | ✅ | ✅ (type=note 或 meeting) |
| Bot `/meet` 會議 | ✅ | ✅ (type=meeting) |
| Bot `/work` 任務 | ✅ | ✅ (type=note) |
| Bot `/p` 合照上傳 | ✅ | ✅（附註則寫系統紀錄） |
| `/email/compose` Outlook 群發 | ✅ | ✅ |
| **`/email/compose` SendGrid 群發** | ❌ | ✅ |
| **Newsletter campaign（一律走 SendGrid）** | ❌ | ✅ |
| Bot `/a` 新增名片（AI 辨識） | ❌ (type=system) | ✅ |

### 為什麼 SendGrid 不算？
SendGrid 典型用途是大量自動化群發（newsletter、行銷信）。如果每封 SendGrid 信件都刷新 `last_activity_at`，寄一次 newsletter 給 4000+ 訂閱者會把每個聯絡人的「最後活動」洗成同一時間，這個排序訊號就完全失去意義。Outlook / Graph 寄信是 1-to-1 或小範圍互動，才是真正值得追蹤的「我最近跟誰聊過」訊號。

**使用者仍可從互動紀錄時間軸看到完整寄送歷史**，只是不影響排序。

### UI 提示
`/email/compose` 切換到 SendGrid 時會顯示紫色 badge：
> ⚠ SendGrid 寄送不會計入聯絡人最後活動時間（仍會寫互動紀錄）

---

## Hunter.io Email 自動查詢

**目的**：新建聯絡人若名片/LinkedIn/表單沒有 email，系統背景向 Hunter.io Email Finder 查一次。查到就寫進聯絡人並通知（bot）/ 背景更新（web）。

### 自動查的觸發點
- Bot `/a` 名片辨識完成、結果沒 email
- Bot `/li` LinkedIn 辨識完成、結果沒 email
- Bot `/p 姓名` 找不到 → 建立新聯絡人（只填姓名）→ 查
- 網頁批次上傳每筆 insert 後、該筆沒 email
- 網頁手動新增 `/contacts/new` submit 後、email 欄空

### 每日自動批次（cron）
- 每天 **02:00 Asia/Taipei** 跑一次 `/api/hunter/cron`
- 每次處理最多 50 筆「沒 email 且 30 天內沒查過」的聯絡人
- 800 筆舊帳約 16 天清一輪
- Hunter 帳號剩餘 credits 低於 5 時會自動 skip 該次執行

### 額度規則
Hunter Free tier = 50 searches/month，但「**找不到不扣 credit**」。所以大量舊聯絡人（多半找不到）可以積極查不怕爆表。管理頁 `/admin/hunter` 顯示實時剩餘額度。

### 管理頁
`/admin/hunter` 仍保留：
- 統計（總沒 email / 從未查過 / 查過沒結果 / 本月查過）
- 手動觸發批次（最多 100 筆/次）
- 設定 API key
- 重置 `hunter_searched_at`（需要重新掃一輪時用）

---

## 欄位說明

| 欄位 | 說明 |
|------|------|
| `name` | 中文姓名（主要顯示） |
| `name_en` | 英文姓名 |
| `name_local` | 當地語言姓名（日文等） |
| `company` | 公司（中文） |
| `company_en` | 公司（英文） |
| `company_local` | 公司（當地語言） |
| `title` | 職稱 |
| `email` | 主要 Email |
| `second_email` | 第二 Email |
| `phone` | 主要電話 |
| `second_phone` | 第二電話 |
| `address` | 地址 |
| `website` | 網站 |
| `linkedin_url` | LinkedIn |
| `facebook_url` | Facebook |
| `notes` | 備註 |
| `country_code` | 國家代碼（ISO 3166-1 α-2，如 `TW`），連結至 countries 資料表 |
| `last_activity_at` | 最後活動時間戳（由 DB trigger 自動維護，見上方規則） |
