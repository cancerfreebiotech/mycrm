---
title: Dashboard
parent: Features
nav_order: 1
---

# Dashboard

Path: `/` (default page after login)

---

## Statistics Cards

The top of the dashboard shows three real-time statistics:

| Card | Description |
|------|-------------|
| **Total Contacts** | Total number of contacts in the system |
| **Added This Month** | Number of contacts added this month (from the 1st) |
| **Unassigned Notes** | Number of interaction records not yet linked to a contact (click to go to the management page) |

---

## Tag Distribution Chart

A bar chart showing the number of contacts under each Tag, sorted from most to fewest.

> This section only appears after Tags have been created.

---

## Pending Unassigned Notes

Lists the 5 most recent unassigned notes (interaction records where `contact_id` is null). Each entry shows:
- Record type (Note / Meeting / Email / System)
- Creator's name
- Creation time
- **Assign Contact** button → opens a search popup to assign the note immediately

Click "View All" to go to the full [Unassigned Notes page](notes.md).
