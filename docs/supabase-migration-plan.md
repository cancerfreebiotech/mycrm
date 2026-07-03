---
title: Supabase Migration Plan — Free → Pro org
status: completed
updated: 2026-05-05
---

# Supabase Migration Plan — Free → 既有 Pro org

> ✅ **已完成（2026-05-13）**：Production 已搬到新 project `gaxjgcztzfxokesiraai`，
> 舊 project `zaqzqcvsckripotuujep` 已棄用停用。以下內容保留作為遷移過程紀錄。

> 把 myCRM 從個人 Free org 遷移到你另一個帳號的 Pro org 下當第二個 project。
> 省 ~$10-15/月，並立刻獲得每日備份 + PITR。

---

## 現況快照（2026-05-05）

| 指標 | 數值 |
|---|---|
| DB 大小 | 29 MB |
| contacts | 4,882 筆 |
| interaction_logs | 10,570 筆 |
| camcard_pending | 5,511 筆 |
| newsletter_subscribers | 4,360 筆 |
| Auth users | 20 人 |
| 已設 TOTP 的 user | 16 人（需重新綁定） |
| Storage objects | ~6,505 個（cards 6,147 + camcard 332 + newsletter-assets 26） |
| 舊 project ID | `zaqzqcvsckripotuujep` |

---

## 費用

| 方案 | 月費 |
|---|---|
| 現況（Free） | $0（但無備份、會 throttle） |
| 升現在 org 到 Pro | +$25/月 |
| **遷到既有 Pro org（本計畫）** | **+~$10/月（Micro compute）** |

---

## 需要你親自做的事（共 3 步）

### Step 1 — 在 Pro org 建新 project

1. 登入你的 Pro 帳號 Supabase Dashboard
2. 選你的 Pro org → New Project
3. 設定：
   - Name: `myCRM`
   - Region: **ap-northeast-1**（東京，跟現在一樣）
   - Database Password: 記下來，之後要給我
4. 等 project 建好（約 2 分鐘）
5. 把以下資訊給我：
   - 新 project ID（URL 裡的那串）
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - DB Password

### Step 2 — 通知有 TOTP 的 16 人（Migration 當天）

以下 16 人遷移完後需要重新設定 MFA（第一次登入會被要求）：

```
pohan.chen, eva.hung, luna.chang, amparo.pan, melody.shiau,
bella.changchien, shihpei.wu, heather.tang, ian.chen,
jessie.chen, lucia.lu, anastasia.chen, allen.ho,
masato.yokoyama, juno.chen, kevin
```

以下 4 人沒有 TOTP，不受影響：
`tiffany.jian, davie.dai, jim.yen, sid.mau`

### Step 3 — 更新 Vercel env vars（我完成 Migration 後告訴你）

到 Vercel Dashboard → myCRM project → Settings → Environment Variables，更新：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 我會做的事（你給我新 project 資訊後）

### Phase 1 — Schema 搬移

用 `supabase db dump` 把 schema（含 RLS、functions、triggers）dump 出來，apply 到新 project。

### Phase 2 — Data 搬移

用 pg_dump 的 COPY 格式，保留所有 row ID，依照 FK 依序匯入：

```
順序：users → tags → contacts → contact_cards → contact_photos
     → contact_tags → camcard_pending → pending_contacts
     → failed_scans → interaction_logs → bot_sessions
     → telegram_dedup → duplicate_pairs
     → newsletter_lists → newsletter_subscribers
     → newsletter_subscriber_lists → newsletter_unsubscribes
     → newsletter_blacklist → newsletter_campaigns
     → newsletter_recipients → newsletter_tone_samples
     → email_events → email_campaigns → email_templates
     → ... (其他空表)
```

**auth users 搬移**：用 Supabase Admin API 逐一建立（保留 email，不保留 password hash → 每人需 reset-password 一次）。

> ⚠️ Supabase 沒有官方 auth.users 跨 project 搬移 API。密碼 hash 格式不同，無法直接 copy。
> 實作方式：在新 project 用 admin API create user with email，再寄 magic link 要求每人重設密碼。
> **使用者只需要：收一封重設密碼信 + 重設 MFA TOTP，其他什麼都不變。**

