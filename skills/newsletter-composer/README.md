# newsletter-composer (Claude.ai Skill)

A Claude.ai web Skill for composing the cancerfree.io monthly newsletter inside a Claude Project. Outputs a zip that myCRM imports.

## Workflow

```
            ┌──────────────── Claude Project ───────────────┐
            │  Skill: newsletter-composer                    │
            │  Knowledge: brand-info.md, tone-samples/*      │
            │                                                │
  整月  →   │  Long-running conversation                     │   →  zip
  你貼  →   │  Capture mode: text + photos + voice           │      manifest.json
  素材       │  Refine mode: tweak prose, reorder            │      images/*.jpg
            │  Package mode: refine zh + translate + zip     │
            └────────────────────────────────────────────────┘
                                                                      │
                                                                      ▼
                                            POST /api/newsletter/import (myCRM)
                                                                      │
                                                                      ▼
                                            newsletter_campaigns × 3 langs (draft)
```

## Install in Claude.ai

1. **Build the upload zip** from this folder:
   ```sh
   cd skills/newsletter-composer
   zip -r newsletter-composer.zip SKILL.md manifest-schema.json assets examples
   ```
2. **Upload to a Claude Project**:
   - claude.ai → New Project → name it "Newsletter Composer"
   - Project settings → Skills → upload `newsletter-composer.zip`
3. **Upload tone samples to Project Knowledge** (the past newsletters in `tone-samples/`):
   - Drag the contents of `skills/newsletter-composer/tone-samples/` into the Project's Knowledge files
   - These are extracted from past newsletters (2026-01 through 2026-04, three languages each) — they are the gold standard for voice
   - Update `assets/brand-info.md` with current company facts before zipping the skill
4. **Add team members** to the Project so anyone on staff can drop content

## Monthly usage

- Open the Project, start a new conversation titled like `Newsletter 2026-05`
- Throughout the month: paste events, photos, news links, voice transcripts
- The skill responds in capture mode: short confirmations, building a draft
- Anytime: `/draft` to see the current state
- Month-end: `/package` → skill refines, translates, bundles, gives you a download link

## Import to myCRM

1. Download the zip
2. Go to `https://crm.cancerfree.io/admin/newsletter/import`
3. Drop the zip → myCRM uploads images, renders the skeleton, creates 3 draft campaigns (zh/en/ja)
4. Review each draft in `/admin/newsletter/campaigns`, then schedule send

## Files in this skill

| File | Purpose |
|---|---|
| `SKILL.md` | Behavior instructions for Claude (capture / refine / package modes) |
| `manifest-schema.json` | JSON schema the output manifest must conform to |
| `examples/example-manifest.json` | Realistic example of a full manifest |
| `assets/brand-info.md` | Brand voice, company facts, contact info — fill in before use |

## Editing the skill

This source lives in the myCRM repo (`skills/newsletter-composer/`) so changes are version-controlled. After editing, re-zip and re-upload to the Claude Project to update.

## Updating tone samples (when new newsletters are sent)

When a new monthly newsletter goes out, drop the HTML exports into `C:\Users\PoChen\Downloads\newsletter\` (filename pattern: `YYMM 中文電子報.txt` / `YYMM 英文電子報.txt` / `YYMM 日文電子報.txt`) and run:

```sh
node scripts/extract-tone-samples.js
```

The script regenerates everything in `skills/newsletter-composer/tone-samples/` from the source HTML. Then upload the new files to the Claude Project Knowledge.
