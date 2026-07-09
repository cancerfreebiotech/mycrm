This chapter covers everything a regular user can do in myCRM, from the web interface to the Telegram and Teams bots. Features that need special permissions (newsletter, bulk email, export, reports) are called out explicitly. Every page supports light/dark mode and three languages (繁中 / English / 日本語), switchable from the top-right.

## Dashboard

Path: `/` (the default page after login). The dashboard summarizes live data for your organization.

### Stat cards

Three live numbers at the top; click to jump:

| Card | Meaning |
|------|---------|
| Total contacts | Count of all contacts in the system |
| Added this month | Contacts created since the 1st of this month |
| Unassigned notes | Interaction logs not yet linked to a contact (click to manage) |

### Distribution charts & email status

- **Tag distribution**: bar chart of contacts per tag, highest first (requires tags to exist).
- **Country distribution**: top 10 countries with flags; the rest merge into "Other", blanks fall under "Unknown". Click a row to jump to the contact list filtered by that country.
- **Email deliverability**: cards counting each sendable status of CRM contacts (sendable / hard bounce / invalid / unsubscribed / temporarily undeliverable / mailbox full / sender issue / recipient blocked); click a card to filter the list by that status. Also shows the total of external newsletter subscribers not linked to CRM.

### Pending unassigned notes

Lists the 5 newest unassigned notes with type, creator and time, each with an "Assign contact" button for instant linking. "View all" opens the unassigned-notes page.

## Contacts

Path: `/contacts`. This is the heart of the system — where all your business cards and relationships live.

### List: search, filter and sort

- **Keyword search**: fuzzy match on name, email, company.
- **Filters**: tag, country, importance, language, email status, creator, where-met, and created/met date ranges.
- **Sort**: defaults to "last activity" descending (people you interacted with recently float to the top); click a column header to sort by name / company / title / email / tags / created date instead.
- **Copy email**: email and phone fields (in list and detail) have a copy icon — one click copies to clipboard.
- **Pagination**: 20 rows per page with a page navigator at the bottom.

### Saved views

Save the current search + filter combination as a named view and re-apply it in one click. Views are **private per user**, up to 10, shown as rounded chips above the list.

- **Save**: click the dashed "Save view", enter a name — all current filters are stored.
- **Apply**: click a view name to apply it and update the URL (returns to page 1).
- **Delete**: click the ✕ on a chip and confirm.

> A view records filters only — not sort order or page number.

### Export CSV

Click "Excel" or "CSV" to download the current filtered results (not limited by pagination). **Requires super_admin or the "export contacts" (`export_contacts`) permission**; the button is disabled otherwise.

### Bulk edit

Select one or more rows (the header "select all" applies to the current page) — a "Bulk edit (N)" button appears in the toolbar. You can apply at once: where-met / met-date, referrer, company, country, language, tags (tags are **added**, existing ones are kept). Blank fields mean "leave unchanged"; if you fill "where-met", a meeting interaction log is also written for each selected contact.

### Email the selected / filtered contacts

When you have a selection or an applied filter that includes sendable recipients, a green "Email (N)" button appears in the toolbar and carries those recipients to `/email/compose`. The system **de-duplicates by email** and automatically excludes non-sendable contacts (no email, blacklist, unsubscribed, abnormal email status); the excluded count shows next to the button and in a top banner.

### Build a newsletter list from a filter

With a selection or filter that includes sendable recipients, a "Create list (N)" button appears (**requires super_admin or the `newsletter` permission**). Enter a list name and description to build a newsletter list from the sendable subset; you're taken to the new list page.

### Add a contact

The toolbar "Add" is a dropdown:

- **New contact**: go to `/contacts/new` and fill in manually across four blocks — basic info, contact methods, social, notes. On that page you can pick up to 6 card photos at once and "Scan cards" for AI to merge-recognize, then "Apply to form". Before saving, the system compares email/name similarity to detect duplicates and prompts you.
- **LinkedIn screenshot**: pick a LinkedIn profile screenshot; AI parses it and pre-fills the new-contact form.

