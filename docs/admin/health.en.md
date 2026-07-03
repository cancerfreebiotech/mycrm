---
title: System Health
parent: Admin
nav_order: 15
---

# System Health

Path: `/admin/health` (`super_admin` only; the sidebar shows it only to super_admin, and the data APIs also enforce permission on the backend)

---

## What this page does

A single overview of how the whole system is running: external service health, the email-finder tool, and the three sections added in v7.4.0 — **cron heartbeat, dead letters, and this month's usage**.

At the top you can "Check now", or tick "Auto-refresh every 30 s" for continuous monitoring; the last-checked time is shown.

---

## External service status

A summary bar counts services that are OK / down / unconfigured, and cards below list each service: Supabase, Gemini, Telegram Bot, SendGrid, Teams Bot.

- Status badge: **OK** / **Down** / **Unconfigured**.
- Each card has a latency bar: green (< 500 ms), yellow (< 2000 ms), red (slower), with a color legend at the bottom.

---

## Hunter.io (email finder)

For contacts with no email, Hunter.io is used to try to find their address.

- **API Key**: paste and save the key; a green check shows when it is set.
- **Stats**: total with no email, never searched, searched but not found, searched this month; remaining monthly credits are shown when available.
- **Start search**: queries contacts not yet searched, then lists found / not-found results. Requires an API key first.
- **Reset search state**: clears the searched flags so contacts can be searched again (requires confirmation).

---

## Cron heartbeat (v7.4.0)

Lists the latest run status of each background job (cron):

- Status: **OK** / **Overdue** / **Error** / **No record**; the section is highlighted when anything is overdue or errored.
- Shows the last finished time (relative) and the run duration.

Use it to confirm that nightly automation, reporting checks, and similar schedules are actually running.

---

## Dead letters (v7.4.0)

Lists the number of failed items in each table (dead letters):

- Tables with failures are marked red and can be expanded to see recent error messages.
- `pending_contacts` and `contact_briefings` offer a "Requeue" button to push failed items back into the queue.
- `failed_scans` offers a link to "Failed Scan Review".

---

## This month's usage (v7.4.0)

Cards show this month's usage against last month: AI call count, AI input/output tokens (when recorded), emails sent, newsletters sent.

---

## Notes

- This page is super_admin only; each section fetches from its own API, so if one fails only that section shows an error and can be retried on its own without affecting the others.
- Hunter.io's free quota is limited — check remaining credits before searching.
