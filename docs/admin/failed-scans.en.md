---
title: Failed Scan Review
parent: Admin
nav_order: 7
---

# Failed Scan Review

Path: `/admin/failed-scans`

Access: `super_admin`, or a member granted the "Failed Scan Review" (`failed_scans`) feature.

---

## What this page does

Business cards uploaded via the Bot whose name the AI could not recognize land here, so an admin can handle them manually and none get lost.

By default only unreviewed items are shown; tick "Show reviewed" to also see processed records (reviewed ones are dimmed and show the reviewer and date).

---

## Each item

- On the left is a thumbnail of the card image; click it or "Open image" to view it larger (private bucket, so the link is a short-lived signed URL).
- The uploader and upload time are shown.

---

## Steps

1. Look at the card image and decide whether a contact is needed.
2. Click "→ Create contact"; it jumps to the new-contact page carrying this card's image and source info, where you fill in the details manually and save.
3. Return here and click "Mark done" to remove the item from the queue.

---

## Notes

- "Create contact" and "Mark done" are two separate steps; after creating the contact you still need to come back and mark it done so it leaves the queue.
- Marking done records the reviewer's email and the time.
