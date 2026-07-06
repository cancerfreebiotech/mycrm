---
title: Org Settings & Branding
parent: Admin
nav_order: 19
---

# Org Settings & Branding

Location: `/admin/org-settings` (super_admin only)

Manage company-wide organization info and newsletter branding without code changes or redeploys.

## Available settings

| Setting | Purpose |
|------|------|
| Organization name | Company name shown across the system |
| Allowed login email domains | Backend login domain verification source (comma-separated) |
| Newsletter logo URL | Logo used in the newsletter skeleton |
| Newsletter reply-to email | Reply-to address for newsletters |
| Company website / Facebook / LinkedIn | Social links in the newsletter footer |
| Feedback notification recipient | Recipient of the daily system feedback digest email |
| Sender display name | Name shown as the email sender (SendGrid from name) |
| Internal email domain | Domain used to decide whether a meeting attendee is internal staff (without `@`) |
| Organization email domain | Company domain used for inbound-mail attribution (without `@`) |
| BCC archive inbox domain | BCC inbox domain used for automatic mail archiving (without `@`) |
| Postal address | Shown in the newsletter footer for CAN-SPAM compliance |
| Organization owner email | Recipient for system alerts, unattributed inbound mail, and the default reply-to for system mail |
| Application URL | Public URL used for links in emails and digests (e.g. `https://crm.cancerfree.io`) |

> The seven mail/system parameters from "Sender display name" through "Application URL" have been editable here since **v7.9.4**; they were previously hard-coded.

## Module toggles

Turn an entire feature module off with one switch; changes also apply within 60 seconds:

| Toggle | Effect when off |
|------|------|
| Hunter.io auto-enrichment | New contacts are not auto-enriched (company / title) via Hunter.io; a lookup on the [System Health](health.md) page shows a "module disabled" notice |
| AI assistant | The AI assistant chat (web and Telegram `/ai`) is disabled |

## Usage

1. Edit fields or flip toggles, then click "Save".
2. Settings are **cached for 60 seconds** — changes apply within 60 seconds of saving.
3. An empty field means the system default is used (shown as the field hint).

> All changes are recorded in the audit log (action: Organization settings change).
