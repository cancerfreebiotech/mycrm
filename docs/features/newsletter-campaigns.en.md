---
title: Sending Newsletters
parent: Features
nav_order: 7.5
---

# Sending Newsletters

Path: `/admin/newsletter/campaigns` (requires the `newsletter` permission)

The newsletter list page is where every newsletter is managed: creating, editing, test-sending, sending to the full list, and publishing to RSS for Substack to pick up. For collecting material and generating drafts with AI, see [Newsletter Material](newsletter.md).

---

## Newsletter list and statuses

The page lists recent newsletters in a table with columns for title, subject, status, engagement, and created date.

| Status | Description |
|--------|-------------|
| Draft | Not yet sent; content and recipient lists can still be edited |
| Scheduled | Queued for sending (shown in blue) |
| Sent | Sending completed; shows the number of recipients |

> Newsletters are sent immediately, so a campaign is usually either "Draft" or "Sent".

A newsletter that has been published to RSS also gets a separate purple "Published" marker next to its status (independent of the send status above).

Sent newsletters show an engagement summary: **recipients · opens (open rate) · clicks** (from SendGrid open/click tracking).

Each row can be **opened** to edit, **duplicated** into a new draft, **renamed** in place, or **deleted**.

---

## Creating a newsletter

The top-right of the list page offers four ways to create one:

| Method | Description |
|--------|-------------|
| Material AI compose | On the draft board in [Newsletter Material](newsletter.md), click "AI Compose" — the AI turns the month's material into three newsletter drafts (zh-TW / English / Japanese) at once |
| Skill import | Upload the zip produced by the Claude.ai newsletter-composer skill (containing `manifest.json` and `images/`); drafts are created for whichever languages the file contains |
| AI compose | Enter the month, an intro, and each story outline directly on screen (with optional images and links); tick "Auto-translate English + Japanese versions" and let the AI generate, then jump to the editor |
| Create blank | Create a completely empty newsletter to fill in by hand |

> "Material AI compose" and "AI compose" both create all three language versions at once; "Skill import" creates drafts for whichever languages the zip actually contains.

---

## Editing content

Opening any newsletter takes you to its editor, where you can adjust:

- **Subject** and **preview text**
- **LINE / group promo text**: a separate social blurb you can copy in one click; "Batch import 3 languages" lets you paste the zh-TW / English / Japanese blurbs at once and saves each back to the matching newsletter from the same batch
- **Body**, with four view modes:
  - **Preview**: see it as it appears in an inbox
  - **Inline edit**: click text directly in the preview to change it
  - **HTML**: edit the raw HTML
  - **Split**: edit HTML on the left with a live preview on the right
- **Insert image**: in inline / HTML / split mode, upload an image and insert it at the cursor

The editor also offers export and sharing:

| Action | Description |
|--------|-------------|
| Export PDF | Output a print-optimized PDF (the unsubscribe footer is hidden automatically) |
| Export image | Render the whole newsletter as a single tall image (JPG), ideal for LINE / social posts |
| Copy content | Copy the body without the header/footer (formatting kept) — paste straight into the Substack editor |
| Substack link | Copy the public web-view link for this newsletter (requires publishing to RSS first) |

> Remember to click "Save draft" after edits. The system also auto-saves once before a real send.

---

## Selecting recipient lists

The right side of the editor lets you tick one or more recipient lists. Each list shows **eligible / total** counts: unsubscribed, bounced, invalid, or otherwise problematic subscribers are excluded and only count toward "eligible".

The bottom sums the **total eligible recipients** across the selected lists and notes how many were excluded for bounce / unsubscribe. For building and maintaining lists, see [Newsletter Material › Recipient list management](newsletter.md#recipient-list-management).

---

## Test send

Enter any email in the "Test send" field and click "Test send" to send a single test message to that address only.

A test send is **not** recorded in the send history, does not change the newsletter's status, and does not write recipient engagement. Send one to yourself to check the layout before a real send.

---

## Sending

Click "Send now" to start the broadcast. What the system does:

- **Confirms twice before sending**, showing the actual eligible count
- **Batches automatically**: up to 1000 emails per batch, so even large lists go out in one run
- **Resend protection**: a newsletter that has already been sent will not be re-sent to everyone just because the button is clicked again
- **No duplicate delivery**: the system records each recipient it successfully delivered to; even if a follow-up send is needed, anyone who already received it is skipped automatically
- **Malformed emails are skipped** and reported in the result so you can clean up the source data

Once complete, the newsletter is marked "Sent" and the list page shows its delivery / open / click engagement.

---

## Unsubscribe handling

Every newsletter automatically includes an **unsubscribe link** in the footer (unique per recipient). When a recipient clicks it they are recorded as unsubscribed and no future newsletter is sent to them.

At send time the system automatically excludes the following so nothing goes to people it shouldn't:

- Anyone who has unsubscribed
- Blacklisted emails
- Contacts with a problematic email status (bounced, invalid, etc.)
- Malformed emails

---

## Publishing to RSS (Substack)

The "Publish to RSS" button in the editor adds the newsletter to the public RSS feed (`/api/newsletter/feed.xml`).

- Substack polls this feed periodically; each newly published newsletter becomes a **draft post** in Substack
- The feed keeps only the **20 most recent** published newsletters, and automatically strips the email header, footer, and unsubscribe chrome, leaving just the article body
- After publishing you can click "Unpublish RSS" to remove it from the feed
- Once published you can also use "Substack link" to copy the public web-view link to share
