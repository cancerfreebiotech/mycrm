# 報表管理（管理員）

路徑：`/admin/reports`（僅 super_admin 可見）

完整功能說明請見 [功能說明 → 報表](../features/reports.md)。

---

## 管理員額外說明

### Gmail OAuth 管理

- 每個 Supabase 專案只需要授權一個 Gmail 帳號
- Token 逾期（通常 1 小時）後系統會用 refresh token 自動更新
- 若需要更換 Gmail 帳號，直接點擊「連結 Gmail」重新授權即可

### Edge Function 排程執行

報表排程是由 `send-report` Edge Function 執行，需要透過 pg_cron 或外部排程器觸發。

若要設定 pg_cron 自動觸發（在 Supabase SQL Editor 執行一次）：

```sql
-- 每小時檢查一次活躍排程
SELECT cron.schedule('send-report-hourly', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/send-report',
    headers := '{"Authorization": "Bearer <anon_key>", "Content-Type": "application/json"}',
    body := '{}'
  )$$
);
```

> Edge Function 內部會判斷哪些排程需要在當下執行，不會每小時都寄出。

### 手動觸發

在報表頁面點擊「立即產生」→「發送 Gmail」可手動觸發寄送。
