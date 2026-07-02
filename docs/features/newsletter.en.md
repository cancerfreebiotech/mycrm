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
3. Review, then click "Create newsletter drafts" → schedule and send from `/admin/newsletter/campaigns`
4. Use "Regenerate" to redo

> Story order follows the order you arranged on the draft board (your drag result).

## Export JSON

"Export JSON" exports the raw (zh-TW) material for the period, for external tools or the Claude.ai newsletter workflow.
