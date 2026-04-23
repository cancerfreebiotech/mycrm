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

## AI-assisted Composition (v4.0.0+)

Path: `/admin/newsletter/ai-compose` (via the "🪄 AI 撰寫" button on campaigns index)

### Workflow
1. **Period**: `YYYY-MM` (e.g. `2026-05`), defaults to next month
2. **Auto-translate toggle**: if on, generates zh-TW / en / ja drafts simultaneously; if off, zh-TW only
3. **Intro (Chinese)**: textarea with the month's highlight; AI rewrites into formal opening. Can leave blank.
4. **Story cards**: "Add section" button adds a card. Each card:
   - Title (Chinese, required)
   - Outline / key points (Chinese bullets or full sentences, required) — AI will expand to 200-400 chars
   - Image (optional) — direct upload, stored at `newsletter-assets/<period>/`
   - Related links (optional) — URL + Chinese label, multiple entries
5. Click "**AI 生成電子報**" → wait 30-60 seconds → auto-redirects to the zh-TW draft in quick-send

### How AI generates content
- Loads the latest 2 newsletters per target language from `newsletter_tone_samples` as **few-shot tone reference**
- Portkey + Gemini 2.5 Flash expands your outline with past tone into paragraph HTML
- For en / ja, titles are translated first, then body written in target-language tone (not mechanical translation)
- Filled into clean skeleton (logo header, intro, numbered stories, social icons, unsubscribe footer)

### Skeleton templates
Stored in `email_templates` (one per language). Placeholders: `{{subject}}`, `{{period_label}}`, `{{intro_html}}`, `{{stories_html}}`, `{{{unsubscribe}}}`. ~2.5 KB each, clean HTML (no more listmonk table hell). Edit skeleton to change global format.

### Tone corpus maintenance
`newsletter_tone_samples` stores past newsletter HTML as reference corpus. Add/update via `scripts/import-newsletter-tone-samples.mjs`. After sending a campaign that reads well, you may manually insert it into the corpus for future AI reference (or write a trigger to accumulate automatically — not yet done).

---

## Monthly Workflow (v4.0.0 Suggested)

1. Go to `/admin/newsletter/ai-compose`, enter Chinese content (once; auto-translates to 3 languages)
2. Wait for AI generation → auto-redirect to zh-TW draft in quick-send
3. **Adjust subject / preview text**; fine-tune body if needed (split view with live preview)
4. Switch to en / ja campaigns to check translations / polish
5. **Test send** to your own email to verify rendering (via SendGrid)
6. **Publish to RSS** → Substack auto-drafts → log in to Substack to verify layout
7. **Production send** to all subscribers
8. Click publish in Substack

---

## Guarantee: won't pollute `last_activity`

All SendGrid-sent interaction_logs are tagged `send_method='sendgrid'`; the `contacts.last_activity_at` DB trigger filter `send_method IS DISTINCT FROM 'sendgrid'` excludes them.

This means: even if a newsletter goes to 4000+ subscribers, the accompanying interaction_logs won't stamp every contact's "last activity" to the same moment. This is already built-in.
