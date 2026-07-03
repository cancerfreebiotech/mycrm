---
title: Teams Bot Overview
parent: Bot Guide
nav_order: 4
---

# Teams Bot Overview

The myCRM Teams Bot provides task notification and meeting scheduling functionality. When a task is assigned to you, you will receive an **Adaptive Card** notification in your Microsoft Teams personal chat; you can also schedule meetings with natural-language commands.

---

## Features

| Feature | Description |
|---------|-------------|
| Task Notifications | Push Adaptive Card in Teams when a new task is assigned |
| One-click Complete | Click "Mark Complete" directly in Teams without opening the Web |
| Task Link | Card includes a "Go to Task Management" link |
| Meeting Scheduling | `/meet`, `/m` schedule a meeting in natural language; a confirmation card writes it to your calendar in one click |
| AI Model | `/ai` shows the AI model you are currently using |
| `/help` Command | Type `help` in Teams chat to display instructions |

---

## Notification Card Example

```
┌────────────────────────────────────┐
│ ✅ Task Assignment Notification     │
│                                    │
│ 📌 Please compile Q1 sales report  │
│ ⏰ Due: 2026/03/31 18:00           │
│ 👤 Assigned by: Director Chen      │
│                                    │
│  [Mark Complete]  [Go to Tasks]    │
└────────────────────────────────────┘
```

After clicking "Mark Complete", the Bot updates the task status and replies with a confirmation message.

---

## Meeting Scheduling (`/meet`)

Schedule meetings in natural language in your chat with the Bot. The Bot uses AI to parse the time, attendees, and location, then replies with a confirmation card; only after you press "Confirm" is the event actually written to your Outlook / Teams calendar.

```
/meet Tomorrow 3pm product meeting with Luna
/m 3/25 1pm visit to Kyushu University lab
→ Bot: ⏳ AI parsing...
→ Bot: [confirmation card]
        📅 Product meeting
        🕐 3/25 (Tue) 13:00 – 14:00 (Taipei)
        👤 You, Luna
        [Confirm]  [Cancel]
→ Press "Confirm" → Bot: ✅ Event created! (with a calendar link)
```

- Attendees are matched against the organization member list by name / Email.
- Creating the event requires that you have completed Microsoft login authorization on the myCRM website.
- Pressing "Cancel" does not create the event.

---

## AI Model (`/ai`)

Type `/ai` in the chat and the Bot replies with the AI model you are currently using; when unset, the system default (gemini-2.5-flash) is used.

---

## Account Linking

The Bot uses an **auto-linking** mechanism — no manual steps are needed:

1. Search for the Bot name in Teams and open a **1-on-1 chat**
2. Send any message (e.g. `help`)
3. The Bot automatically resolves your AAD account via Microsoft Graph → matches CRM user → linking complete

After successful linking, the `help` command will show:
```
📋 myCRM Bot (Linked: your.email@company.com)
Task notifications will be sent here automatically.
```

> Linking requires your Teams account email and CRM login email to be the same (same Microsoft 365 account).

---

## Limitations

- The Teams Bot currently only supports **personal chat** notifications (does not support proactive Channel posts)
- Users must initiate a conversation with the Bot in Teams at least once before they can receive notifications
- For setup instructions, see [Teams Bot Setup](../deployment/teams-setup.md)
