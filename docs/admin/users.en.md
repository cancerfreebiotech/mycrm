---
title: User Management
parent: Admin
nav_order: 1
---

# User Management

Path: `/admin/users`

Access: `super_admin`, or a regular member who has been granted the "User Management" feature. Granted members can only **reset MFA** and **edit Telegram IDs** — they cannot change roles, adjust feature grants, or toggle maintenance mode.

---

## User List

Displays all members who have logged into the system. Every column header is sortable:

| Column | Description |
|--------|-------------|
| Name | The user's display name |
| Email | Microsoft account (primary key) |
| Telegram | Linked Telegram ID; editable inline |
| Teams | Whether Microsoft Teams is linked |
| Role | member / super_admin |
| Last Login | Time of the most recent login |
| MFA | Whether multi-factor authentication is set up |

On mobile the same information is shown as cards.

---

## Role Management

> Super_admin only.

Click a member's "Promote to Super Admin" / "Demote to Member" button to switch their role.

- `member` → General user
- `super_admin` → Can access all admin features

> You cannot change your own role, and at least one super_admin must be retained to prevent all administrators from being demoted.

---

## Account Suspension / Offboarding

> Super_admin only.

Next to each member's role badge, an account-status badge shows **Active** (green) or **Suspended** (red).

Click a member's "Suspend" button to suspend their account (requires confirmation); a suspended member can be restored with "Reactivate".

- Suspension **takes effect immediately** (v7.9.5): on their next action (navigating to another page or any operation) the member is signed out and redirected to the login page — no need to wait for the next login or for the session to expire.
- The **Super Admin (`pohan.chen@cancerfree.io`) cannot be suspended**.

---

## Feature Grants

> Super_admin only, and shown only for member accounts.

A member's row shows a set of feature permission chips; click one to grant or revoke it. Granted items show a ✓. Grantable features include: Tags, Email Templates, Prompts, Countries, Newsletter, Failed Scan Review, Duplicate Contacts, Card Import, Trash, User Management, plus Unassigned Notes, Export Contacts, and Bulk Email.

Granted members will see the corresponding items in the sidebar.

---

## MFA Status and Reset

The MFA column shows whether a member has completed multi-factor authentication (Set / Not set).

If a member has set up any authenticator, a "Reset" button appears on their row. Clicking it requires confirmation; a reset deletes all of that member's existing MFA authenticators, and the member **must set up MFA again on their next login**.

Both super_admin and members granted "User Management" can perform this action.

---

## Editing Telegram IDs

Click the ✏️ in the Telegram column to edit inline, enter a number, and save:

- Must be a positive integer, otherwise it is rejected.
- If fewer than 9 digits (typical Telegram IDs are 9–10 digits), a warning appears and you must confirm before saving.
- Clearing the field and saving removes the binding.

Both super_admin and members granted "User Management" can perform this action.

---

## Teams Binding

The Teams column only displays the binding status (Connected / Not set) and is read-only. Binding is created when the member links their account through Teams.

---

## Maintenance Mode

> Super_admin only.

A maintenance-mode toggle is provided at the top of the page. When enabled, regular users are redirected to a maintenance page and only super_admin can continue using the system; enabling it requires confirmation.

---

## Notes

- User accounts are **automatically created on first login**; they cannot be pre-created manually
- Only Microsoft accounts in the `@cancerfree.io` domain can log in
- To delete a user: currently requires direct operation on the DB via the Supabase Dashboard
