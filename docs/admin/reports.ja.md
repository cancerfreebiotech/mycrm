---
title: レポート管理
parent: 管理者
nav_order: 4
---

# レポート管理（管理者）

パス：`/admin/reports`（super_admin のみ表示）

機能の詳細は [機能説明 → レポート](../features/reports.md) をご覧ください。

---

## 管理者向け補足説明

### Gmail OAuth 管理

- 1 つの Supabase プロジェクトにつき、認可が必要な Gmail アカウントは 1 つのみです
- トークンの有効期限切れ（通常 1 時間）後は、リフレッシュトークンを使って自動更新されます
- Gmail アカウントを変更する場合は、「Gmail を連携」をクリックして再認可するだけです

### Edge Function スケジュール実行

レポートのスケジュールは `send-report` Edge Function によって実行されます。pg_cron または外部スケジューラーからのトリガーが必要です。

pg_cron で自動トリガーを設定するには（Supabase SQL Editor で一度だけ実行）：

```sql
-- 毎時アクティブなスケジュールを確認
SELECT cron.schedule('send-report-hourly', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/send-report',
    headers := '{"Authorization": "Bearer <anon_key>", "Content-Type": "application/json"}',
    body := '{}'
  )$$
);
```

> Edge Function は現時点で実行が必要なスケジュールを内部で判断します。毎時レポートを送信するわけではありません。

### 手動トリガー

レポートページで「今すぐ生成」→「Gmail で送信」をクリックすると手動でレポートを送信できます。
