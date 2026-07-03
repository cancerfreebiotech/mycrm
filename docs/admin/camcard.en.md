---
title: Card Import Review
parent: Admin
nav_order: 5
---

# Card Import Review

Path: `/admin/camcard`

Access: `super_admin`, or a member granted the "Card Import" (`camcard`) feature.

---

## What this page does

Business cards imported in bulk (CamCard / 名片王 files) land in a review queue after OCR, and are only written into real contacts once a human confirms them. The queue is grouped by **company** (companies with more cards come first), 20 per page, with prev/next and jump-to-page.

---

## Filtering and sorting

The filter bar can be combined:

- **Search**: type a keyword (auto-queries about 0.4 s after typing).
- **Country**: TW / JP / SG / HK / CN / US.
- **Reviewer**: filter by an assigned reviewer label, or pick "Unassigned".
- **Has duplicate**: only cards the system flagged as possible duplicates.
- **Has email**: only cards that contain an email.
- **Sort**: newest / oldest.
- A "Clear" button appears when any filter is active.

---

## Reviewing each card

Each card shows front/back thumbnails (click to enlarge) and the recognized fields. Four actions:

| Button | Behavior |
|--------|----------|
| Add | Creates a new contact using the current importance / language / tags. If the card is flagged as an exact-email duplicate, this button is locked — use Merge or Skip instead. |
| Edit | Opens a form to fix recognized fields (name, company, title, email, phone, address, website, social links, meeting info, etc.); saving updates the card. |
| Merge | Merges into an existing contact (see below). |
| Skip | Skips the card without creating a contact. |

---

## Importance, language, tags

Below each card you can set:

- **Importance**: H / M / L (default M).
- **Language**: 中 / EN / 日 (pre-guessed from the card's country code).
- **Tags**: pick contact tags to attach.

These are applied when you Add or batch-confirm the card.

---

## Merging into an existing contact

Clicking Merge opens a dialog where you can search existing contacts (a detected duplicate is pre-selected automatically). After choosing a target there are two modes:

- **Fill blanks only**: fill only the fields that are currently empty on that contact.
- **Overwrite**: overwrite existing fields with the card's data.

The dialog lists the merge rules.

---

## Batch operations

- **Add whole group**: on a company group header, confirm every "non-duplicate" card in that group at once.
- **Confirm selected**: non-duplicate cards are auto-selected; the floating bottom bar shows the count and confirms them in batch (with a progress bar).
- **Assign reviewer**: from the floating bar, enter a reviewer label (e.g. PO, Eva) to apply to the selected cards.
- **Batch meeting time**: apply the "meeting info / meeting date" to every card on the current page at once.

---

## Backdating and meeting date

When you Add, you can set a **backdate** that is written as the contact's creation time. It defaults to `2000-01-01` so that a large batch of old cards does not crowd the "recently added" cluster on the contacts page. This setting is not remembered — it resets on every page reload.

---

## Notes

- Two duplicate types are flagged: **exact email match** (locks Add — forces Merge or Skip) and **similar name** (warning only, Add still allowed).
- The reviewer's name is recorded on confirm, so you can trace who imported each card.
- Card images live in a private bucket; thumbnails are short-lived signed URLs.
