---
title: Suppression & Consent
parent: Admin
nav_order: 20
---

# Suppression & Consent

Path: `/admin/suppressions` (`super_admin` only)

---

## What this page does

Check for any email **whether it can be emailed, and why not**, and get a system-wide overview of suppression state. The verdict is a **strict union**: if any source suppresses the address, it is judged not emailable.

The page has two views:

- **Look up a single email**: enter an address → a can-email verdict card plus a per-source status table across the five sources.
- **No input (default)**: per-source **totals** and the **most recent 50** suppression records (merged across sources, newest first).

> This page is a read-only view — it reflects suppression state but does not add or lift suppressions here.

---

## The five suppression sources

"Can we email" is decided by five sources scattered across the system (per the source code; the verdict semantics match the newsletter send worker `src/lib/newsletter-send-worker.ts` and the CRM direct-send path `/api/email/send`):

| Source | Condition | Notes |
|--------|-----------|-------|
| Contact opt-out | `contacts.email_opt_out = true` | Honored by the CRM direct-send path |
| Contact email status | `contacts.email_status` is **not null** | The send worker suppresses on **any** non-null status; values like `bounced` / `invalid` / `unsubscribed` / `recipient_blocked` / `spam_report` |
| Blacklist | Present in `newsletter_blacklist` | Usually from SendGrid 硬退信s / invalid emails / blocks |
| Global unsubscribe | Present in `newsletter_unsubscribes` | Global block; includes SendGrid unsubscribes and spam reports |
| Subscriber unsubscribed | `newsletter_subscribers.unsubscribed_at` is **not null** | A newsletter subscriber unsubscribed themselves |

Matching rules:

- "Contact opt-out" and "Contact email status" match the contact `email` or `second email`, and count **only non-deleted** contacts (`deleted_at IS NULL`).
- Blacklist / global unsubscribe / subscriber unsubscribe match the email column exactly (case-insensitive).

---

## Relationship to the daily SendGrid suppression import (cron)

Several of the sources this page reads are **backfilled daily** by the scheduled job `POST/GET /api/sendgrid/import-suppressions`:

- Schedule: the `vercel.json` cron `0 19 * * *` (19:00 UTC, roughly 03:00 the next day in Taipei).
- What it does: paginates SendGrid's last-90-days suppression lists (five kinds) and writes them back into this system:

| SendGrid list | Sets `contacts.email_status` | Also writes | Interaction log |
|---------------|------------------------------|-------------|-----------------|
| Hard bounces | `bounced` | Non-CRM addresses → blacklist | "SendGrid 硬退信" |
| Invalid emails | `invalid` | Non-CRM addresses → blacklist | "SendGrid 無效信箱" |
| Unsubscribes | `unsubscribed` | Global unsubscribe (source `sendgrid_import`) | "SendGrid 已退訂" |
| Blocks | `recipient_blocked` | Non-CRM addresses → blacklist | "SendGrid 被擋下" |
| Spam reports | `spam_report` | Global unsubscribe (source `sendgrid_spam_report`) | "SendGrid 垃圾信檢舉" |

- Contacts already in the CRM only get their `email_status` updated (no duplicate blacklist entry); only non-CRM addresses go to the blacklist.
- Matched CRM contacts get a system interaction log added (not duplicated for the same type).
- It can also be triggered manually by a super_admin (the import button on the newsletter lists page). The cron run records a heartbeat, visible on the [System Health](health.md) page.

> In one line: **this page is only a viewer**; the thing that actually feeds SendGrid's bounces / unsubscribes / complaints into "Contact email status / blacklist / global unsubscribe" is this daily cron.

---

## Who can use it

- Only `super_admin` can open this page.
- The backend API `/api/admin/suppressions` re-verifies permission: 401 if not signed in, 403 if not super_admin.

---

## How to use it

1. **Check a single address**: enter a full email (an invalid format prompts an error) → click "Check" → read the verdict card and per-source status table.
2. **Review overall state**: leave the box empty for the default view → per-source totals + the most recent 50 suppression records.

---

## Columns

### Per-source status table (single-address lookup)

| Column | Description |
|--------|-------------|
| Source | One of the five sources above |
| Status | "Suppressed" (red) or "Clear" (green) |
| Detail | Extra info for that source (e.g. status value, unsubscribe reason, unsubscribe time) |

### Recently suppressed (default view)

| Column | Description |
|--------|-------------|
| Email | The suppressed address |
| Source | The suppression source |
| Detail | Extra info |
| Time | When the suppression happened (newest first) |

---

## Notes

- This page is super_admin only, and the backend API also re-verifies permission.
- Read-only view — to lift a suppression, handle it at its source (e.g. the contact's email status, [Email Recovery](email-recovery.md), or unsubscribe-list maintenance).
- The same verdict logic is also used to exclude recipients in the newsletter / bulk-send flow.
