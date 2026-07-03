---
title: Email Templates
parent: Admin
nav_order: 9
---

# Email Templates

Path: `/admin/templates`

Access: `super_admin`, or a member granted the "Email Templates" (`email_templates`) feature.

---

## What this page does

Manages reusable email templates (subject, body, and attachments) for sending mail. Templates are listed with name, subject, created date, and attachment count; click a row to expand and preview the body (HTML sanitized via DOMPurify).

---

## Adding / editing a template

Click "Add template" or the pencil icon on a row to open the editor dialog:

- **Name** (required) and **subject**.
- **Body**: a WYSIWYG (TipTap) editor.
- **AI generate**: type a description and the AI produces body content into the editor (existing body is used as a reference).
- **Attachments**: upload files (max 5 MB each); when editing an existing template, uploads are saved immediately, while for a new template they are written together when you save the template.

---

## Deleting a template

Click the trash icon on a row and confirm inline to delete.

---

## Notes

- Both the body preview and sending go through sanitization to avoid unsafe HTML.
- Attachments are uploaded to Storage; deleting an attachment also removes it from the template.
