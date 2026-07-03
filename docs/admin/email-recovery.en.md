---
title: Email Recovery
parent: Admin
nav_order: 12
---

# Email Recovery

Path: `/admin/email-recovery`

Access: `super_admin`, or a member granted the "Duplicate Contacts" (`duplicates`) feature.

---

## What this page does

For contacts whose email has bounced or become invalid, it finds a newer card the same person left after changing jobs (with a new email), and replaces the old contact's email in one click.

The stats at the top show: total bounced/invalid contacts, and how many of them "have a candidate new email". You can switch between "With candidates" and "All".

---

## Each item

- The broken email and its status are highlighted, along with the bounce event's time and reason.
- If a candidate is found, it is listed in green with the person's name, company, new email, and created date.

---

## Replacing the email

1. Click "Replace with this email" on a candidate to bring the candidate's email into the old contact (optionally merging the candidate contact in).
2. Or type a new email in the "Manual input" field and click "Replace".
3. A confirmation appears before replacing. Completed items are dimmed and marked "Replaced".
4. Once you've processed some items, a reload button appears below to refresh the list.

---

## Notes

- Replacing an email modifies contact data, so it prompts for confirmation.
- Candidates are matched from clues like name/company; still confirm manually that it is the same person before replacing.
