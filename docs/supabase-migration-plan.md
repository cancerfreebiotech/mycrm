---
title: Supabase Migration Plan（延遲）
status: deferred
created: 2026-04-28
---

# Supabase Migration Plan — Free → 既有 Pro org（暫緩）

> **狀態：暫緩，未來再做**
> 2026-04-28 確認方向但暫不執行。重看時間：當 Free tier 又開始抽風 / 用戶量增加 / 預算允許時。

## 背景

myCRM 目前在 **個人 Supabase 帳號的 Free tier**。同一個人**另一個帳號已是 Pro org**（每月 $25 base）。考慮把 myCRM 遷過去當第二個 project，省 base fee。

## 費用比較

| 方案 | 月費 | 備註 |
|---|---|---|
| A. 留 Free | $0 | 現況、抽風、無 SLA |
| B. 升現在 org 到 Pro | $25 base + usage | 快但多付 base |
| **C. 遷到既有 Pro org（推薦）** | **+0 base，僅多付 ~$10 compute** | 省 ~$15/月 = $180/年 |

> Supabase 計費是 **org-level**，一個 Pro org $25 含多個 project。第 2 個 project 起只多付 compute size（Nano $0、Micro ~$10、Small ~$25）。myCRM 量級 Micro 應該夠。

## 遷移步驟

### 我能做的（95%）

- 兩個 project 跑 SQL（schema migration + data sync + URL find/replace）
- Storage bucket（cards / photos / 等）拷貝 script，用 service role key
- Auth users export + import 腳本（保留密碼 hash）
- Code 改動 + commit + push
- Smoke test

### 你必須親自做（5%）

- Supabase dashboard 建新 project（選 region、設 DB password）
- Vercel dashboard 改 env vars：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - 其他 supabase 相關 secret
- 通知使用者：MFA TOTP 要重新註冊（Supabase 沒辦法跨 project 搬 TOTP secret）

### 我需要的權限

- 新 project ID + service role key + DB password
- 舊 project service role key
- Supabase MCP 對新 project 的存取（建 project 那個 org 通常自動含）

## 流程

```
1. [User]   建新 project（5 分鐘）→ 給 ID + service role key + DB password
2. [Claude] DB schema migration（dump → load）+ diff 確認
3. [Claude] DB data migration（保留 row IDs 避免 FK 斷）
4. [Claude] Storage bucket 拷貝（Node script）
5. [Claude] Auth users 匯入（admin API）
6. [Claude] DB URL 替換（UPDATE contacts/contact_cards/failed_scans/pending_contacts）
7. [Claude] Code prep：開 PR 但暫不 merge
8. [User]   Vercel env vars 改值
9. [Claude] Merge PR → Vercel 自動 deploy
10. [雙方]  Smoke test
11. [一週後] [User] 確認穩定後砍舊 project
```

## 預估時間

- User 動手 ~15 分鐘
- Claude 工 ~3-4 小時
- 停機 ~10 分鐘（步驟 8-9 之間）

## 踩雷清單

- 🚨 `auth.identities` 沒官方一鍵搬，要寫腳本 + admin API
- 🚨 MFA TOTP secrets 跟 user 綁，搬完每個人要重設一次
- 🚨 DB 內**硬編 storage URL** 要 sed：
  ```sql
  UPDATE contacts SET card_img_url = REPLACE(card_img_url, OLD_DOMAIN, NEW_DOMAIN);
  UPDATE contact_cards SET card_img_url = REPLACE(card_img_url, OLD_DOMAIN, NEW_DOMAIN);
  UPDATE failed_scans SET card_img_url = REPLACE(card_img_url, OLD_DOMAIN, NEW_DOMAIN);
  UPDATE pending_contacts SET data = REPLACE(data::text, OLD_DOMAIN, NEW_DOMAIN)::jsonb;
  ```
- 🚨 **第一週留舊 project 別砍**，當回滾保險
- 🚨 SUPABASE_URL 變 → Telegram bot webhook 不用動（指向 Vercel 不是 Supabase）

## 替代方案（次優）

如果只是想避免 Free 抽風又懶得搬：**直接升現在這個 org 到 Pro**（$25/月、5 分鐘）。等真要省再做 migration。

## 重看時機

- Free 又開始 throttle / 504 timeout 變多
- DB size 接近 500 MB 上限
- 需要 daily backups 之類 Pro-only 功能
- 預算可以接受 ~$10/月 額外 compute

## 相關檔案

- `vercel.json` — cron 設定（migration 後不需動）
- `.env.local` — 本機 env，migration 後需更新
- `src/lib/supabase.ts` — 讀 env，不需動
