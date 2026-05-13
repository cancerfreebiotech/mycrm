# Supabase Migration Toolkit

Migrates myCRM from the old Free-tier Supabase project (`zaqzqcvsckripotuujep` on
`cancerfreebio@gmail.com`'s account) to a new project in the Pro org on
`po@cancerfree.io`'s account.

## Prerequisites

1. `.env.local` must contain `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` of the **source** project.
2. `.env.local.tmp` must contain `SUPABASE_MGMT_TOKEN` + `VERCEL_TOKEN`.
3. Source project ref defaults to `zaqzqcvsckripotuujep`; target org defaults to `uwmykvffywizbxgkgkpk` (Pro). Override via env vars if needed (see `lib/env.mjs`).

## Files

| File | Purpose |
|---|---|
| `lib/env.mjs`      | Loads env from `.env.local` + `.env.local.tmp` |
| `lib/state.mjs`    | Resumable state in `artifacts/migration-state.json` |
| `lib/clients.mjs`  | Supabase SDK + Mgmt API + Vercel API |
| `lib/log.mjs`      | Phase-prefixed logger |
| `00-snapshot.mjs`  | Read-only. Dumps source state to `artifacts/snapshot.json` |
| `01-create-target.mjs` | Creates new Supabase project (idempotent via state) |
| `02-extensions.mjs` | Installs pg extensions on target |
| `03-schema.mjs`    | Dumps + replays all 94 migrations from source |
| `04-auth-users.mjs` | Inserts auth.users (no password — users reset on first login) |
| `05-data.mjs`      | Bulk-copies all 41 public tables in FK order, ~48k rows |
| `06-vault-secrets.mjs` | Writes `SUPABASE_URL` + `SUPABASE_ANON_KEY` to vault |
| `07-edge-functions.mjs` | Deploys `send-report` / `send-reminder` / `send-newsletter` |
| `08-cron-jobs.mjs` | Recreates 3 `pg_cron` jobs (rewrites old ref + anon key) |
| `09-storage.mjs`   | Copies ~7.6k storage objects (~890 MB) across 3 buckets |
| `10-rewrite-urls.mjs` | UPDATEs `card_img_url` etc. to use new project ref |
| `11-smoke-test.mjs` | Row count diff + sample 10 contacts + storage HEAD test |
| `12-cutover.mjs`   | Updates 3 Vercel env vars + triggers production redeploy |
| `run-all.mjs`      | Orchestrator (phases 00 → 11; 12 runs manually) |

## Workflows

### Dry-run everything (recommended first)

```bash
node scripts/supabase-migration/run-all.mjs --dry-run
```

This prints what each phase would do without modifying anything except phase 00,
which is already read-only and produces `artifacts/snapshot.json`.

### Full migration

```bash
# Phases 00-11 — safe to run unattended (no production impact)
node scripts/supabase-migration/run-all.mjs

# Review smoke test output, then manually:
node scripts/supabase-migration/12-cutover.mjs --confirm
```

Phase 12 changes production. It is intentionally NOT in `run-all.mjs`.

### Resume from a specific phase

```bash
node scripts/supabase-migration/run-all.mjs --from=05
```

### Re-run a single phase

```bash
node scripts/supabase-migration/05-data.mjs
```

Phases are idempotent — `ON CONFLICT DO NOTHING`, `upsert` semantics, and
checkpoint state ensure re-runs are safe.

## State & artifacts

All state lives in `scripts/supabase-migration/artifacts/`:

```
artifacts/
├── migration-state.json     # phase completion + key target info
├── snapshot.json            # phase 00 — full source state
├── schema-dump.json         # phase 03 — all 94 migrations dumped
├── schema-apply.log         # phase 03 — per-migration apply log
├── target-db-password.txt   # phase 01 — keep private!
├── storage-progress.json    # phase 09 — per-bucket progress
└── vercel-env-backup.json   # phase 12 — old env values for rollback
```

`artifacts/` is gitignored via the script directory.

## Rollback (after cutover)

If something is wrong after Vercel redeploy:

```bash
# Re-apply old env values from backup, redeploy
node scripts/supabase-migration/rollback.mjs  # TODO if needed
```

For now, manually: read `artifacts/vercel-env-backup.json` and PATCH each entry's
value back via Vercel API. Then trigger redeploy. Old Supabase project stays
alive — do NOT delete it for at least 1 month.

## Caveats

- **Passwords cannot be migrated** (Supabase encrypts hashes per-project). All 21 users
  will need to use "Forgot password" on first login.
- **TOTP secrets cannot be migrated**. 16 users with MFA will be prompted to
  re-bind their authenticator app on first login.
- **Migration window**: phases 00-11 don't touch production, but any rows written
  to the OLD project between snapshot time and cutover time will NOT be in the
  new project. Schedule a maintenance window (~45-60 min) or run a final delta
  sync before phase 12.
- **`.env.local.tmp` contains live API tokens** — delete after migration.
