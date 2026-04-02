---
title: Telegram Bot Overview
parent: Bot Guide
nav_order: 1
---

# Telegram Bot Overview

The myCRM Telegram Bot is the primary data input channel for the system, supporting:

| Feature | Command |
|---------|---------|
| Business card scanning (photo upload) | Send photo directly |
| Search contacts | `/search` |
| Add interaction note | `/note` |
| Send Email | `/email` |
| Add card back | `/add_back` |
| Create task | `/work` |
| View my tasks | `/tasks` |
| List org members | `/user` |
| Help | `/help` |

---

## Workflow (Business Card Scanning)

```
User sends business card photo
        ↓
Bot uploads image to Supabase Storage
        ↓
Calls Gemini AI to recognize all fields
        ↓
Bot displays recognition result, asks whether to save
        ↓
User selects:
  ✅ Save → writes to contacts table
  ❌ Discard → deletes image
```

---

## Multi-step Conversations

The Bot uses the `bot_sessions` table to manage multi-step conversation state (e.g., search contact → select → enter note content). Each user maintains their own conversation state independently.

---

## Consecutive Photo Protection

If the same user has more than **5** unconfirmed business cards pending, the Bot will refuse new photos and prompt the user to process existing pending items first.
