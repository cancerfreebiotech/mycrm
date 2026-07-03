---
title: Report Management
parent: Admin
nav_order: 4
---

# Report Management

Path: `/admin/reports`

Access: **Every member** can open the Reports page, generate reports on demand, and manage the schedules they created. `super_admin` additionally sees an "Owner" column and can view everyone's schedules.

For full feature details, see [Features → Reports](../features/reports.md).

---

## Generate a Report Now

1. Choose the report date range (from / to).
2. Optionally apply filters: tags, interaction type (meeting / note / email), creator, country.
3. Click "Generate" → the interaction logs are previewed as a sortable table below.
4. Or click "Download Excel" → download the `.xlsx` file directly.

---

## Scheduled Reports

Click "Add Schedule" to open the setup form:

| Field | Description |
|-------|-------------|
| Schedule Name | An identifying name for the schedule |
| Frequency | Weekly / Monthly / Custom (Cron expression) |
| Date Range (days) | Number of recent days each send should cover |
| Recipients | A comma-separated list of email addresses |

Each schedule can be enabled/disabled, edited, or deleted. The "Last Run" column shows the time and result of the most recent automatic send (✅ success / ⚠️ failure).

---

## How Scheduled Sending Works

Scheduled sending is handled by **backend automation**: the system checks every hour, and any schedule that is due is automatically emailed to that schedule's recipient list, with the "Last Run" status updated.

No manual trigger is required, and **no external mail account needs to be linked**.