### Phase 3 — Storage 搬移

寫 Node.js script，從舊 project 下載所有 object，上傳到新 project 的對應 bucket：
- `cards` → `cards`（6,147 個）
- `camcard` → `camcard`（332 個）
- `newsletter-assets` → `newsletter-assets`（26 個）

預估時間：~20-30 分鐘（網路頻寬決定）

### Phase 4 — URL 替換

DB 裡有 hardcode 的 storage URL，搬完後用 SQL 替換：

```sql
-- 替換舊 project URL（執行前會再確認）
UPDATE contacts
  SET card_img_url = REPLACE(card_img_url, 'zaqzqcvsckripotuujep', '<NEW_PROJECT_ID>')
  WHERE card_img_url LIKE '%zaqzqcvsckripotuujep%';

UPDATE contact_cards
  SET card_img_url = REPLACE(card_img_url, 'zaqzqcvsckripotuujep', '<NEW_PROJECT_ID>'),
      card_img_back_url = REPLACE(card_img_back_url, 'zaqzqcvsckripotuujep', '<NEW_PROJECT_ID>')
  WHERE card_img_url LIKE '%zaqzqcvsckripotuujep%'
     OR card_img_back_url LIKE '%zaqzqcvsckripotuujep%';

UPDATE camcard_pending
  SET card_img_url = REPLACE(card_img_url, 'zaqzqcvsckripotuujep', '<NEW_PROJECT_ID>')
  WHERE card_img_url LIKE '%zaqzqcvsckripotuujep%';

UPDATE failed_scans
  SET card_img_url = REPLACE(card_img_url, 'zaqzqcvsckripotuujep', '<NEW_PROJECT_ID>')
  WHERE card_img_url LIKE '%zaqzqcvsckripotuujep%';

UPDATE pending_contacts
  SET data = REPLACE(data::text, 'zaqzqcvsckripotuujep', '<NEW_PROJECT_ID>')::jsonb
  WHERE data::text LIKE '%zaqzqcvsckripotuujep%';
```

### Phase 5 — Smoke test & Cutover

1. 我在新 project 跑 smoke test SQL（counts 比對）
2. 你更新 Vercel env vars → Redeploy
3. 你開瀏覽器驗證：登入、看聯絡人、看圖片
4. Telegram Bot 測試掃名片（不需動，Bot webhook 指向 Vercel，不是 Supabase）

---

## 停機時間

約 **5-10 分鐘**（步驟 5 你更新 Vercel env 到 redeploy 完成這段）。

可以排在 週末或下班後（20:00 後）執行。

---

## 使用者影響

| 人員 | 需要做的事 |
|---|---|
| 全部 20 人 | 收一封「請重設密碼」信，設新密碼（1 分鐘） |
| 16 人（有 TOTP） | 重設密碼後，第一次登入要重新綁定 MFA App（2 分鐘） |
| 4 人（無 TOTP） | 只需重設密碼 |

---

## 回滾計畫

- 舊 project 繼續存在（不要刪），最少保留 1 個月
- 如果新 project 有問題，Vercel env 改回舊值 → Redeploy → 5 分鐘內還原
- Free tier project 閒置 7 天後會被 Supabase pause，但不會自動刪除

---

## 風險清單

| 風險 | 機率 | 緩解 |
|---|---|---|
| auth.users 密碼 hash 無法搬 | 確定 | 設計為「重設密碼」流程，非阻塞 |
| TOTP secret 無法跨 project | 確定 | 通知用戶重設，非阻塞 |
| Storage 搬移速度慢 | 中 | 6,505 個小圖，~20-30 分鐘，可接受 |
| URL replace 漏掉某個欄位 | 低 | 搬完後跑 grep SQL 掃所有 TEXT 欄位 |
| FK 衝突造成匯入失敗 | 低 | 依序匯入，搬前先 TRUNCATE 確保乾淨 |

---

## 開始條件

你準備好後，給我：
1. 新 project 的 URL / ID
2. 新 project 的 service role key
3. 確認好「通知時間」（何時通知用戶重設密碼）

我就可以開始跑 Phase 1-4，整個過程你只需等候 + 在 Phase 5 更新 Vercel env。
