---
title: Admin
nav_order: 5
has_children: true
---

# Admin

> This area contains system administration features; most are limited to `super_admin`. Since v2.3, super_admin can grant selected features to regular members individually via [User Management](users.md); members who are not granted a feature will not see the corresponding item in the sidebar.

**Grantable to regular members:** Tags, Unassigned Notes, Email Templates, Prompts, Countries, Newsletter, Failed Scan Review, Duplicate Contacts, Card Import, Trash, Export Contacts, Bulk Email, User Management (MFA reset / Telegram edit only).

**Reports** is open to all members, who each manage their own schedules; super_admin can see all schedules.

**Super_admin only:** AI Models, System Health, MCP Activity, MCP Tokens, Email Recovery, Shared Emails, Feedback, Suppressions, DSAR Lookup, Newsletter Overview.

| Feature | Description |
|---------|-------------|
| [User Management](users.md) | Manage member accounts, roles, feature grants, MFA reset, Telegram ID, Teams binding status, and maintenance mode |
| [Tag Management](tags.md) | Add, rename, and delete contact tags; mark a tag as an Email blacklist |
| [AI Models](models.md) | Configure AI providers (endpoints) and available models |
| [Email Templates](templates.md) | Manage prompt templates for AI-generated emails |
| [Prompts](prompts.md) | Configure system prompts for card recognition and the AI assistant (blank uses system defaults) |
| [Country Management](countries.md) | Maintain the country list (ISO code, multilingual names, flag emoji, enabled status) |
| Newsletter | Subscriber management / campaign editor / sending / PDF export / RSS feed for Substack auto-drafts |
| [Reports](reports.md) | Generate interaction-log reports (JSON preview or Excel) and scheduled sending |
| [Card Import Review](camcard.md) | Batch-import business cards and review OCR results grouped by company |
| [Duplicate Contact Review](duplicates.md) | Find and merge duplicate contacts |
| [Failed Scan Review](failed-scans.md) | Review cards that failed OCR (no name detected); manually create a contact then mark as reviewed |
| Unassigned Notes | View Bot notes not yet linked to any contact |
| [Trash](trash.md) | Restore or permanently delete removed contacts |
| [Email Recovery](email-recovery.md) | For contacts with bounced/invalid emails, find their post-job-change card and replace the email in one click |
| [Shared-email Contacts](shared-emails.md) | Find contacts where 2+ records share one email (couples, family, shared inboxes) |
| [Feedback Management](feedback.md) | Review and manage feedback submitted by users |
| [System Health](health.md) | View the health status of external services and system components |
| [MCP Activity Log](mcp-activity.md) | View AI assistant (MCP) operation logs |
| [MCP Tokens](mcp-tokens.md) | Manage access tokens for external agents (plaintext shown only once) |
| [Audit Log](audit-log.md) | View the audit log of privileged actions such as role changes and deletions; filter by actor / action / date and export to CSV |
| [Org Settings & Branding](org-settings.md) | Company-wide name, login domains, newsletter branding, feedback-notification recipient, and module toggles (kill-switches for Hunter enrichment and the AI assistant) |
| Suppressions | Enter any email to instantly see "can we send, and why not", aggregating five suppression sources (unsubscribes, blacklist, bounces, etc.) |
| DSAR Lookup | Aggregate all related contacts (including deleted) and personal-data footprint by email; export in one click, with every lookup audited |
| Newsletter Overview | Open/click trend of the last 12 sends, per-list health (incl. 180-day non-openers), and subscriber / unsubscribe / blacklist totals |
