---
title: Bulk Email
parent: Features
nav_order: 7.7
---

# Bulk Email

Path: `/email/compose` (requires the `bulk_email` permission when there are more than 20 recipients)

Bulk Email lets you send one email to a batch of contacts you **hand-pick or filter** straight from the Contacts list. You can send it either as personalized mail (one email per person, with variables such as the recipient's name) or as a single BCC blast to everyone.

> This is different from the [Newsletter](newsletter.md). The newsletter turns each issue's curated stories into tri-lingual content sent to **subscriber lists** with subscribe/unsubscribe management; Bulk Email is an **ad-hoc send** to the contacts you pick in the CRM right now.

---

## Bulk Email vs. Newsletter

| Item | Bulk Email | Newsletter |
|------|------------|------------|
| Recipients | Contacts you select/filter in the list | A Newsletter List |
| Content | Written by you (AI polish, templates) | AI-generated tri-lingual content from each issue's stories |
| Personalization | Variables like `{{name}}` in SendGrid Individual mode | Per list member |
| When to use | Ad-hoc, for a specific batch | Recurring, for subscribers |

---

## Starting a send

The entry point is the **Contacts list** (`/contacts`):

1. Tick the contacts you want, or filter by tag, country, importance, etc.
2. Click the green **"Email N"** button at the top right.
3. The system de-duplicates by email (multiple contacts sharing one address collapse to a single send) and opens the compose page with that batch.

> The compose page `/email/compose` needs recipients handed in from the Contacts page; opening it directly with no recipients redirects you back to Contacts.

---

## Automatically excluded recipients

The button shows an "N excluded" badge. Before sending (on both the client and the server), the system skips contacts that:

- have no email address,
- have a bounced/invalid email status,
- have unsubscribed or opted out,
- carry an "Email blacklist" tag.

The server also checks the unsubscribe table and de-duplicates by email again, so a single address only ever receives one copy.

---

## Composing the email

### Sending method

At the top of the compose page you can switch between two delivery channels; the system pre-selects one by recipient count (defaults to Outlook, switches to SendGrid at 450+ recipients; Outlook caps at 500):

| Method | Description | Sub-modes |
|--------|-------------|-----------|
| **Outlook** | Sends from **your own** Microsoft/Outlook mailbox (Microsoft Graph). Only 1 physical email is sent. | BCC (recipients hidden) / Shared TO (mutually visible) |
| **SendGrid** | Sends from the system SendGrid account. | Individual (one per recipient, supports variables + open tracking) / BCC blast (1 email, no tracking, no variables) |

> ⚠️ Only **SendGrid Individual** mode supports per-recipient variable substitution and open/click tracking. In Outlook and any BCC mode, everyone receives identical content.

### Subject and body

Fill in the **subject** and write the body in the built-in editor (bold, lists, links, and other formatting are supported).

### Personalization variables

You can insert variables into the body and subject; they are replaced with each recipient's data at send time:

| Variable | Field |
|----------|-------|
| `{{name}}` | Name |
| `{{company}}` | Company |
| `{{job_title}}` | Job title |

Variables are only substituted per recipient in **SendGrid Individual** mode; other modes keep the literal text, and the UI shows a reminder when that happens.

### AI Polish

Clicking **"AI Polish"** hands your current draft to the AI to rewrite it into a professional business email, generating a subject line when one is missing. The AI replies in the same language as the draft.

### Templates, preview, and attachments

- **Templates**: apply a saved [Email Template](../admin/templates.md) (subject + body).
- **Preview**: simulate what a chosen recipient will actually receive (variables substituted); you can switch among the first 20.
- **Attachments**: up to 5 files, 5 MB each; supported by both Outlook and SendGrid.

### Other options

- **CC** (Outlook only): defaults to your own email; add more (comma-separated). CC does not create an interaction log.
- **Reply-To** (SendGrid only): where replies go when a recipient hits "Reply"; defaults to your own email.
- **Send a copy to myself** (SendGrid only): also delivers the same email to your inbox.
- **Send Test to Myself**: send a test copy to your own inbox first to check formatting before the real send.

---

## Bulk email permission

- **20 recipients or fewer**: anyone can send directly.
- **More than 20 recipients**: requires the admin-granted **`bulk_email` (Bulk Email, 20+)** permission (Super Admin always has it).
- Without the permission and with more than 20 recipients, the compose page shows a red warning and the Send button is disabled.

---

## After sending

- Every contact actually reached gets an **interaction log** entry (type: email, direction: outbound).
- A **campaign record** is created for later review.
- With SendGrid, a "Send Confirmation" email is also sent to you, listing the recipients and a content preview.

> ⚠️ SendGrid sends do **not** update a contact's "last activity time" (the interaction log is still written).

---

## Email campaign history

Path: `/email/campaigns`

This page lists your recent bulk sends (up to 100). Each row shows the subject, the sending method (Outlook BCC / SendGrid BCC / SendGrid Individual), the recipient count, and the time.

- **SendGrid Individual** campaigns show delivered / open rate / clicks / bounced stats; other modes show "No tracking data".
- Opening a single campaign shows:
  - Stat cards (Individual mode only) and a recipient table (status, first opened, open count, last clicked).
  - Tabs: All / Opened / Unopened / Bounced.
  - **Export CSV**.
  - The "Bounced" tab offers a **Bulk OCR rescan**, which re-reads bounced contacts' business-card images to recover the correct email and update it in one click (which clears the bounced status so you can resend).
