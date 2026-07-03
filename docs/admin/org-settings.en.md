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

## Usage

1. Edit fields and click "Save".
2. Settings are **cached for 60 seconds** — refresh the page after saving to apply.
3. An empty field means the system default is used (shown as the field hint).

> All changes are recorded in the audit log.
