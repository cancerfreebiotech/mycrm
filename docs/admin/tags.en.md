---
title: Tag Management
parent: Admin
nav_order: 2
---

# Tag Management

Path: `/admin/tags`

Access: `super_admin`, or a member who has been granted the "Tags" feature.

---

## Purpose of Tags

Tags are used to classify contacts, for example: "Prospect", "Partner", "Medical Center", etc.

A contact can have multiple tags, and the contact list supports filtering by tag.

---

## Tag List Columns

| Column | Description |
|--------|-------------|
| Tag Name | The tag name; a red "Blacklist" badge appears if it is marked as an Email blacklist |
| Contacts | The number of contacts currently using this tag |
| Created At | The date the tag was created |

---

## Adding a Tag

1. Enter the tag name in the input field
2. Click "Add"

> Tag names must be unique; a duplicate shows "This tag name already exists".

---

## Renaming a Tag

Click the ✏️ icon on a tag row to edit inline, then press Enter or ✓ to save (Esc to cancel).

---

## Email Blacklist

Click the shield icon on a tag row to toggle it as an Email blacklist.

Contacts carrying a blacklisted tag are automatically **excluded from email sends and newsletter list creation**. After toggling, a red "Blacklist" badge appears next to the tag name.

---

## Deleting a Tag

Click the 🗑 icon next to a tag and confirm to delete it.

> Note: Deleting a tag will also remove all associations between contacts and that tag. Please proceed with caution.

---

## Using Tags in the Contact List

1. Go to `/contacts`
2. Click the tag buttons at the top to filter
3. Multiple tags can be selected at the same time (OR logic)
