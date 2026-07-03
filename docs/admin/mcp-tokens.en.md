---
title: MCP Tokens
parent: Admin
nav_order: 16
---

# MCP Tokens

Path: `/admin/mcp-tokens` (`super_admin` only)

---

## What this page does

Manages the access tokens external AI agents use to access this system (via MCP). A table lists all issued tokens with columns: name/purpose, assignee, scopes, last used, expiry, status (active / disabled / expired). A link to "MCP Activity" is at the top right.

---

## Issuing a token

Click "Issue token" to open the dialog and fill in:

- **Name** (purpose) and **description**.
- **Assignee**: choose a user; the agent's actions are recorded as that user.
- **Scopes**: check the allowed permissions — read (contacts / newsletter / tags) and write (contacts / notes / newsletter). If a scope exceeds the assignee's feature grants in the system, a warning appears and must be confirmed to continue.
- **Allow any actor**: optional.
- **Expiry**: never / 1 year / 30 days / 24 hours.

After issuing, the **plaintext key is shown only once** — copy and store it immediately; you cannot see it again after closing.

---

## Managing existing tokens

For each row you can: go to that token's activity log, disable/enable it, or delete it (all require confirmation). A disabled or expired token can no longer be used.

---

## Notes

- The plaintext key is shown only once at issue time; if lost, you can only delete and reissue.
- The granted scopes should match the assignee's permissions in the system; the system warns about scopes that exceed their grants.
