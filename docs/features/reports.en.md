---
title: Reports
parent: Features
nav_order: 5
---

# Reports

Path: `/admin/reports` (visible to super_admin only)

---

## Generate Report Now

1. Select a **Start Date** and **End Date**
2. Click "Generate Report"
3. Preview the data table on the page (new contacts + interaction records)
4. Click "Download Excel" to get the `.xlsx` file

### Excel Content

| Sheet | Description |
|-------|-------------|
| **New Business Cards** | Contacts added during the period, including all fields |
| **Interaction Logs** | All interaction records during the period (notes/meetings/emails) |

---

## Gmail Integration

Reports can be sent automatically via Gmail; OAuth authorization must be completed first:

1. Click "Link Gmail"
2. Complete the Google OAuth authorization flow
3. After linking, the connected Gmail account is displayed

> Authorization tokens are stored in the `gmail_oauth` table and refreshed automatically when they expire.

---

## Scheduled Reports

Set up automatic periodic report delivery:

### Add a Schedule

1. Click "+ Add Schedule"
2. Fill in:
   - **Recipient Email**
   - **Frequency**: Weekly / Monthly / Custom cron expression
3. The schedule takes effect immediately after saving

### Schedule List

| Column | Description |
|--------|-------------|
| Recipient | Report delivery target |
| Frequency | Execution frequency |
| Status | Enabled / Disabled |
| Actions | Toggle enable/disable, delete |

### Cron Expression Examples

| Frequency | Cron |
|-----------|------|
| Every Monday at 9 AM | `0 9 * * 1` |
| 1st of every month | `0 9 1 * *` |
| Every day at 8 AM | `0 8 * * *` |

> Execution times are based on UTC. Taiwan time = UTC+8; please convert accordingly.