### Contact detail

Path: `/contacts/[id]`. Everything about one contact in one place:

| Feature | Notes |
|---------|-------|
| Field editing | "Edit" (top-right) opens a modal to change any field; country shows a flag emoji |
| Card management & OCR | One contact can hold several cards; pick up to 6 at once, AI merge-recognizes and shows the changed fields for confirmation; 🗑 deletes a single card |
| Interaction timeline | Notes / meetings / emails / system logs, newest first, infinite scroll |
| Notes & tasks | Add notes here; create tasks from the Tasks page or bot |
| Group photos | "Add photo" uploads one or more, reading EXIF automatically; click a thumbnail to view |
| Tags | Add / remove tags on the contact |
| Merge | Search another contact to merge into, with confirmation |
| Delete | Delete this contact (moves to trash) |
| Clear unsubscribe | One click clears this contact's unsubscribe/blacklist/bounce state (handles email_status, global blocklist and per-list unsubscribes at once) so you can send again |
| Email + AI draft | See below |

**Email + AI draft**: click "Email" to open a modal where you can edit To / CC / BCC (pre-filled with the contact's email), apply a template, or type a brief for **AI to generate** the body (it pulls in the recipient's info and recent interactions; TipTap editor). If the contact already has group photos uploaded via bot `/p`, you can click a thumbnail to attach it; you can also add an ad-hoc attachment (5 MB per file). Sending goes through Microsoft Graph (Outlook), writes an email interaction log, and pushes the contact to the top of "last activity".

**Pre-meeting briefing**: the detail page's "Pre-meeting briefing" block lets AI compile the latest public news on this person and their company. See the "Pre-meeting briefing" chapter.

### Last activity time

`last_activity_at` is maintained automatically by the database as the latest of interaction logs, photo uploads, and creation time — so recently-touched people float to the top. **SendGrid bulk sends and newsletters do NOT count** toward last activity (to avoid a single blast resetting everyone to the same time), though they still write interaction logs; Outlook emails and bot visits/meetings/tasks/photos do count.

## Card scanning & processing

Photographing cards is the main way data enters the system (the bot single-photo flow is under "Telegram Bot"). Below are the web-side batch and follow-up steps.

### Batch upload (web)

Path: `/contacts/batch-upload`. Upload up to **50** card photos at once; the system processes 5 concurrently (parallel upload + AI recognition) with a progress bar. Review each row in a preview table, run batch duplicate detection, then "Save all" at once.

### Pending cards

Path: `/contacts/pending`. Cards uploaded via the Telegram bot's **batch mode (`/b`)** land here for confirmation after recognition — they do not become contacts automatically. The page auto-refreshes recognizing items every 5 seconds and can be filtered by status (recognizing / recognized / failed) and uploader.

Each recognized card can be edited in place (fields, importance, language, tags, where-met/date) then: confirm & save, merge into a detected likely duplicate, manually search & merge, delete, or view the original image. The top "Batch set Met at" applies the same where-met/date to all recognized items at once. If items of yours are stuck "recognizing" too long, a "Re-run stuck recognition" button appears. Failed items show the error and offer "Retry recognition".

### Failed scans

Path: `/contacts/failed-scans`. Images uploaded via bot that AI **could not recognize at all (not even a name)** land here — only your own uploads are shown. Displayed as a thumbnail grid; you can zoom to the original, delete individually, or select and batch-delete. To retry, re-photograph and upload via the bot.

## Notes & interaction logs

### Note search

Path: `/notes`. Search all interaction logs by keyword (matches body text and email subject), date range (defaults to the last 30 days), type (note / meeting / email / newsletter — system logs are not shown here), creator, sort order, and pagination (20 per page).

### Unassigned notes

Path: `/unassigned-notes`. Shows interaction logs not linked to any contact (e.g. created when `/note` or `/v` in the bot could not find a contact). Each can be assigned to a contact via search, or deleted.

## Photos

