# mycrm MCP Server — v2.0 Plan

**Status**: Locked design, not yet implemented.
**Last updated**: 2026-06-01
**Depends on**: v1 (shipped in v6.9.0 + v6.9.1 — `/api/mcp` with 5 read tools, `agent_actions` audit log, `/admin/mcp-activity` viewer)

This doc captures the v2.0 design after iterating with Po. Open the
top-level "Open questions" section before starting work — those still
need decisions.

---

## What v2.0 delivers

| Capability | Status in v1 | Status in v2.0 |
|---|---|---|
| Read tools (5) | ✅ shipped | ✅ kept |
| Write tools | ❌ | ✅ 4 new tools |
| Single shared bearer token | ✅ via `MCP_AGENT_TOKEN` env | ❌ replaced |
| Per-token rows in DB | ❌ | ✅ `agent_tokens` table |
| Per-token scopes | ❌ all-or-nothing | ✅ 6 scopes |
| Audit log per-call | ✅ tool + args | ✅ + `token_id` + `acting_as` |
| Admin token mgmt UI | ❌ | ✅ `/admin/mcp-tokens` |
| Activity viewer | ✅ `/admin/mcp-activity` | ✅ adds filter by token / acting user |

---

## Token model

### Two independent concepts

| Concept | Field | When set |
|---|---|---|
| **Administrative — who this token is given to** | `agent_tokens.assigned_to` (UUID FK users) | Issued by super_admin (required) |
| **Administrative — what it's for** | `agent_tokens.description` (text) | Issued by super_admin (optional but recommended) |
| **Runtime — who is making this call right now** | `X-Acting-User` HTTP header | Sent by agent on each request (per-call dynamic) |

**Why split**: usually `assigned_to == X-Acting-User`, but separating allows
shared bots (one token given to "Sales team lead", but the bot forwards
calls on behalf of different team members per request).

### `agent_tokens` schema

```sql
CREATE TABLE public.agent_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,                              -- short label, e.g. "Eva's Slack bot"
  description       TEXT,                                       -- free-form purpose
  assigned_to       UUID NOT NULL REFERENCES public.users(id),  -- who this token is given to
  token_hash        TEXT NOT NULL UNIQUE,                       -- sha256(plaintext_token)
  prefix            TEXT NOT NULL,                              -- "mcp_abc12345" (first 12 chars, display only)
  scopes            TEXT[] NOT NULL,
  created_by        UUID REFERENCES public.users(id),           -- super_admin who issued
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,                                -- NULL = no expiry
  last_used_at      TIMESTAMPTZ,
  disabled_at       TIMESTAMPTZ,
  disabled_reason   TEXT
);

CREATE INDEX idx_agent_tokens_token_hash ON public.agent_tokens (token_hash);
CREATE INDEX idx_agent_tokens_assigned_to ON public.agent_tokens (assigned_to);
```

### Token format

- Plaintext: `mcp_<48 random base32 chars>` — total ~52 chars
- Stored: `token_hash = sha256(plaintext)`, plus `prefix = plaintext[0:12]`
  for display in lists (e.g., `mcp_abc12345…`)
- Shown to issuer **only once at creation** — never retrievable again

### Issuance permission

**super_admin only.** Other users request via Slack/in-person; super_admin
issues from `/admin/mcp-tokens`.

(Future: if token volume grows, add a `mcp_tokens` grantable feature for
power users to issue tokens themselves.)

---

## Auth flow per request

```
1. Read `Authorization: Bearer mcp_xxxxx`
2. Compute sha256(token), lookup agent_tokens by token_hash
3. Reject if: not found / disabled_at IS NOT NULL / expires_at < now()
4. Read `X-Acting-User` header (email)
5. Lookup users.id by email → acting_as_user_id
6. If header missing/invalid:
     - read tools  → allow (acting_as = NULL)
     - write tools → 403 ("X-Acting-User required for write operations")
7. For tools/call: check required scope ⊆ token.scopes
8. Execute tool
9. UPDATE agent_tokens SET last_used_at = now() WHERE id = …
10. INSERT INTO agent_actions (token_id, acting_as, tool_name, …)
```

