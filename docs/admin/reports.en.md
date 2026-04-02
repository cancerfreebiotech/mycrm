---
title: Report Management
parent: Admin
nav_order: 4
---

# Report Management (Admin)

Path: `/admin/reports` (visible to super_admin only)

For full feature details, see [Features → Reports](../features/reports.md).

---

## Admin-Specific Notes

### Gmail OAuth Management

- Only one Gmail account needs to be authorized per Supabase project
- When the token expires (usually after 1 hour), the system automatically refreshes it using the refresh token
- To switch Gmail accounts, simply click "Link Gmail" to re-authorize

### Edge Function Scheduled Execution

Report scheduling is executed by the `send-report` Edge Function, which must be triggered via pg_cron or an external scheduler.

To configure pg_cron for automatic triggering (run once in the Supabase SQL Editor):

```sql
-- Check active schedules every hour
SELECT cron.schedule('send-report-hourly', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/send-report',
    headers := '{"Authorization": "Bearer <anon_key>", "Content-Type": "application/json"}',
    body := '{}'
  )$$
);
```

> The Edge Function internally determines which schedules need to run at the current time; it does not send reports every hour.

### Manual Trigger

On the Reports page, click "Generate Now" → "Send via Gmail" to manually trigger a send.
