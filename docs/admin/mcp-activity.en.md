---
title: MCP Activity Log
parent: Admin
nav_order: 17
---

# MCP Activity Log

Path: `/admin/mcp-activity` (`super_admin` only)

---

## What this page does

Review the log of operations external AI agents (via MCP tokens) performed on the system, to audit what an agent did. It loads the most recent 100 entries by default; click "Refresh" at the top right to reload.

Three stat cards at the top: total, success, failure.

---

## Filtering and viewing

- **Tool**: show only operations of a specific tool.
- **Status**: all / only success / only failure.

Table columns: time, tool, status (ok/fail), token, actor, IP hash, and expandable arguments / error message. Clicking "Expand" shows that entry's call arguments (JSON); failures also show the error message.

---

## Notes

- Arriving here via a token's activity link on the "MCP Tokens" page pre-filters by that token's `token_id`.
- This page is super_admin only.
