---
title: Admin
nav_order: 5
has_children: true
---

# Admin

> This area contains system administration features; most are limited to `super_admin`. Since v2.3, super_admin can grant selected features to regular members individually via [User Management](users.md); members who are not granted a feature will not see the corresponding item in the sidebar.

**Grantable to regular members:** Tags, Email Templates, Prompts, Countries, Newsletter, Failed Scan Review, Duplicate Contacts, Card Import, Trash, User Management (MFA reset / Telegram edit only).

**Reports** is open to all members, who each manage their own schedules; super_admin can see all schedules.

**Super_admin only:** AI Models, System Health, MCP Activity, MCP Tokens, Email Recovery, Shared Emails, Feedback.

| Feature | Description |
|---------|-------------|
| User Management | Manage member accounts, roles, feature grants, MFA reset, Telegram ID, Teams binding status, and maintenance mode |
| Tag Management | Add, rename, and delete contact tags; mark a tag as an Email blacklist |
| AI Models | Configure AI providers (endpoints) and available models |
| Email Templates | Manage prompt templates for AI-generated emails |
| Prompts | Configure system prompts for card recognition and the AI assistant (blank uses system defaults) |
| Country Management | Maintain the country list (ISO code, multilingual names, flag emoji, enabled status) |
| Newsletter | Subscriber management / campaign editor / sending / PDF export / RSS feed for Substack auto-drafts |
| Reports | Generate interaction-log reports (JSON preview or Excel) and scheduled sending |
| Card Import Review | Batch-import business cards and review OCR results grouped by company |
| Duplicate Contact Review | Find and merge duplicate contacts |
| Failed Scan Review | Review cards that failed OCR (no name detected); manually create a contact then mark as reviewed |
| Unassigned Notes | View Bot notes not yet linked to any contact |
| Trash | Restore or permanently delete removed contacts |
| Email Recovery | For contacts with bounced/invalid emails, find their post-job-change card and replace the email in one click |
| Shared-email Contacts | Find contacts where 2+ records share one email (couples, family, shared inboxes) |
| Feedback Management | Review and manage feedback submitted by users |
| System Health | View the health status of external services and system components |
| MCP Activity Log | View AI assistant (MCP) operation logs |
| MCP Tokens | Manage access tokens for external agents (plaintext shown only once) |
