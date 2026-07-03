---
title: Country Management
parent: Admin
nav_order: 8
---

# Country Management

Path: `/admin/countries`

Access: `super_admin`, or a member granted the "Country Management" (`countries`) feature.

---

## What this page does

Maintains the list of countries available in the system, used when setting a contact's country. Shown as a table with columns: ISO code, flag emoji, Chinese name, English name, Japanese name, status. Click a header to sort by code / Chinese name / English name.

---

## Adding a country

Click "Add country" at the top right to open the form:

- **Code**: a two-letter ISO 3166-1 code (auto-uppercased, letters only). For common codes (e.g. TW, JP, US) the Chinese/English/Japanese names and flag are **auto-filled**, and you can still edit them.
- **Chinese name** and **English name** are required; Japanese name and flag emoji are optional.

---

## Editing and status

- **Edit**: click the pencil icon on a row to change names and flag; the code cannot be changed after creation.
- **Enable / disable**: click the status badge to toggle. A disabled country won't appear in menus, but its data is kept.
- **Delete**: click the trash icon and confirm inline to delete.

---

## Notes

- The code must be two uppercase letters, otherwise it is rejected with a format error.
- Names have three language fields; fill all three so they display correctly across the localized interfaces.
