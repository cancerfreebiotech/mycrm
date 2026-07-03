---
title: Trash
parent: Admin
nav_order: 11
---

# Trash

Path: `/admin/trash`

Access: effectively `super_admin` only. Besides the "Trash" (`trash`) PermissionGate, this page has a built-in super_admin check; even a regular member granted "Trash" who opens it will see "No permission to access this page".

---

## What this page does

Deleted contacts don't vanish immediately — they move to Trash first, where they can be **restored** or **permanently deleted** by a super_admin.

The list is a table: checkbox, name (click for details), company, deleted by, deleted at. A warning banner at the top shows how many items are currently in Trash.

---

## Actions

| Action | Behavior |
|--------|----------|
| Restore | Move the contact back to the main list (requires confirmation). |
| Permanent delete | Permanently remove a single contact (requires confirmation). |
| Delete selected | Select multiple rows, then permanently delete them in batch. |
| Delete all | Permanently delete every contact in Trash at once (requires confirmation). |

Click a name to open a detail dialog showing full fields, tags, card images, and recent interaction logs (up to 10); you can also restore or permanently delete directly from the dialog.

---

## Notes

- **Permanent deletion is irreversible** — all destructive actions require a second confirmation.
- Card images live in a private bucket; the detail dialog shows short-lived signed URLs.