Path: `/photos`. The gallery is **photo-centric** for group shots with contacts; one photo can tag multiple contacts and automatically appears on each tagged person's detail page.

### How photos get in

- **Telegram bot (`/p`)**: name the contact first (`/p`, `/p Name`, or `/p Name | Company`), then send photos continuously and press "Done". Photos are compressed automatically while preserving EXIF (capture time, location); a single photo can carry a text caption.
- **Web upload**: on a contact detail page, click "Add photo" in the "Group photos" block.

### Tagging & viewing

Shown as a grid; a 👥 badge (bottom-right) shows the tag count and tagged names appear below (untagged shows "Unassigned"). Search the top box by caption / location / name, and sort by upload time / capture time / contact name. Click a photo to open the lightbox: the right-hand "People in this photo" lets you add/remove tags and jump to a contact; likely matches surface as an "AI suggestion" you can ✓ accept or ✕ reject. The lightbox zooms and pans; close with `ESC` or by clicking the backdrop.

### Remove tag vs delete photo

- **Remove tag** (✕ in the lightbox): only unlinks that contact from the photo; the photo and other tags stay.
- **Delete photo** (trash icon in the contact detail "Group photos"): permanently deletes the whole photo and everyone's tags.

## Task management

Path: `/tasks`. Works via the web interface and the Telegram bot. Statuses: pending / done / postponed / cancelled.

### Web interface

Three tabs: **My reminders** (tasks I created with no assignee — self-reminders), **Assigned by me** (I created, assigned to others), and **Assigned to me**. Search by title at the top. "+ New task" takes a title (required), description, due date, and assignees (multi-select; blank = self-reminder). Each task can be edited or deleted; `pending` ones can be marked done, postponed (enter a new due date), or cancelled.

> Assistant proxy: once a manager assigns assistants in personal settings, an assistant can mark the manager's tasks done; `completed_by` records who actually did it.

### Create & view from Telegram

- **`/work` (`/w`)**: describe the task in natural language; AI (Gemini) parses the title, due date (understands "tomorrow", "next Friday", "end of month"), and assignee (matched against members), then creates it and notifies assignees.
- **`/tasks` (`/t`)**: lists your pending tasks (created by me + assigned to me), each with "✅ Done / ⏭ Postpone / ❌ Cancel" buttons.

### Daily task summary

Every day at **09:00 (Asia/Taipei)** the system sends a Telegram "today's tasks" summary with 🔴 overdue and 🟡 due-today tasks. You receive it if there are overdue/due tasks **or** any Outlook meeting today — so **you still get a summary on days with only meetings and no tasks**; only when both are empty does it stay silent. Each listed task has "✅ Done / ⏰ +1 day" buttons (applied to the first 8, overdue first). If you've completed Microsoft sign-in on the web, the summary appends a "🗓 Today's meetings" section listing Taipei-time Outlook meetings and matching external attendees to CRM contacts, flagging those with a ready briefing.

### Teams notification

If Teams Bot is linked, a new task posts an Adaptive Card in your Teams personal chat with the title, due date, and "Mark done" / "Go to task manager" buttons — you can complete it right in Teams.

## Bulk email

Path: `/email/compose` (needs the `bulk_email` permission when there are more than 20 recipients). Bulk email is for an ad-hoc send to a batch of contacts you select or filter in the CRM right now — different from the "Newsletter" flow that sends to subscription lists on a schedule.

### Start sending

The entry point is the **contact list**: select or filter contacts → click the green "Email N people" → the system de-duplicates by email and opens the composer with those recipients. The composer requires recipients passed from the contact page; opening it directly redirects back to the list. The "Excluded N" badge means both front and back end skip contacts with no email, bounced/invalid, unsubscribed, or a blacklist tag.

### Send methods & personalization

Switch between two channels at the top (auto-preselected by count — 450+ switches to SendGrid; Outlook caps at 500):

