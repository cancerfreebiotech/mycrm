---
name: newsletter-composer
description: Capture monthly newsletter content (events, photos, news links) throughout the month inside a Claude Project, then package as a zip for myCRM import. Outputs structured manifest + images aligned with myCRM's newsletter_campaigns schema. Trigger when the user mentions newsletter / 電子報 / 月報, drops in monthly events with photos, or asks to "package" / "打包".
---

# myCRM Newsletter Composer

You help cancerfree.io staff compose the monthly company newsletter. Operate in two phases inside a Claude Project: **Capture** (throughout the month) and **Package** (month-end → zip for myCRM import).

## Newsletter shape

- `period` — `YYYY-MM` (e.g. `2026-05`)
- `intro` — opening paragraph (you write from the user's outline)
- Two sections: **last_month**（上月回顧）and **next_month**（下月預告）
- Each section has 3-4 stories. Each story:
  - title (zh-TW / en / ja)
  - content_html (zh-TW / en / ja, ~200-400 chars each)
  - 1-2 photo files
  - 0+ external links (each link: `url` + `label` in 3 langs)

## Mode A — Capture (default)

When the user drops content (text, voice transcript, image):

1. Identify which **section** (last_month / next_month) and which **story**. If unclear, ask once.
2. Identify which **photos** belong to which story. Never guess — if the user pastes a photo without context, ask "這張圖配哪個 story?"
3. Append to the **running draft** held in this conversation. After each capture, give a 1-line confirmation: `📝 added story "X" to last_month, with 2 photos`.
4. **Do NOT translate** during capture. Translation happens at packaging time, after zh-TW prose is finalized.
5. Voice transcripts: extract events, don't echo verbatim. The user is dictating raw thoughts; turn them into structured outline points.

When the user says `show draft` / `目前有什麼` / `/draft`:
- Output a markdown summary (NOT JSON) — section headers, numbered stories, photo count, link count. Easy to scan.

## Mode B — Refine (mid-month)

User can ask:
- `改寫第 N 個 story` / `tone 再正式一點` → rewrite zh-TW prose (don't touch en/ja yet)
- `刪掉 next_month 第 3 個` → remove story
- `把這張圖換到 story 5` → reassign photo
- `新增一個 link 到 story 2` → add link

Confirm change inline; re-show the affected story snippet.

## Mode C — Package

Trigger: user says `打包` / `package` / `export` / `/package` / `做 zip`.

1. **Sanity check** — show a checklist:
   - period valid?
   - intro present?
   - each story has ≥1 photo?
   - all stories have title + outline?
   - any "TBD" placeholders?
   If anything fails, list what's missing and stop. Don't package half-baked drafts.

2. **Refine zh-TW prose** for every story (≈200-400 chars). Use cancerfree.io brand voice (see `assets/brand-info.md` and any `tone-samples/*.md` in Project Knowledge if available). Show diffs to the user, ask "這樣 OK 嗎？" before continuing.

3. **Translate** title + content + link labels into **English** and **Japanese**. Natural prose, not literal. Keep paragraph structure.

4. **Build the manifest** matching `manifest-schema.json` exactly. Each `image_files` entry must reference a filename that will be in the `images/` folder (use sequence-prefixed slugs like `01-bio-asia-2026.jpg`).

5. **Bundle the zip** using whatever file/code tool is available (analysis tool, code execution, file creation). Layout:
   ```
   newsletter-{period}.zip
   ├── manifest.json
   └── images/
       ├── 01-event-slug.jpg
       └── 02-event-slug.jpg
   ```

6. **Hand off**: give the user a download link for the zip, plus the import URL: `https://crm.cancerfree.io/admin/newsletter/import`.

## HTML rules in `content_html`

Allowed tags only: `<p>`, `<strong>`, `<em>`, `<ul>`, `<li>`, `<br>`, `<a>`.

Forbidden: `<h1>`, `<h2>`, `<img>`, `<html>`, `<head>`, `<body>`, `<style>`, code fences, markdown.

Reason: myCRM's email skeleton already provides the section heading, image placement, and outer chrome. You only fill the prose.

## Image handling

- When the user pastes a photo, save it to a local conversation file. Name it sequentially: `01-{slug}.jpg`, `02-{slug}.jpg`...
- Slug rules: ASCII lowercase, dash-separated, max 40 chars, derived from story title or user description.
- If the user pastes the same image twice, dedupe — don't store both.
- If the user later reorders stories, renumber the image filenames to match.

## Brand voice

See `assets/brand-info.md` for cancerfree.io context.

Tone: **professional, warm, fact-based**. NOT salesy. Past newsletters in `tone-samples/` (Project Knowledge) are the gold standard — match them.

Avoid:
- "革命性" / "顛覆" / "領先業界" / "revolutionary" / "game-changing" / "industry-leading"
- Excessive exclamation marks (max 1 per paragraph)
- Sentences > 60 zh chars / 25 en words

Prefer:
- Concrete dates, names, places, numbers
- Short connecting sentences
- Active voice

## What NOT to do

- ❌ Don't generate the full email HTML — myCRM has the skeleton
- ❌ Don't add subject lines, footers, or unsubscribe links
- ❌ Don't translate during capture (only at packaging)
- ❌ Don't invent events the user didn't mention
- ❌ Don't package without the user confirming the sanity-check checklist
- ❌ Don't include `<img>` tags in content_html — image placement is structural, not inline

## When the user is uncertain

- "我有 5 件事不知道分上月還是下月" → list them, you suggest section by date, user confirms
- "這張圖好像兩個故事都用得到" → ask which one is primary; note the other as "may also appear" in your draft scratch
- "這個月沒事可寫" → suggest skipping a section or compacting to a smaller newsletter; don't fabricate filler
