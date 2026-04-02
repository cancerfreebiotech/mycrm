---
title: Command List
parent: Bot Guide
nav_order: 2
---

# Bot Command List

| Command | Alias | Description |
|---------|-------|-------------|
| `/help` | `/h` | Show all available commands |
| `/search [keyword]` | `/s` | Search contacts (fuzzy match on name/Email) |
| `/note [name]` | `/n` | Add an interaction note for a contact |
| `/visit [name]` | `/v` | Add a visit record for a contact |
| `/a [name]` | — | Add a business card photo (OCR) for a contact |
| `/p [name]` | — | Add a group photo for a contact |
| `/email [keyword]` | `/e` | Send Email from contact details |
| `/work [description]` | `/w` | AI parses natural language to create a task |
| `/tasks` | `/t` | List your pending tasks |
| `/user` | `/u` | List all organization members |

---

## Command Details

### `/search` — Search Contacts

```
/search John Smith
/s Smith
/s cancerfree
```

Each search result shows a business card photo with quick buttons:
- **📋 Interaction Log** — View the latest 5 entries, with "Load More" support
- **✉️ Send Email** — Jump to the Email sending flow
- **📝 Note** — Jump to the note-recording flow

---

### `/note` / `/n` — Add Interaction Note

**Method 1: Interactive**
```
/note or /n
→ Bot: For the last contact? (if applicable)
→ Select or enter name to search
→ Bot: Please enter note content
→ Enter: Visited today, interested in collaboration
```

**Method 2: Quick search with name**
```
/n John Smith
→ Bot: Found, proceed directly to note entry
```

**Contact not found**: The note is automatically saved as unclassified; it can be assigned from the Web later.

**Omitting name**: If you recently interacted with a contact, you can omit the name and the Bot will prompt "For [Name]?"

---

### `/visit` / `/v` — Add Visit Record

**Method 1: Interactive**
```
/visit or /v
→ Bot: Add a visit record for the last contact? (if applicable)
→ Select or enter name to search
→ Bot: Enter visit date and time (e.g. 2026-03-29 14:00), or type "skip"
→ Bot: Enter visit location, or type "skip"
→ Bot: Enter visit content
```

**Method 2: Quick search with name**
```
/v John Smith
→ Bot: Found, proceed directly to date/time entry
```

---

### `/a` — Add Business Card for Contact

Used when a contact already exists and you want to add or replace a business card photo. After sending, AI OCR recognizes it and shows the differences from existing data, letting the user confirm whether to update.

**Method 1: Use last contact**
```
/a
→ Bot: Last contact: John Smith, please send a business card photo
→ Send photo
→ AI OCR → Show diff → Confirm/Cancel
```

**Method 2: Specify by name**
```
/a John Smith
→ Bot: Found, please send business card photo
```

---

### `/p` — Add Group Photo for Contact

**Method 1: Use last contact**
```
/p
→ Bot: Last contact: John Smith, please send group photo
→ Send photo (recommended: long-press → send as file to preserve timestamp and GPS location)
```

**Method 2: Specify by name**
```
/p John Smith
→ Bot: Found, please send group photo
```

---

### `/email` — Send Email

```
/email
→ Search contact → Select
→ Choose method: Template / AI-generated
→ Confirm content → Send
```

Emails are sent via your Microsoft mailbox (requires Microsoft Graph API authorization).

---

### `/work` — Create Task (AI Natural Language Parsing)

```
/work Please have John compile the Q1 sales report by next Friday
/w Remind myself to call John Smith tomorrow morning
/w Please have Alice and Bob complete the client list by end of month
```

AI (Gemini) parses:
- **Title**: Main task content
- **Due date**: Natural language like "tomorrow", "next Friday", "end of month"
- **Assignee**: Matched against the system member list by name

---

### `/tasks` — View Pending Tasks

Lists all your `pending` tasks (created by me + assigned to me).

Each task has buttons:
- **✅ Complete** — Mark as done
- **⏭ Postpone** — Enter new due date
- **❌ Cancel** — Cancel the task

---

### `/user` — List Organization Members

Shows all members' names, Emails, and Telegram IDs (available to all members).

---

## Sending a Business Card (No Command Needed)

Send a photo directly in the Bot conversation:

```
[Send photo]
→ Bot: Recognizing...
→ Bot: Recognition result:
       Name: John Smith
       Company: ABC Corp
       ...
       Save?
→ ✅ Save / ❌ Discard
```

If the recognition result is incorrect, you can edit it in the Web after saving.
