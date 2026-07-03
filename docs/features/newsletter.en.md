---
title: Newsletter Material
parent: Features
nav_order: 7
---

# Newsletter Material

Path: `/admin/newsletter/draft/{YYYY-MM}` (requires the `newsletter` permission)

Each newsletter issue is assembled from "story drafts". Pick a month, edit three sections, then generate a trilingual newsletter with one click.

---

## Three sections

| Section | Description |
|---------|-------------|
| 📌 Highlight | A single featured story, shown at the very top |
| 📜 Last month | Recap of the previous month |
| 🔮 This month | Preview of this month's upcoming events |

---

## Adding stories

- **On the web**: click "Add Story" in a section and fill in title, content, event date, photos, links
- **Telegram bot**: send event info to the bot to create a story quickly

> ⚠️ **Every story needs BOTH a title and content to be included by the AI.**
> Title-only stories (e.g. quick Telegram captures with no content yet) are skipped.
> After you click "AI Compose", the preview lists what was left out — add content and regenerate.

---

## Reordering (drag & drop)

- **Drag** cards to change their order
- Move stories **between sections** (Last month ↔ This month)
- Drag a story into **Highlight** to feature it; Highlight holds one story — the previous one moves back to Last month
- Works with touch and keyboard; changes save on drop

## Event date ranges

- Enter a single date, or add an optional **end date**
- With an end date, the card and the generated newsletter show a range (e.g. `6/22 – 6/25`)

---

## Generating the newsletter

1. Click **AI Compose** (top right)
2. The AI produces a **zh-TW / English / Japanese** preview (subject, body HTML, promo blurb)
3. Review, then click "Create newsletter drafts" → edit and send from [Sending Newsletters](newsletter-campaigns.md)
4. Use "Regenerate" to redo

> Story order follows the order you arranged on the draft board (your drag result).

## Export JSON

"Export JSON" exports the raw (zh-TW) material for the period, for external tools or the Claude.ai newsletter workflow.

---

## Recipient list management

Path: `/admin/newsletter/lists` (reachable from the top-right "Recipient lists" link on the [Sending Newsletters](newsletter-campaigns.md) page)

A recipient list is a group of newsletter subscribers you pick from when sending. Once created, a list can be selected in [Sending Newsletters](newsletter-campaigns.md).

### Import from CSV

- Click "Import from CSV" (top right of the lists page) and choose a CSV with two columns: "**名字**" (name) + "**email**" (email required; column order doesn't matter, extra columns are ignored)
- The list name is derived from the **filename** and can be renamed after import
- Skipped: rows with a malformed email, and emails duplicated within the same CSV
- ⚠️ **Blacklisted / unsubscribed emails are still imported into the list** (by established policy); they are only counted separately as "bounced / unsubscribed" in the import stats, and are excluded automatically at **send time**
- Imported emails that match an existing contact are linked automatically; this flow **never** creates new contacts

### Create a list from contacts

- On the **Contacts** page, filter or select contacts, then click "Create list" to build a new list from that set
- Unlike CSV import, this **excludes non-sendable people at creation time**: blacklisted, no email, unsubscribed, bounced / problematic status
- When multiple contacts share the same email, they collapse into a single subscriber

### List detail and subscriber statuses

Click a list name to open its detail page, where you can search, filter (status / country / whether linked to a contact), sort, and manage subscribers individually. The stat cards at the top:

| Stat | Description |
|------|-------------|
| Total subscribers | Everyone in the list |
| Linked contacts | How many are matched to a CRM contact |
| Sendable | People with a healthy status who will actually receive mail |
| Bounced / invalid | Emails that can't be delivered |
| Pending | Temporary failure / mailbox full / sender or recipient blocked |
| Unsubscribed | People who have unsubscribed |

Each subscriber shows a health-status badge: Subscribed, Unsubscribed, Bounced, Invalid, Temporary failure, Mailbox full, Sender blocked, Recipient blocked, Spam report.

Other actions:

- **Add** a subscriber: via "Search contacts", or "Enter email directly" (added straight away if a subscriber record already exists, otherwise a new subscriber is created)
- **Remove** an individual subscriber
- **Sync SendGrid**: pull the latest bounce / invalid / unsubscribe status back from SendGrid and update the list markers

### Export and stats

- The **download** icon on each row of the lists page exports that list's subscribers as CSV (email, name, company, source, joined date, unsubscribed; includes a UTF-8 BOM so Excel opens Chinese/Japanese correctly)
- When editing a newsletter, each list shows a live "eligible / total" count to help estimate real reach
