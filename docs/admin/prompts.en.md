---
title: Prompts
parent: Admin
nav_order: 10
---

# Prompts

Path: `/admin/prompts`

Access: `super_admin`, or a member granted the "Prompts" (`prompts`) feature.

---

## What this page does

Configures the system prompts used by the various AI features. What you set here is an **organization-level** override; leaving a prompt blank uses the built-in system default.

Configurable prompts:

| Item | Used for |
|------|----------|
| Card recognition | OCR when uploading cards via Bot / Web |
| Task parsing | Parsing natural language into tasks |
| Email generation | AI email content (marked "user-editable") |
| Docs generation | AI document generation |
| Meeting parsing | Parsing meeting notes |

---

## Steps

1. Type a custom prompt into the text box of the relevant item.
2. Click "Save". **Saving with the box empty** removes the override and reverts to the system default.
3. Clicking "Reset to default" clears the text box (it does not take effect until you save).
4. When an item is using the default (empty box), the built-in default prompt is shown below for reference.

---

## Notes

- Changing a prompt affects that feature's AI output quality; make small adjustments and observe the results.
- "Email generation" is marked user-editable; the others are system-level settings.
