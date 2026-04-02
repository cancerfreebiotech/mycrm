---
title: Notes & Interaction Logs
parent: Features
nav_order: 4
---

# Notes & Interaction Logs

---

## Note Search

Path: `/notes`

Search all interaction records, supporting:
- **Keyword**: Matches record content
- **Date range**: Start date / End date
- **Type filter**: Note / Meeting / Email / System
- **Pagination**: 20 per page

---

## Unassigned Notes

Path: `/unassigned-notes`

Displays interaction records not yet linked to any contact (`contact_id = null`), for example:
- Automatically created when `/note` is used in the Bot but no contact is found
- Manually recorded memos awaiting classification

Actions available for each entry:
- **Assign Contact**: Search and link to an existing contact
- **Delete**: Delete the record

---

## Interaction Record Types

| Type | Description | How to Create |
|------|-------------|---------------|
| `note` | Text note | Bot `/note`, Web manual |
| `meeting` | Meeting record | Bot `/note` (specify type=meeting) |
| `email` | Email record | Bot `/email`, Web send email feature |
| `system` | System auto-record | System operations (e.g. business card upload) |

---

## Creating Notes from the Bot

```
/note John Smith    → Search contact → Select → Enter note content
/n @John Smith Visited today, interested in collaboration   → Quick format (name can be omitted if the last contact is known)
```

If no matching contact is found, the note is saved as unassigned and can be classified later from the Web.
