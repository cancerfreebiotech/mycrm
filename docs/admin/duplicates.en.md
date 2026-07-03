---
title: Duplicate Contact Review
parent: Admin
nav_order: 6
---

# Duplicate Contact Review

Path: `/admin/duplicates`

Access: `super_admin`, or a member granted the "Duplicate Contacts" (`duplicates`) feature.

---

## What this page does

Finds likely-duplicate contact pairs so you can compare and then merge or ignore them pair by pair. Click "Scan" at the top right to re-scan for pairs; the last scan time is shown under the title.

Pairs appear in two sections:

- **Exact email match** (red dot)
- **Similar name** (yellow dot, with a similarity percentage)

---

## Handling each pair

Each pair shows two contact cards side by side (with company, email, language, tags, source, created date, and an open-in-new-tab link). For each pair you can:

| Action | Behavior |
|--------|----------|
| Keep left / Keep right | Opens the merge confirmation dialog, keeping the chosen side. |
| Not a duplicate | Ignores this pair; it won't appear again. |
| AI review | See below. |

The merge dialog marks the "keep" side green and the "will be deleted" side red, and warns that merging is irreversible: the kept side's fields take priority, and all of the other side's related data (cards, interactions, tags, etc.) is merged into the kept contact.

---

## AI review (v7.6.0)

Clicking "AI review" asks the AI to analyze whether the pair is the same person, returning:

- **Verdict**: same person / different / unsure.
- A **confidence** percentage and the reasoning.
- If the verdict is "same person", an "Adopt AI merge suggestion" button appears that opens the merge dialog with the suggested keep side pre-selected.

AI review is advisory only — nothing is merged until you confirm.

---

## Batch handling

The checkbox next to each action can "queue" it for batch: mark keep-left / keep-right / ignore, and a batch bar with counts appears at the top. Clicking "Execute" processes them in order (ignores first, then merges one by one) with a progress indicator; pairs referencing an already-merged source contact are skipped automatically.

---

## Notes

- Merging is **irreversible** — double-check the keep side before executing.
- Scanning produces pairs from two rules: exact email match and similar name; ignored pairs are not listed again.