---

## Scopes (6 total)

| Scope | Used by tool |
|---|---|
| `read:contacts` | `search_contacts`, `get_contact` |
| `read:newsletter` | `list_newsletter_lists`, `search_subscribers_in_list` |
| `read:tags` | `list_tags` |
| `write:contacts` | `update_contact` |
| `write:notes` | `add_contact_note` |
| `write:newsletter` | `add_to_newsletter_list`, `tag_contact` |

### Token scope model — independent (Plan B)

Token scopes are **independent of `assigned_to` user's `granted_features`**.
super_admin picks scopes explicitly when issuing.

**Issuance UI warning**: if any of the picked scopes exceed what
`assigned_to` user has access to via mycrm's role/granted_features, show:

```
⚠ Eva (assigned_to) doesn't currently have `newsletter` permission in mycrm,
  but you're granting `write:newsletter` to her token. The token will still
  work (scopes are independent), but Eva couldn't perform the same action
  through the mycrm UI. Continue?
```

This keeps the principle of "least privilege" visible without forcing
restriction.

---

## New write tools

| Tool | Required scope | Args | DB effect |
|---|---|---|---|
| `update_contact(id, patch)` | `write:contacts` | id, patch (object) | UPDATE contacts SET <whitelist fields> + last_updated_at + last_updated_by + last_updated_via_mcp = true |
| `add_contact_note(contact_id, body, meeting_date?)` | `write:notes` | contact_id, body, meeting_date? | INSERT interaction_logs (type='note', created_by = acting_as, via_mcp = true) |
| `add_to_newsletter_list(list_id, email, first_name?, last_name?)` | `write:newsletter` | list_id, email, first_name?, last_name? | Reuse from-contacts find-or-create logic. INSERT newsletter_subscribers (via_mcp=true), INSERT newsletter_subscriber_lists (via_mcp=true) |
| `tag_contact(contact_id, tag_id, action)` | `write:newsletter` | contact_id, tag_id, action ('add'\|'remove') | INSERT/DELETE contact_tags (via_mcp=true on insert) |

### `update_contact` whitelist

**OPEN QUESTION** — needs Po's final list. Proposed:

Allowed: `name`, `name_en`, `name_local`, `company`, `company_en`,
`company_local`, `job_title`, `department`, `phone`, `mobile`,
`second_email`, `linkedin_url`, `facebook_url`, `address`, `address_en`,
`country_code`, `met_at`, `met_date`, `referred_by`, `notes`, `importance`,
`language`, `hospital`.

**Explicitly forbidden** (no MCP override):
- `email` (primary identity — too risky)
- `email_status`, `email_opt_out` (compliance-relevant)
- `deleted_at`, `deleted_by` (soft-delete is admin-only)
- `created_by`, `created_at` (immutable)
- `card_img_url`, `card_img_back_url` (only OCR pipeline writes)
- `id`, `extra_data` (system fields)

---

## Schema changes (v2.0 migration)

```sql
-- 1. agent_tokens (defined above)
CREATE TABLE public.agent_tokens (…);

-- 2. via_mcp flag on writable tables
ALTER TABLE interaction_logs            ADD COLUMN via_mcp BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE newsletter_subscribers      ADD COLUMN via_mcp BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE newsletter_subscriber_lists ADD COLUMN via_mcp BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contact_tags                ADD COLUMN via_mcp BOOLEAN NOT NULL DEFAULT false;

-- 3. contacts gets update tracking (currently has no updated_at/by at all)
ALTER TABLE contacts ADD COLUMN last_updated_at      TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN last_updated_by      UUID REFERENCES public.users(id);
ALTER TABLE contacts ADD COLUMN last_updated_via_mcp BOOLEAN NOT NULL DEFAULT false;

-- 4. agent_actions adds attribution
ALTER TABLE agent_actions ADD COLUMN token_id  UUID REFERENCES public.agent_tokens(id) ON DELETE SET NULL;
ALTER TABLE agent_actions ADD COLUMN acting_as UUID REFERENCES public.users(id)        ON DELETE SET NULL;

-- 5. RLS for agent_tokens
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_tokens_read  ON public.agent_tokens FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY agent_tokens_write ON public.agent_tokens FOR ALL    TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
```