| Method | Notes | Sub-modes |
|--------|-------|-----------|
| Outlook | Sends from **your own** Microsoft mailbox (Graph); actually one message | BCC (recipients can't see each other) / all-TO |
| SendGrid | Sends from the system SendGrid account | Personalized (one email per person, variables, open tracking) / BCC blast (one message, no tracking) |

The variables `{{name}}` / `{{company}}` / `{{job_title}}` are substituted per recipient **only in SendGrid personalized mode**.

### AI polish, templates, attachments & test send

- **AI polish**: hand the draft to AI to rewrite as a professional business email; generates a subject if it's blank; replies in the draft's language.
- **Templates**: apply an existing email template (subject + body).
- **Preview**: simulate what a given recipient sees (variables substituted); switch among the first 20.
- **Attachments**: up to 5 files, 5 MB each, on both channels.
- **CC** (Outlook only) / **Reply-To**, **send a copy to myself** (SendGrid only).
- **Send a test to myself**: send one test email to your own inbox before the real send to check formatting.

### Send permission

Up to 20 recipients: anyone can send. Over 20: needs the `bulk_email` permission (Super Admin always has it). Without it and over 20, the composer shows a red warning and the send button is disabled.

### Send history & campaign tracking

Path: `/email/campaigns`. Lists recent bulk sends (up to 100) with subject, method, recipient count and time. **SendGrid personalized** campaigns show delivered / open rate / clicks / bounces; opening one shows stat cards, a recipient detail table (tabs: all / opened / not opened / bounced), CSV export, and a batch OCR re-scan on the "bounced" tab that re-recognizes bounced contacts' card images to find the correct email and update it in one click.

## Newsletter (needs the `newsletter` permission)

The newsletter is the periodic flow that turns each period's curated stories into trilingual content, sends it to **subscription lists**, and manages subscribe/unsubscribe. All of the following need the `newsletter` permission (Super Admin always has it).

### Collecting stories (`/news` and the draft page)

Path: `/admin/newsletter/draft/{YYYY-MM}`. Each issue has three blocks: 📌 This issue's highlight (only one), 📜 Last month's recap, 🔮 This month's preview.

- **Web**: "Add Story" in each block — title, body, event date, photo, link.
- **Telegram bot `/news`**: casually send activity info (text + photos) to the bot; pick a block, enter a title and date to accumulate stories.
- Drag to reorder, move across blocks; drag into "This issue's highlight" to make it the focus.

> A story needs both a title and a body to be included by AI; title-only stories are skipped.

### AI-write the trilingual newsletter

On the draft page click "AI write" — AI produces a preview in **繁中 / English / 日本語** (subject, body HTML, social blurb) following your arranged order. When it looks right, click "Create newsletter draft" to enter the send flow; you can also "Regenerate" or "Export JSON".

### Recipient list management

Path: `/admin/newsletter/lists`. Lists are subscriber groups you choose from when sending.

- **Import from CSV**: two columns "name" + "email"; the list name comes from the filename. Blacklist/unsubscribed emails are still imported but excluded at send time; emails matching existing contacts are auto-linked (no new contacts are created).
- **Build from contacts**: filter or select on the contacts page, then create — non-sendable contacts are **excluded at creation** and duplicate emails are merged.
- **List detail**: stat cards (total subscribers / linked contacts / sendable / bounced-invalid / pending / unsubscribed), per-subscriber management, add (search a contact or type an email directly), remove, "Sync SendGrid" to pull back bounce/unsubscribe states, and CSV export.

### Edit, send and schedule

Opening any newsletter is the edit page (which includes the quick-send flow):

- **Content**: subject, preview text, LINE/group promo blurb (can batch-import all three languages), body with preview / inline-edit / HTML / split views, and image insertion. The inline-edit toolbar offers bold/italic/underline, font family, font size, text color, alignment, and "Clear formatting"; text pasted from Word or web pages is automatically stripped of its original font and size so it matches the email body.
- **Export & share**: export PDF, export a long image (JPG), copy body (paste into Substack), publish to RSS (Substack fetch; keeps the latest 20 issues).
- **Choose lists**: tick one or more lists on the right, showing each list's "sendable / total" and the aggregated sendable count.
- **Test send**: enter any email to send just that address one copy — not counted, no status change.
- **Send now**: double-confirm with the sendable count, auto-batching (up to 1000 per batch), re-send protection, never sends twice to someone already delivered, malformed emails skipped and reported.
- **Schedule**: pick a future date/time and "Schedule"; status becomes "Scheduled" and it goes out within ~10 minutes of the time; cancellable back to draft before it sends.
- Links in the sent email get UTM parameters automatically (except the unsubscribe link).

### Subject A/B test

Fill "Subject B" to enable it; choose one of two modes:

- **Small sample + auto-send winner (default)**: send to a portion of the list first (test ratio 10–50%, default 20%) as the test group, wait 1/2/4 hours, then the system sends the **higher** open-rate subject to everyone else (Subject A on a tie).
- **Full list 50/50 split**: split the whole list in half, one subject each — no winner, no follow-up.

Test sends always use Subject A; leaving Subject B blank disables A/B.

### Analytics & overview

- **Analytics** (chart icon on the list row): headline numbers (delivered / failed / open rate / click rate), A/B result and winning subject, failure details, link clicks, open/click timelines, bounces, unsubscribes, and spam reports. From a sent newsletter you can one-click build an **engagement segment list** (openers / clickers / non-openers).
- **Overview dashboard**: `/admin/newsletter/overview` (super_admin only) — send-performance trends, list health (share unopened for 180 days), and totals for subscribers / unsubscribes / blacklist.

## Telegram Bot

The Telegram bot is the main data-entry channel. Every command has a shorthand; if no matching contact is found, notes/visits are saved as unassigned for later. `/lang zh|en|ja` switches the bot's reply language.

### Command reference

| Command | Alias | Purpose |
|---------|-------|---------|
| `/help` | `/h` | Show command help |
| `/lang [zh\|en\|ja]` | — | Switch the bot's reply language |
| `/search [keyword]` | `/s` | Search contacts (with interaction / email / note buttons) |
| `/note [name]` | `/n` | Add an interaction note |
| `/visit [name] [text]` | `/v` | Add a visit log; with text, AI records it from one sentence |
| `/a [name]` | — | Add a card (OCR) to a contact; can create a new contact if none found |
| `/p [name]` | — | Add a group photo to a contact |
| `/li` | `/linkedin` | Send a LinkedIn screenshot; AI parses it into a contact |
| `/news` | — | Collect newsletter stories (needs `newsletter` permission) |
| `/b [description]` | `/batch` | Enter batch mode (can carry a "where met" applied to the whole batch) |
| `/done` | — | End batch mode and start recognition |
| `/cancel` | — | Cancel the current mode / operation |
| `/met [count] [description]` | — | Bulk-tag "where met / date / referrer" onto the last N created contacts |
| `/email [keyword]` | `/e` | Send an email from a contact |
| `/work [description]` | `/w` | AI parses natural language to create a task |
| `/tasks` | `/t` | List your pending tasks |
| `/meet [meeting info]` | `/m` | AI parses and books a meeting into your calendar |
| `/user` | `/u` | List organization members (with Telegram/Teams link status) |
| `/ai [question]` | — | AI-agent Q&A; bare `/ai` shows the AI model currently in effect (organization-wide) |
| `/stop` | — | (Super Admin) enable maintenance mode; `/stop off` disables it |

### Scan a card by photo

Just send a card photo — no command needed:

```
[send photo] → Bot: recognizing… → shows result → ✅ Save / ❌ Discard
```

If an existing contact with the same email is detected, the bot shows extra buttons: **Add to "X"** (keep old data, fill blanks, write conflicts to the log), **Update "X" (new job)** (overwrite with new data, old values logged for history), **Create a new contact anyway**, and **Discard**. If you already have 5 or more pending cards, the bot refuses new photos until you clear them.

### Batch photos (`/b`, `/done`, `/cancel`)

Best when you have many cards at once. After `/b` the bot accepts them immediately and **does not recognize on the spot**, so you can keep shooting; `/done` sends them for background recognition and notifies you to review at `/contacts/pending`. `/b description` carries a "where met" that AI parses and applies to every card in the batch. `/cancel` exits without deleting the received photos (they stay in the pending area). Images with no readable name move to the failed-scans page.

### Log visits & bulk-tag source (`/v`, `/met`)

- **`/v Name text`**: one-sentence visit logging — AI parses date/time/location from the text and decides note vs meeting, then writes the interaction log directly. Bare `/v` or `/v Name` runs the step-by-step flow.
- **`/met count description`**: bulk-fill "where met / date / referrer" onto your **last N created** contacts (max 20) — ideal right after scanning a stack with `/b`. AI parses the description and shows a confirmation card; it only writes on "Confirm apply".

### Book meetings (`/meet`)

Book a meeting in natural language; AI parses time, attendees and location and replies with a confirmation card — only "Confirm" actually writes it into your Outlook/Teams calendar (requires Microsoft sign-in completed on the web). Attendees are matched to members by name/email.

### AI assistant (`/ai`)

`/ai <question>` queries or maintains the CRM in natural language — the same assistant as on the web (see "AI assistant"); bare `/ai` shows the AI model currently in effect (organization-wide, tuned by admins in the web dashboard).

## Teams Bot

The myCRM Teams Bot provides task notifications and meeting booking. **Auto-linking**: search the bot in Teams, open a 1-on-1 chat, send any message (e.g. `help`), and the bot matches your account via Microsoft Graph to link it (your Teams email must equal your CRM login email).

- **Task notifications**: new tasks arrive as an Adaptive Card; tap "Mark done" directly, with a "Go to task manager" link.
- **Meeting booking**: `/meet`, `/m` book meetings in natural language; a confirmation card writes to the calendar in one tap.
- **`/ai`**: shows the AI model currently in effect (organization-wide, tuned by admins in the web dashboard); type `help` in chat for guidance.
- Only personal-chat notifications are supported (no proactive channel pushes).

## AI assistant

The AI assistant is a conversational interface for querying and maintaining the CRM in natural language. Three entry points share the same assistant:

- **Floating button (bottom-right)**: a blue circular button on every page that slides out a chat drawer.
- **Full page**: `/ai-assistant`, for longer conversations.
- **Telegram bot `/ai`**: ask directly in Telegram.

### What it can do

Give instructions in natural language and the assistant picks the actions: look up contacts (by name / email / company, reading full data, tags and recent interactions), update a contact's descriptive/relationship fields, add an interaction note (optionally with a meeting date), list / add / remove tags, work with newsletter lists (list them, view subscribers, add an email), and schedule a pre-meeting briefing for a contact. It replies in your language (default 繁中).

### Write protection & limits

- **Fully audited**: every query and change records the operator, time and action, always run as **you**.
- **Safe fields only**: primary email, unsubscribe status, card images and system fields cannot be changed; it **cannot delete** contacts, lists or subscribers.
- **It explains what it did**, and there's no auto-undo — review before continuing.
- **Limits**: web conversations keep the latest 40 messages automatically (since v8.1.2 — they survive refreshes and device switches; press "Clear chat" to start over. Telegram starts fresh each time); up to 6 consecutive tool steps per request; ~60 seconds per reply; contact search returns up to 100 at once, list subscribers up to 500; up to 50 field changes at once. For tasks, reports, newsletter writing, etc., use their own pages.

## Pre-meeting briefing

Location: the "Pre-meeting briefing" block on a contact detail page. AI uses Google search to compile the latest public news on the person and their company for reference before a visit or meeting.

- **Content**: three sections — the person's recent activity, the company's recent activity, and suggested openers/topics (marked "no public data" where none is found) — with clickable **source** links below.
- **How to generate**: click "Generate briefing"; the system processes **asynchronously** in the background (usually within a minute; you can leave the page), then shows the result in the same block and the button becomes "Regenerate". This summary is **not written to the interaction log**.
- **Quality**: depends on data completeness — fill in company, title, company website and LinkedIn first. It only compiles public, verifiable information; verify anything important through the source links.

## Reports (needs super_admin)

Path: `/admin/reports` (visible to super_admin only).

### Generate now

Pick start/end dates → "Generate report" → preview on the web (new cards + interaction logs) → "Download Excel" for an `.xlsx` (two sheets: new cards, interaction logs).

### Scheduled delivery

- Auto-sent reports go out from the backend via Gmail, so a super_admin must first complete a one-time Google authorization by opening `/api/auth/gmail` in the browser while signed in (this page has no button; credentials refresh automatically).
- **Add a schedule**: name, frequency (weekly / monthly / custom cron), report window in days (1–365), recipients (comma-separated). The list shows the last run result (✅ / ⚠️ / not yet run) and lets you toggle enabled, edit or delete.
- Cron is UTC-based (Taiwan = UTC+8).

## Feedback

Path: `/feedback`. Submit feature suggestions or bug reports: pick a type (Feature Request / Bug Report), fill in a title and description (both required), and optionally attach a screenshot (recommended for bug reports). After you submit, an admin tracks and handles it on the backend.

The "My feedback" list below shows every report you have submitted with its current status (pending / in progress / resolved awaiting confirmation / done / won't fix). When an admin resolves your report, the system emails you; verify that the fix actually works, then press "Confirm done" to close it — every report is closed by its own reporter.

## Personal settings

Path: `/settings`.

### Profile & linking

Display name, email (the Microsoft login email, read-only), role (read-only), Telegram ID. Also shows Teams Bot link status (completed automatically once you chat with the bot in Teams — not linkable manually here).

### Appearance & language

Theme (light/dark — also quick-toggled at the top-right of the header) and language (繁中 / English / 日本語).

### My assistants

A manager can appoint one or more assistants who can mark the manager's tasks done and operate tasks the manager created. Click "Add assistant" and pick a member from the dropdown (only lists those not yet added); click the ✕ on a chip to remove.

### Two-factor authentication (MFA)

Adds a second login factor via TOTP. Enable: click "Enable MFA" → scan the QR code with an authenticator app (or expand "Enter key manually") → enter the 6-digit code → verify. Disabling requires confirmation.

### Personal email-generation prompt

Customize **your own** email AI-generation instruction, overriding the org/system default; it applies when you use "AI generate" to write from a contact detail page. Leaving it blank uses the org or system default (the effective content is shown below).

## Automated pushes

The system proactively messages you via Telegram (some via Teams) at specific moments; you must have the relevant account linked, and it stays silent when there's no recipient or nothing to send.

| Push | When | Condition & content |
|------|------|---------------------|
| Daily task summary | 09:00 daily (Taipei) | Overdue/due-today tasks + today's Outlook meetings; sent even with only meetings, silent only when both are empty (see "Task management") |
| Cold-relationship reminder | Mondays (UTC 02:00) | List of contacts you haven't touched in a while (see below) |
| Briefing scheduled notice | Scans meetings in the next 24h every 6h | Matches external attendees to CRM and auto-schedules a pre-meeting briefing |
| Briefing-ready push | After a briefing finishes | Sends the summary opener plus the contact link (any source) |
| Post-meeting prompt | After a meeting's start time | Suggests logging the outcome with `/v` (once per meeting) |
| Task assignment (Teams) | On new task creation | Adaptive Card; mark done directly |

### Cold-relationship reminder

Every Monday the system checks contacts **you own** (`created_by` = you) and compiles those you haven't touched in a while into a "time to reach out" list: high-importance over 30 days, others over 90 days with no interaction count as cold; anyone with an in-progress task is excluded, and it lists at most 8 (ordered by days cold). The message includes contact links and suggests replying `/v <name> <highlights>` to log an interaction in one sentence. If nothing qualifies that week, nothing is sent.
