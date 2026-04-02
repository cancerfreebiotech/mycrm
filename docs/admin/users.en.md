---
title: User Management
parent: Admin
nav_order: 1
---

# User Management

Path: `/admin/users` (visible to super_admin only)

---

## User List

Displays all members who have logged into the system, with the following columns:

| Column | Description |
|--------|-------------|
| Display Name | Name set by the user |
| Email | Microsoft account (primary key) |
| Role | member / super_admin |
| Telegram ID | Linked Telegram account |
| AI Model | AI model in personal use |
| Joined | Time of first login |

---

## Role Management

Click the role button in the user list to toggle:

- `member` → General user
- `super_admin` → Can access admin features

> Note: At least one super_admin must be retained to prevent all administrators from being demoted.

---

## Notes

- User accounts are **automatically created on first login**; they cannot be pre-created manually
- Only Microsoft accounts in the `@cancerfree.io` domain can log in
- To delete a user: currently requires direct operation on the DB via the Supabase Dashboard
