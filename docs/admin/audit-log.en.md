---
title: Audit Log
parent: Admin
nav_order: 18
---

# Audit Log

Path: `/admin/audit-log` (`super_admin` only; added in v7.4.0)

---

## What this page does

Review the audit log of "sensitive / privileged actions" in the system (e.g. role changes, deletions) for later investigation. Data comes from the `admin_actions` table, 20 per page with prev/next paging; "Refresh" at the top right reloads it.

---

## Table columns

| Column | Description |
|--------|-------------|
| Time | When the action occurred (Taipei time zone) |
| Actor | The email of who performed it |
| Action | The action type (translated to a readable label) |
| Target | The target acted on (e.g. a contact or user ID) |
| Detail | Extra data; click "Expand" to view as JSON |

---

## Notes

- This page is super_admin only, and the backend API also re-verifies permission.
- This is a read-only log; records cannot be edited or deleted here.
