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

## Gmail Authorization (Automatic Sending)

Scheduled reports are sent automatically by the backend via Gmail, so a one-time Google authorization is required first.

**There is no "Link Gmail" button on this page.** The authorization flow must be started by a super_admin, while signed in, by opening the URL `/api/auth/gmail` directly in the browser:

1. Open `/api/auth/gmail` (it redirects to the Google OAuth authorization screen)
2. Complete the Google authorization
3. The system stores the authorization credentials (refreshed automatically when they expire)

After that, scheduled reports can be sent automatically from that account. This authorization usually only needs to be done once.

---

## Scheduled Reports

Set up automatic periodic report delivery:

### Add a Schedule

1. Click "Add Schedule"
2. Fill in:
   - **Schedule Name**
   - **Frequency**: Weekly / Monthly / Custom (Cron) — the Cron expression field only appears when "Custom" is selected
   - **Date Range (days)**: How many days each report covers (1–365)
   - **Recipients (comma-separated)**: One or more recipients, separated by commas
3. The schedule takes effect immediately after saving

> Edit: Click the ✏️ icon on a schedule row to open the same form pre-filled with the existing settings.

### Schedule List

| Column | Description |
|--------|-------------|
| Schedule Name | The schedule's name |
| Frequency | Execution frequency (Weekly / Monthly / Custom) |
| Recipients | Report delivery targets |
| Status | Enabled / Disabled (click to toggle) |
| Last Run | Time of the most recent automatic send (Taipei time): ✅ on success, ⚠️ on error; shows "Never run" if it has not run yet |
| Actions | ✏️ Edit, 🗑 Delete |

### Cron Expression Examples

| Frequency | Cron |
|-----------|------|
| Every Monday at 9 AM | `0 9 * * 1` |
| 1st of every month | `0 9 1 * *` |
| Every day at 8 AM | `0 8 * * *` |

> Execution times are based on UTC. Taiwan time = UTC+8; please convert accordingly.
