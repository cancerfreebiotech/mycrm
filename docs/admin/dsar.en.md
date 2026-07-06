---
title: Data Subject Lookup (DSAR)
parent: Admin
nav_order: 21
---

# Data Subject Lookup (DSAR)

Path: `/admin/dsar` (`super_admin` only)

---

## What this page does

Enter an email address and find every contact in the system tied to it, listing each one's **personal-data footprint** (interaction logs, cards, newsletter recipients). Use it to respond to a data subject's access / export / erasure request.

- Matches the contact `email` or `second email` by **exact match** (case-insensitive).
- **Includes deleted (Trash) contacts** — a data subject request must cover all records regardless of soft-deletion; deleted ones are flagged with a "Deleted" badge.
- Also shows the **deliverability verdict** for the address (whether it can be emailed, and why not), sharing the same logic as [Suppression & Consent](suppressions.md).
- Each contact can be opened ("View") or exported directly.

---

## GDPR context

A DSAR (Data Subject Access Request) is a right GDPR grants to individuals: a person can ask to know, obtain, or delete the personal data a company holds about them. This page lets a super_admin, on receiving such a request:

1. Use the email as an index to find **all** records tied to that person (including Trash) — the right of access.
2. Quantify the footprint and export the full personal-data JSON per contact — the right of access / data portability.
3. Confirm the address's current deliverability / suppression state — the right to object / erasure follow-up.

> For accountability, **every lookup is written to the audit log** (action `dsar_lookup`, shown as "DSAR data lookup" in the [Audit Log](audit-log.md)), with the queried email as the target.

---

## Who can use it

- Only `super_admin` can open this page.
- The backend API `/api/admin/dsar` **re-verifies permission**: 401 if not signed in, 403 if not super_admin (`/api/admin/*` is exempt from the auth middleware, so the route self-guards).

---

## How to use it

1. Enter a **full** email address in the search box (an invalid format prompts "Enter a valid email address").
2. Click "Search".
3. A deliverability card for the address appears at the top; all matching contacts and their footprints are listed below.
4. For each row you can:
   - **View** → open the contact page `/contacts/{id}`.
   - **Export** → download that contact's full personal-data JSON (see below).

When nothing matches, "No matching contacts" is shown; before searching, an input hint is shown.

---

## Result columns

| Column | Description |
|--------|-------------|
| Name | Contact name; soft-deleted ones carry a "Deleted" badge |
| Company | Contact company |
| Created by | The user who created this contact (display name) |
| Created | Contact creation date |
| Interactions | Count of the contact's `interaction_logs` |
| Cards | Count of the contact's `contact_cards` |
| Newsletter | Count of the contact's `newsletter_recipients` |

---

## Personal-data export (GDPR data export)

Each row's "Export" calls `/api/contacts/{id}/export`, returning a single JSON file (`contact-{id}-export.json`) that aggregates all of the contact's personal data:

- Contact record, cards, photos, interaction logs, tasks, newsletter recipients, email events.
- Card and photo **image bodies live in Storage**, so the export contains only URLs/paths, not the image bytes.

> Export permission is super_admin or the "Export contacts" feature grant; super_admin satisfies both. The export is likewise written to the [Audit Log](audit-log.md) (action: GDPR data export) and records the row counts per data type.

---

## Notes

- This page is super_admin only, and the backend API also re-verifies permission.
- This is a read-only lookup page — nothing is edited or deleted here; deletions are done in [Trash](trash.md) or on the contact page.
- For the full list of suppression sources and how the verdict is decided, see [Suppression & Consent](suppressions.md).
