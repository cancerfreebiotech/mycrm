# mycrm MCP Server

mycrm exposes a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint
at `POST https://crm.cancerfree.io/api/mcp` so external Claude agents can query
the CRM (and, in future versions, update it).

> **v2 (v7.0.0)**: tokens are now issued per-agent from `/admin/mcp-tokens`
> (super_admin only) with scopes, expiry, and an assignee — not a single env
> var. The old `MCP_AGENT_TOKEN` env var still works as a **read-only**
> fallback. Write tools require a v2 token + an `X-Acting-User` header.

## Setup

### 1. Issue a token

Go to **`/admin/mcp-tokens`** → 發 Token. Pick:
- Name + 用途說明
- 發給誰用 (assignee)
- Scopes (read/write per area)
- Expiry (default 永久)

The plaintext token (`mcp_…`) is shown **once** — copy it immediately.

(Legacy fallback for read-only: set `MCP_AGENT_TOKEN` in Vercel env. Not
recommended for new agents — use a real scoped token.)

### 2. Connect a Claude Code agent

Edit `~/.claude/settings.json` (or project-level `.mcp.json`):

```json
{
  "mcpServers": {
    "mycrm": {
      "type": "http",
      "url": "https://crm.cancerfree.io/api/mcp",
      "headers": {
        "Authorization": "Bearer mcp_xxxxx",
        "X-Acting-User": "you@cancerfree.io"
      }
    }
  }
}
```

`X-Acting-User` is who writes get attributed to (`created_by` + `via_mcp=true`).

**Binding (default)**: a token's acting user is **locked to its assignee**.
If you send `X-Acting-User` matching the assignee (or omit it), writes are
attributed to that person. Sending a *different* user → request rejected. This
stops a token from attributing writes to someone else (e.g. super_admin).

**Shared-bot mode**: tick **「允許代任意使用者操作」** when issuing the token
(`allow_any_actor`). Then the bot may set `X-Acting-User` to any known user per
request — use this only for a trusted bot that acts on behalf of many people.

Restart Claude Code. The agent sees only the tools its token has scope for.

### 3. Connect from raw curl (testing)

```bash
TOKEN="..."

# List tools
curl -s https://crm.cancerfree.io/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Search contacts
curl -s https://crm.cancerfree.io/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_contacts","arguments":{"query":"chen","limit":5}},"id":2}'
```

## Tools

### Read (require read scopes)

| Tool | Scope | Description |
|------|-------|-------------|
| `search_contacts(query, limit?)` | `read:contacts` | Substring search across name (zh/en/local) + email + company. Excludes soft-deleted. Max 100. |
| `get_contact(id)` | `read:contacts` | Full contact details + tags + 5 most recent interaction logs. |
| `list_newsletter_lists()` | `read:newsletter` | All newsletter lists with member counts. |
| `search_subscribers_in_list(list_id, query?, limit?)` | `read:newsletter` | Subscribers in a list, optionally filtered. Max 500. |
| `list_tags()` | `read:tags` | All CRM tags + email-blacklist flag. |

### Write (require write scopes + `X-Acting-User`)

| Tool | Scope | Description |
|------|-------|-------------|
| `update_contact(id, patch)` | `write:contacts` | Update whitelisted contact fields. Rejects email/email_status/opt_out/deletion/system fields. Stamps last_updated_by + via_mcp. |
| `add_contact_note(contact_id, body, meeting_date?)` | `write:notes` | Add a note (interaction_logs type=note). |
| `add_to_newsletter_list(list_id, email, first_name?, last_name?)` | `write:newsletter` | Find-or-create subscriber + attach to list. |
| `tag_contact(contact_id, tag_id, action)` | `write:newsletter` | Add/remove a tag on a contact. |

`tools/list` only returns the tools the calling token has scope for.

## Auth model (v2)

- **Per-agent tokens** in `agent_tokens` (issued from `/admin/mcp-tokens`). Token compared by sha256 hash; checks not-disabled + not-expired.
- **Scopes**: token only runs tools whose required scope it holds.
- **`X-Acting-User` header**: resolves to a `public.users` row. Required for write tools (becomes `created_by`); optional for reads. **Default-bound to the token's assignee** — a mismatching header is rejected. Set `allow_any_actor` on the token to allow acting as any user (shared-bot mode).
- **Legacy fallback**: `MCP_AGENT_TOKEN` env var → read-only scopes, no acting user, no write.
- **Rate limit**: 120 requests/min per token.
- Missing/invalid token → 401; missing scope → error; write without acting user → error.

## Audit log

Every tool call writes a row to `public.agent_actions` with:
- `tool_name`
- `arguments` (JSONB — recorded verbatim, mind PII)
- `succeeded` + `error_message` if failed
- `created_at`

To review activity:

```sql
SELECT created_at, tool_name, arguments, succeeded, error_message
FROM agent_actions
ORDER BY created_at DESC
LIMIT 50;
```

RLS: only super_admin can read this table.

## Limits

- Function timeout: 60s (`export const maxDuration = 60`)
- No SSE / streaming

## Future ideas (deferred)

- SSE streaming for long-running searches
- Scoped read tools (e.g. agent only sees contacts they were granted)
