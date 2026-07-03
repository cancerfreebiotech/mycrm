---
title: Shared-email Contacts
parent: Admin
nav_order: 13
---

# Shared-email Contacts

Path: `/admin/shared-emails`

Access: `super_admin`, or a member granted the "Bulk Email" (`bulk_email`) feature.

---

## What this page does

Finds cases where two or more contacts share the same email (e.g. couples, family, or shared inboxes), as a reference before bulk sending, to avoid sending to the same inbox twice.

The stats at the top show: number of shared groups and number of contacts involved. A search box above filters live by email, name, or company.

---

## What the list shows

A table with one shared email per row:

- **Email**: the shared inbox.
- **Count**: how many contacts use that email.
- **Contacts**: lists those contacts (name, company, title) with links to open the contact page.

This is a read-only informational page; merging and editing are not done here.

---

## Notes

- This only shows the current state; to merge duplicate people, use "Duplicate Contact Review" instead.
