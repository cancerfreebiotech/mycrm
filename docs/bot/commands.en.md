---
title: Command List
parent: Bot Guide
nav_order: 2
---

# Bot Command List

| Command | Alias | Description |
|---------|-------|-------------|
| `/help` | `/h` | Show all available commands |
| `/lang [zh\|en\|ja]` | — | Switch the Bot reply language (Chinese / English / Japanese) |
| `/search [keyword]` | `/s` | Search contacts (fuzzy match on name/Email) |
| `/note [name]` | `/n` | Add an interaction note for a contact |
| `/visit [name] [content]` | `/v` | Add a visit record for a contact; with content, AI logs it in one line |
| `/a [name]` | — | Add a business card photo (OCR) for a contact; creates new contact if not found |
| `/p [name]` | — | Add a group photo for a contact |
| `/li` | `/linkedin` | Send a LinkedIn profile screenshot; AI parses it into a contact |
| `/news` | — | Accumulate newsletter material (requires `newsletter` permission) |
| `/b [description]` | `/batch` | Enter batch mode: shoot many cards in a row, OCR runs in background; add a description of where you met to tag the whole batch |
| `/done` | — | End batch mode and queue OCR |
| `/cancel` | — | Abort current mode |
| `/met [count] [description]` | — | Bulk-tag "where met / date / referrer" on your most recently created contacts |
| `/email [keyword]` | `/e` | Send Email from contact details |
| `/work [description]` | `/w` | AI parses natural language to create a task |
| `/tasks` | `/t` | List your pending tasks |
| `/meet [meeting info]` | `/m` | AI parses natural language to schedule a meeting and write it to your calendar |
| `/user` | `/u` | List all organization members |
| `/ai [question]` | — | AI agent Q&A over your CRM in plain language; bare `/ai` shows the current AI model |
| `/stop` | — | (Super Admin) Enable maintenance mode; type `/stop off` to disable |

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

**Method 3: One-shot (name followed by content)**
```
/v Dr. Wang Discussed collaboration in Taipei yesterday, met at 3pm
→ Bot: 🤖 AI parsing...
→ Bot: ✅ Visit logged (Dr. Wang)
        📅 2026-06-25 15:00  📍 Taipei
```

Put a sentence after the name and AI (Gemini) parses the **date / time / location** from it and decides whether it is a note or a meeting, then writes the interaction log directly — no step-by-step entry needed. The name may be several words (e.g. an English full name like John Smith); the system works out where the name ends and the content begins, so the rest of the name is not mistaken for the content. Depending on the search results:
- **1 match** → logged immediately with a confirmation.
- **Multiple** same-name matches → shows buttons to pick the person; logged only after you choose (the content is held).
- **No match** → tells you the contact was not found and falls back to the step-by-step flow above.

Typing just `/v` or `/v name` (no content) behaves the same as Method 1 and Method 2, unchanged.

---

### `/a` — Add Business Card for Contact

Used to add or replace a business card photo for a contact. After sending, AI OCR recognizes it and shows the differences from existing data, letting the user confirm whether to update. If the contact doesn't exist, a new one can be created.

**Method 1: Use last contact**
```
/a
→ Bot: Last contact: John Smith, please send a business card photo  [⏭ Skip, no card needed]
→ Send photo
→ AI OCR → Show diff → Confirm/Cancel
```

**Method 2: Specify by name**
```
/a John Smith
→ Bot: Found, please send business card photo  [⏭ Skip, no card needed]
```

**Method 3: Name + company (create if not found)**
```
/a John Smith | ABC Corp
→ Bot: Contact "John Smith" not found. Create new contact?
   [✅ Create "John Smith · ABC Corp"]  [❌ Cancel]
→ After creation: please send business card photo  [⏭ Skip, no card needed]
```

Press "⏭ Skip, no card needed" to skip the card photo and complete contact creation.

---

### `/news` — Accumulate Newsletter Material

Accumulate newsletter content throughout the month. At month-end, an admin runs "AI Compose" to generate 3 draft campaigns in one click. Requires the `newsletter` feature permission.

```
/news
→ Bot: "Current period 2026-05. Which section?"
   [📜 Last Month]  [🔮 Next Month]
→ Pick section → Bot: "Story title?"
→ Type: AACR Taiwan Night
→ Bot: "Event date? YYYY-MM-DD or 'skip'"
→ Type: 2026-04-29
→ Bot: "Paste content (text + photos). /done when finished"
→ Paste photos, paste text (multiple times OK)
→ /done
→ Bot: ✅ Saved to 2026-05 Last Month
```

Organization page at `/admin/newsletter/draft/{period}` — multi-user accumulation, edit, reorder, AI compose.

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

### `/li` / `/linkedin` — Create Contact from LinkedIn Screenshot

```
/li or /linkedin
→ Bot: Please send a LinkedIn profile screenshot
→ Send screenshot
→ AI parses name / job title / company / Email / LinkedIn URL
→ ✅ Confirm add / ❌ Cancel
```

If the image cannot be recognized as a LinkedIn screenshot, the Bot prompts you to resend.

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

### `/meet` / `/m` — Schedule a Meeting (AI Natural Language Parsing)

