---
title: Personal Settings
parent: Features
nav_order: 6
---

# Personal Settings

Path: `/settings`

---

## Profile

| Field | Description |
|-------|-------------|
| Display Name | Name displayed in the system |
| Email | Microsoft Email used for login (read-only) |
| Role | member / super_admin (read-only, set by admin) |
| Telegram ID | Used to link Telegram Bot |

---

## Appearance Settings

### Theme
- **Light Mode** ☀️
- **Dark Mode** 🌙

You can also quickly toggle using the ☀️/🌙 button in the top-right corner of the Header.

### Language
- Traditional Chinese
- English
- Japanese

---

## AI Model Selection

Choose your personal AI model (used for business card recognition, email generation, etc.):

1. First select an **AI Provider** (Endpoint)
2. Then select a **Model** under that provider

Available providers and models are maintained by super_admin on the [AI Model Management](../admin/models.md) page.

---

## My Assistants

Managers can set one or more **assistants**. Assistants can act on behalf of the manager to:
- Mark tasks as complete
- Operate tasks created by the manager

### Add an Assistant

1. Enter the assistant's Email in the "Add Assistant" field
2. Click "Add"

### Remove an Assistant

Click the 🗑 icon in the assistant list to remove them.

> Note: Assistants must be existing members in the system (already in the `users` table).
