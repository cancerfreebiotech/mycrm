---
title: AI Assistant
parent: Features
nav_order: 8
---

# AI Assistant

Path: `/ai-assistant`

The AI Assistant is a conversational interface that lets you query and maintain your CRM in plain language, without navigating pages yourself. Behind the scenes it connects to contacts, newsletter lists, tags, and notes, and it can schedule a "pre-meeting briefing" for someone you are about to meet.

---

## Where to Open It

| Entry point | Description |
|-------------|-------------|
| **Floating button (bottom-right)** | Every page has a blue round chat button in the bottom-right corner. Tap it to slide out the chat drawer from the right — available anywhere |
| **Full-page mode** | Open `/ai-assistant` for the full page, better suited to longer conversations |

Both entry points share the same assistant with identical capabilities.

---

## What It Can Do

Just give instructions in plain language; the assistant picks the actions it needs:

| Category | What you can ask it to do |
|----------|---------------------------|
| **Look up contacts** | Search by name (any language), email, or company; read out a contact's full details, tags, and most recent interaction history |
| **Update contacts** | Edit descriptive fields such as name, company, job title, department, phone, mobile, secondary email, address, LinkedIn/Facebook, where and when you met, referrer, importance, language, and hospital |
| **Add notes** | Add an interaction note to a contact, optionally with a meeting date |
| **Tags** | List all tags, and add or remove a tag on a contact |
| **Newsletter lists** | List all lists with member counts, view a list's subscribers, and add an email to a given list |
| **Pre-meeting briefing** | Schedule a "pre-meeting briefing" for a contact, gathering the latest public updates about the person and their company in the background; view the result later on that contact's page |

The assistant replies in your language (Traditional Chinese by default).

---

## Example Prompts

```
Search for contacts at NTU
Show Mr. Wang's full details and recent interactions
Change Chen Xiaoming's job title to Marketing Director
Add a note to this contact: talked about Q3 partnership by phone today, follow up next week
Mark this person as important
List all newsletter lists
Add alice@example.com to the "Doctors" list
I'm meeting Mr. Wang next week — help me get up to speed on him
```

If a request is vague, the assistant will first search and confirm who you mean before making changes.

---

## Write Actions and Safety

The assistant can change data directly, so several safeguards are in place:

- **Everything is audited**: every query and change records the operator, time, action, and whether it succeeded, and always runs as **you**.
- **Only safe fields can change**: when updating a contact, only the descriptive/relationship fields in the table above are allowed. The **primary email, unsubscribe status, business-card images, and system fields cannot be modified by the assistant.**
- **No delete capability**: the assistant cannot delete contacts, lists, or subscribers.
- **It tells you what it did**: before a write, the assistant explains in its reply what it changed. Since there is no automatic undo, read its explanation before continuing.

---

## Limits

- **Conversations are not saved**: closing the drawer, refreshing, or leaving the page clears the current conversation; there is no history to revisit.
- **Steps per request are capped**: a single request runs at most 6 consecutive rounds of tool operations; when a request is too complex, the assistant will ask you to break it down or be more specific.
- **Response time**: each reply takes up to about 60 seconds.
- **Search limits**: contact search returns at most 100 results (default 20); list subscribers at most 500 (default 50).
- **Update fields**: the primary email and unsubscribe status cannot be changed; at most 50 fields per update.
- **Scoped to existing actions**: the assistant can only work with contacts, lists, tags, notes, and pre-meeting briefings. For other features (tasks, reports, writing newsletter drafts, etc.), use their own pages.