---

## Backward compat with v1

- `MCP_AGENT_TOKEN` env var **kept temporarily as fallback** for read-only
  tools (acting_as = NULL allowed)
- Write tools **require** v2 token (`agent_tokens` row with matching hash)
- After all consumers migrate → remove env var fallback in v2.1

---

## New admin UI

### `/admin/mcp-tokens` (super_admin only)

**List view**:
- Columns: Name · prefix · assigned_to · scopes (chips) · last_used_at · expires_at · status (active/disabled/expired)
- Row actions: 停用 / 啟用 / 刪除 / 看 audit log (links to `/admin/mcp-activity?token_id=…`)

**Create modal**:
- Name (required short label)
- Assigned to (required — dropdown of `public.users` active)
- Description (free-form textarea)
- Scopes (checkbox group, 6 options)
- Expiry: radio — 24h / 30d / 1y / never
- On submit: generate plaintext token, show **once** with copy button,
  then close

**Warning on submit if `scopes > assigned_to user's permissions`** — see "Issuance UI warning" above.

### `/admin/mcp-activity` (existing, v2 additions)

- Add column "身份 (acting_as)" + "Token name"
- Add filter: by token / by acting_as user
- Add CSV export

### Sidebar

Add to `superAdminItems` in `(dashboard)/layout.tsx`:
```ts
{ href: '/admin/mcp-tokens', label: 'MCP Tokens', icon: KeyRound }
```

---

## Rate limiting

**OPEN QUESTION** — needs Po's decision on limits.

Proposed: per-token, X requests/min. Default `60/min` per token.

Implementation options (smallest → biggest):
1. Count `agent_actions WHERE token_id = X AND created_at > now() - 1 min` — simple, no extra infra, costs 1 query per call
2. Upstash Redis via Vercel Marketplace — proper sliding window
3. Vercel Edge Config + custom — overkill

Recommend #1 for v2.0 (simple, good enough at our scale).

---

## Implementation phases

| Phase | Scope | Est. effort |
|---|---|---|
| **v2.0a — DB + auth core** | Schema migration, `agent_tokens` CRUD API, auth flow refactor (token + X-Acting-User), v1 fallback | 2 hr |
| **v2.0b — Write tools** | 4 tools + scope checks + `via_mcp` writes | 2 hr |
| **v2.0c — Admin UIs** | `/admin/mcp-tokens` create/list/disable + activity viewer attribution columns | 2-3 hr |
| **v2.0d — Rate limit + polish** | Per-token rate limit, audit log filters, docs update | 1 hr |

Total estimate: **7-8 hours** across phases.

---

## Open questions (decide before starting v2.0)

1. **`update_contact` whitelist** — confirm/edit the field list above
2. **Rate limit** — 60/min per token OK? Different limits per scope?
3. **Token expiry default** — 30d? 90d? `never`? (UI radio has all options;
   this is the default selected one)
4. **v2.1 ideas to defer** — see below

---

## v2.1+ ideas (deferred)

- MCP `resources/list` + `resources/read` — expose schema docs / tag list / newsletter list as resources
- MCP `prompts/list` — canned prompts for common agent operations
- SSE streaming for long queries (export tools)
- OAuth 2.0 flow (replace shared header-based identity with real user auth)
- Webhook (server → agent) for new contact / new note events
- Per-token IP allowlist
- Token rotation reminder (notify when token nearing expiry)

---

## Pre-flight before v2.0 work starts

1. Ship v1 first (commit + push v6.9.0/v6.9.1, set `MCP_AGENT_TOKEN` in Vercel env, test read tools from a real Claude Code agent for at least a few days)
2. Po answers the 4 Open Questions above
3. Start v2.0a (DB + auth refactor) on a fresh branch
