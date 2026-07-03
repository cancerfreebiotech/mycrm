---
title: Feedback Management
parent: Admin
nav_order: 14
---

# Feedback Management

Path: `/admin/feedback` (`super_admin` only; the sidebar shows it only to super_admin)

---

## What this page does

Review and handle the suggestions and bug reports users submit through "Feedback", and update the handling status. The total count is shown next to the title, and the list is ordered newest first by submission time.

---

## What the list shows

Each item is a card:

- **Type** badge: Bug (red) or Feature request (purple).
- Title, submitter, submission date.
- **Status** badge: Open / In progress / Done / Won't fix.

Click a card to expand it and see the full description, plus any screenshot the submitter attached (if present; screenshots live in a private bucket and are shown via a signed URL).

---

## Updating status

At the bottom of the expanded card, click a status button to switch to: Open, In progress, Done, or Won't fix. The current status's button is marked selected and cannot be clicked again.

---

## Notes

- This page is super_admin only.
- Status changes are saved immediately; if a save fails an error message is shown.
