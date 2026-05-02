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
3. **Add to Project Knowledge** (optional but recommended):
   - `tone-samples/2026-04-zh.md`, `2026-04-en.md`, `2026-04-ja.md` — past newsletters per language for tone reference
   - Update `assets/brand-info.md` with current company facts before zipping
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
