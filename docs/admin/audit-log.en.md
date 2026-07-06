---
title: Audit Log
parent: Admin
nav_order: 18
---

# Audit Log

Path: `/admin/audit-log` (`super_admin` only; added in v7.4.0)

---

## What this page does

Review the audit log of "sensitive / privileged actions" in the system (e.g. role changes, deletions) for later investigation. Data comes from the `admin_actions` table, 20 per page with prev/next paging, with filtering by actor / action / date and CSV export; "Refresh" at the top right reloads it.

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

## Filtering & export

The filter bar at the top narrows results; any change applies immediately:

| Filter | Description |
|------|------|
| Actor | Search the actor by email keyword |
| Action | Dropdown covering all 19 privileged actions (see below) |
| From / To date | Filtered by the **Taipei time zone** day boundary |

- "Clear filters" appears whenever a filter is applied.
- "Export CSV" exports the current filtered result (up to 5,000 rows, with a UTF-8 BOM so Excel opens CJK correctly).

### Filterable actions

Since v7.9.5, all 19 privileged actions carry readable labels that map one-to-one to their backend write points: Reset MFA, Set Telegram ID, Maintenance toggle, Permanent delete contact, Bulk permanent delete, Create MCP token, Revoke MCP token, Apply email recovery, Hunter config change, Set webhook, Send release notification, Merge contacts, DSAR data lookup, Set account status, Send newsletter, GDPR data export, Set role, Set feature access, Organization settings change.

---

## Notes

- This page is super_admin only, and the backend API also re-verifies permission.
- This is a read-only log; records cannot be edited or deleted here.
