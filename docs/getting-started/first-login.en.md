---
title: First Login
parent: Getting Started
nav_order: 1
---

# First Login

## Login Method

myCRM uses **Microsoft Account (Azure AD) Single Sign-On**, restricted to the `@cancerfree.io` domain.

1. Go to [https://mycrm-vert.vercel.app](https://mycrm-vert.vercel.app)
2. Click "Sign in with Microsoft Account"
3. Enter your company Email and password
4. Approve the application authorization

> After your first login, the system automatically creates your account in the `users` table (role defaults to `member`).

---

## Linking Telegram

To use Telegram Bot features (business card scanning, task management), you need to link your Telegram account first:

1. Search for **`@userinfobot`** on Telegram, send any message to get your Telegram ID (a number, e.g. `123456789`)
2. Log in to myCRM → top-right corner → **Personal Settings** → enter your Telegram ID and save
3. Search for **`@CF_CRMBot`** (CancerFreeCRM) on Telegram and start a conversation

> After linking, send `/help` to see all available commands.

---

## Linking Microsoft Teams Bot

To receive task notifications and mark tasks complete directly in Teams, complete the linking once:

1. Search for the Bot name in Microsoft Teams (provided by your administrator)
2. Open a **1-on-1 chat**
3. Send any message (e.g. `help`)
4. The Bot automatically resolves your AAD account and links it to your CRM account

When linking is successful, the Bot replies:
```
📋 myCRM Bot (Linked: your.email@cancerfree.io)
Task notifications will be sent here automatically.
```

> Linking only needs to be done once. After that, you will automatically receive Teams notification cards when tasks are assigned to you.

---

## Language Settings

myCRM supports three languages: **Traditional Chinese**, **English**, **Japanese**

How to switch (either method works):
- Click the 🌐 icon in the top-right corner of the Header → select language
- **Personal Settings** → Language selection section

Your language preference is saved to your account and applied automatically on next login.

---

## Interface Overview

**Member Sidebar:**
```
┌─────────────────────────────────────────────┐
│  myCRM         🌐  🌓  Username  Logout      │ ← Header
├──────────┬──────────────────────────────────┤
│          │                                  │
│ 🏠 Home  │                                  │
│ 👥 Contacts│         Main Content           │
│ 🔍 Notes │                                  │
│ ✅ Tasks │                                  │
│ ⚙️ Settings│                                │
│ 📖 Docs  │                                  │
│          │                                  │
│ v1.x     │                                  │ ← Version (bottom-left)
└──────────┴──────────────────────────────────┘
```

**Super Admin Additional Items:**
```
│ 🏷️ Tag Management       │
│ 📝 Unassigned Notes     │
│ 📧 Email Templates      │
│ 🤖 AI Models            │
│ 👤 User Management      │
│ 📊 Reports              │
```

---

## Role Descriptions

| Role | Description |
|------|-------------|
| `member` | General user; can access Home, Contacts, Notes, Tasks, Settings, Documentation |
| `super_admin` | Additional access: Tag Management, Unassigned Notes, Email Templates, AI Models, User Management, Reports |

Roles are set by a super_admin on the User Management page.
