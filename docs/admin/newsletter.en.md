---
title: Newsletter
parent: Admin
nav_order: 7
---

# Newsletter

Path: `/admin/newsletter/campaigns`

Full pipeline: subscriber management → newsletter editing → test send → production send → PDF export → RSS publish for Substack auto-drafting.

---

## Subscribers (`newsletter_subscribers`)

Subscribers are **independent entities** from CRM contacts. Any email imported as a subscriber can receive newsletters — doesn't have to be a CRM contact. But:

- Import auto-links to an existing contact with the same email (case-insensitive)
- New/updated contacts with matching email also trigger forward link
- A subscriber can belong to **multiple lists** (e.g. `zh-TW` + `zh-TW-marketing`)

### Lists (`newsletter_lists`)

Groups identified by `key` (e.g. `zh-TW`, `en`, `ja`, `zh-TW-marketing`, `2604-zh-unsent`). When sending, select a list; it expands to all member emails.

### CSV Import

`scripts/import-newsletter-subscribers.mjs` (SendGrid standard CSV schema):
```
EMAIL,FIRST_NAME,LAST_NAME,ADDRESS_LINE_1,...,CREATED_AT,UPDATED_AT,CONTACT_ID
```
- Command: `node scripts/import-newsletter-subscribers.mjs --csv path/to/x.csv --list <list-key>`
- Idempotent (duplicate emails merge, list membership accumulates)
- For large imports, reduce chunk size from 500 to 50/100 if `fetch failed` occurs

---

## Campaigns Index

Path: `/admin/newsletter/campaigns`

Lists all `newsletter_campaigns` with status (draft / sent), RSS published flag, creation time. Click into a row to open **Quick-Send**.

---

## Quick-Send Page

Path: `/admin/newsletter/quick-send/[id]`

Left panel:
- **Subject / Preview text**: editable, "Save draft" persists
- **HTML preview**: live iframe
- **Export PDF**: `window.print()` on preview iframe → save as PDF

Right panel:
- **Recipient lists**: multi-select checkboxes showing subscriber count per list
- **Test send**: enter one email, SendGrid sends only to that address (doesn't touch sent_count/sent_at)
- **Production send**: confirmation prompt, sends to all members of selected lists
- **Publish to RSS**: sets `published_at = now()`, public `/api/newsletter/feed.xml` immediately includes it

Sending uses SendGrid Email API, up to 1000 per API call (personalizations array, each recipient in their own To: header). After send:
- `newsletter_campaigns.status='sent'`, `sent_at`, `sent_count`, `total_recipients` all recorded
- Each subscriber with linked `contact_id` gets an `interaction_logs` row (type=`email`, `send_method='sendgrid'`, `campaign_id`)
- ⚠ SendGrid sends do NOT count toward the contact's "last activity" (see contact doc behavior matrix)

---

## Image Assets

All newsletter images (logo, event photos, etc.) should live in **Supabase Storage bucket `newsletter-assets`**, not external CDNs (the historical listmonk CDN is deprecated).

- Public bucket, URL format: `https://<project>.supabase.co/storage/v1/object/public/newsletter-assets/<period>/<filename>`
- Filenames must be ASCII (Storage key limitation); CJK filenames get hash-based fallback (`asset-<8-char-sha256>.ext`)
- One-off migration script: `scripts/migrate-newsletter-images.mjs` (reads campaign HTML → downloads all external images → uploads to Storage → rewrites `<img src>`)

---

## RSS Feed (for Substack)

Public endpoint: `/api/newsletter/feed.xml` (RSS 2.0)

- Only outputs campaigns with `published_at IS NOT NULL`
- Latest 20, ordered by `published_at DESC`
- Each item: `title`, `link` (to `/newsletter/view/<slug>`), `guid`, `pubDate`, `description` (preview_text), `content:encoded` (full HTML in CDATA)

### Substack Setup
1. Substack → Settings → **Import from RSS**
2. URL: `https://crm.cancerfree.io/api/newsletter/feed.xml`
3. Substack polls periodically (typically every few hours); each new item auto-becomes a draft
4. Log in to Substack, verify rendering, click publish

Note: Substack has no Post-by-Email API (confirmed), so we use the RSS route instead.

---

## Monthly Workflow (Suggested)

1. **Prepare content**: write the monthly newsletter (future: AI-assisted via `newsletter_tone_samples`)
2. **Create campaign**: direct DB insert, or later via `/admin/newsletter/compose` UI from skeleton
3. **Upload new images** to Storage (if any)
4. **Quick-Send page**: adjust subject / preview text, select lists
5. **Test send** to your own email, verify rendering
6. **Publish to RSS** → Substack auto-drafts → verify Substack rendering
7. **Production send** to all subscribers
8. In Substack, click publish

---

## Guarantee: won't pollute `last_activity`

All SendGrid-sent interaction_logs are tagged `send_method='sendgrid'`; the `contacts.last_activity_at` DB trigger filter `send_method IS DISTINCT FROM 'sendgrid'` excludes them.

This means: even if a newsletter goes to 4000+ subscribers, the accompanying interaction_logs won't stamp every contact's "last activity" to the same moment. This is already built-in.
