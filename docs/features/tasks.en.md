---
title: Task Management
parent: Features
nav_order: 3
---

# Task Management

Path: `/tasks`

Task management supports two methods: the **Web interface** and **Telegram Bot commands**.

---

## Task Statuses

| Status | Description |
|--------|-------------|
| `pending` | Pending (default) |
| `done` | Completed |
| `postponed` | Postponed |
| `cancelled` | Cancelled |

---

## Web Interface

### Three Tabs

| Tab | Content |
|-----|---------|
| **My Reminders** | Tasks I created with no assignees (self-reminders) |
| **Assigned by Me** | Tasks I created that were assigned to others |
| **Assigned to Me** | Tasks assigned to me by others |

### Search

The top search box supports searching by task title keyword.

### Add Task

Click "+ Add Task" and fill in:
- **Task Title** (required)
- **Description** (optional)
- **Due Date** (optional)
- **Assign To**: Check one or more members (leave empty for a self-reminder)

### Actions

Each task has action buttons on the right:

| Button | Action | Available for |
|--------|--------|---------------|
| ✏️ | Edit task | All statuses |
| 🗑 | Delete task | All statuses |
| ✅ Complete | Mark as done | `pending` only |
| ⏭ Postpone | Open popup to enter new due date; status changes to postponed | `pending` only |
| ❌ Cancel | Mark as cancelled | `pending` only |

> **Assistant acting on behalf**: If a manager has set up assistants (see [Personal Settings](settings.md)), assistants can also mark the manager's tasks as complete; the `completed_by` field records the actual operator.

---

## Creating Tasks via Telegram Bot

Use the `/work` or `/w` command and describe the task in **natural language**:

```
/work Please have John compile the Q1 sales report by next Friday
/work Remind myself to send a proposal to Alice tomorrow morning
/w Please have Bob and Carol complete the client visit list by end of month
```

The Bot uses Gemini AI to parse:
- **Task title**
- **Due date** (supports "tomorrow", "next Friday", "end of month", etc.)
- **Assignee** (matched against the member list)

After parsing:
1. The task is automatically created
2. A Telegram notification is sent to the assigned members

---

## Viewing Tasks via Telegram Bot

Use the `/tasks` or `/t` command to list your pending tasks (created by me + assigned to me).

Each task has three quick buttons:
- **✅ Complete** — Mark as complete immediately
- **⏭ Postpone** — Enter new due date
- **❌ Cancel** — Cancel the task

---

## Teams Bot Notifications

If [Teams Bot](../deployment/teams-setup.md) is configured, an **Adaptive Card** is sent to your Teams personal chat when a new task is created, containing:
- Task title and due date
- **"Mark Complete"** button (click directly in Teams to complete)
- **"Go to Task Management"** link

---

## Due Date Reminders

Every day at **09:00 (Asia/Taipei)**, a scheduled job (Vercel Cron `task-reminders`) sends a single Telegram "Today's Task Digest" containing:
- 🔴 **Overdue** tasks (`due_at` has passed and not yet done)
- 🟡 Tasks **due today**

The digest is only sent to members who have linked Telegram; anyone with no overdue or due-today tasks receives no message (an empty digest is silence, so no opt-out is needed).

Each member receives their **own** tasks, with recipients determined by:
- Assignees always receive their tasks
- The task creator is included only for self-reminders (tasks with no assignees); a creator who assigned the task to others is not additionally reminded