Schedule a meeting in natural language. The Bot uses AI to parse the time, attendees, and location, then replies with a confirmation card; the event is only written to your Outlook / Teams calendar after you press "Confirm".

```
/meet Product meeting with Luna tomorrow at 3pm
/m Visit Kyushu University lab on 3/25 at 1pm
→ Bot: ⏳ AI parsing...
→ Bot: [Confirmation card]
        📅 Product meeting
        🕐 3/25 (Tue) 13:00 – 14:00 (Taipei)
        👤 You, Luna
        [Confirm]  [Cancel]
→ Press "Confirm" → Bot: ✅ Event created! (with calendar link)
```

- Attendees are matched against the organization member list by name / Email.
- Creating an event requires that you have completed Microsoft login authorization on the myCRM website.
- Press "Cancel" to not create the event.

---

### `/met` — Bulk-Tag "Where Met"

Add "where met / date / referrer" to your N most recently created contacts at once. Handy right after scanning a stack of cards with `/b`, to tag the whole batch's source in one go.

Format: `/met [count] [description]` (count capped at 20)

```
/met 5 Met at BioJapan in Tokyo last week, introduced by Luna
→ Bot: 🤖 Parsing...
→ Bot: Found your 5 most recent contacts, will tag:
        📍 BioJapan  📅 2026-06-25  🤝 Referrer Luna
        1. John Smith (ABC Corp)
        ...
        [Confirm]  [Cancel]
→ Press "Confirm" → the whole batch gets the "where met" info
```

AI parses "where met / date / referrer" from the description and applies it to the N most recent contacts. Press "Cancel" to make no changes.

---

### `/user` — List Organization Members

Shows all members' names, Emails, and Telegram IDs (available to all members).

---

### `/lang` — Switch Bot Language

```
/lang zh   → 繁體中文
/lang en   → English
/lang ja   → 日本語
```

Only affects the Bot's reply language; the setting is saved to your account.

---

### `/ai` — AI Agent Q&A

`/ai <question>` asks in plain language; the AI agent queries or maintains your CRM data and answers — the same assistant as the web [AI Assistant](../features/ai-assistant.md), right inside Telegram.

```
/ai Which contacts are at NTU?
/ai Mark Chen Xiaoming as important
/ai I'm meeting Mr. Wang next week — help me get up to speed on him
```

- Capabilities and write-safety match the web AI Assistant: look up / update contacts, add notes, tags, newsletter lists, and schedule a pre-meeting briefing. Everything runs as **you** and is audited.
- Up to 6 consecutive rounds of tool operations per request; if the AI Assistant is disabled, it replies that the assistant is off.
- Bare `/ai` (no question) keeps the old behavior: it shows the name and source of the AI model you are currently using; when unset, the system default model (gemini-2.5-flash) is used.

---

### `/stop` — Maintenance Mode (Super Admin only)

`/stop` enables maintenance mode and all users see a maintenance notice; `/stop off` disables it and returns to normal. Available to Super Admin only.

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

### When an Existing Contact Is Detected (same email)

The Bot shows two extra buttons:

| Button | Behavior | When to use |
|---|---|---|
| 📌 Add to "X" | **Keep old data**: fill empty fields with new values; write conflicting fields to the interaction log (no overwrite) | Same company, met again, add a new card to an existing contact |
| 🔄 Update "X" (job change) | **Overwrite with new data**: write new values to conflicting fields, **write old values to the interaction log for history** | The person changed job / company and you want the latest info |
| ✅ Save as new anyway | Force-create (two separate contacts) | Same name, different person |
| ❌ Discard | Cancel | Shot by mistake / not needed |

---

## Batch Photos (`/b` + `/done`)

Best when you have many cards to process at once (just back from a meeting, a stack of cards). The flow differs from single-card synchronous OCR: **the Bot accepts each photo immediately and does not OCR on the spot**, so you can shoot many in a row without waiting; it notifies you once background OCR finishes, and you review them together under "Pending Cards" (`/contacts/pending`) on the web.

```
/b
→ Bot: 📦 Entered batch mode
[shot #1] → Bot: 📥 Received card 1
[shot #2] → Bot: 📥 Received card 2
...
/done
→ Bot: ✅ N cards queued for OCR, you'll be notified when done
(recognizing in background…)
→ Bot: ✅ Recognized N/M cards, go review → /contacts/pending
```

**Batch with description (`/b description`)**: append a sentence describing where you met these people after `/b`, and AI parses "where met / date / referrer" and applies it automatically to **every** card in the batch, saving you from filling each one in.

```
/b Met at BioJapan in Tokyo last week
→ Bot: 🤖 Parsing "where met"...
→ Bot: 📦 Entered batch mode (this batch will be auto-tagged: 📍 BioJapan / 📅 2026-06-25)
[shot #1] → Bot: 📥 Received card 1
...
/done
```

To exit midway: `/cancel`. Photos already received are **not deleted** — they stay in the pending area and can be confirmed or deleted on the web.

Cards that fail recognition (no name detected) are automatically moved to "My Failed Scans" (`/contacts/failed-scans`), where you can view the original image or delete it; to retry, take and upload the photo again.
