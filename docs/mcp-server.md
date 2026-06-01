# mycrm MCP Server

mycrm exposes a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint
at `POST https://crm.cancerfree.io/api/mcp` so external Claude agents can query
the CRM (and, in future versions, update it).

## Setup

### 1. Generate a token

```bash
openssl rand -hex 32
```

### 2. Set it in Vercel

```bash
vercel env add MCP_AGENT_TOKEN production
# paste the token from step 1
vercel deploy --prod   # or wait for next deploy
```

Keep this token secret — anyone who has it can read all your CRM data.

### 3. Connect a Claude Code agent

Edit `~/.claude/settings.json` (or project-level `.mcp.json`):

```json
{
  "mcpServers": {
    "mycrm": {
      "type": "http",
      "url": "https://crm.cancerfree.io/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN_FROM_STEP_1>"
      }
    }
  }
}
```

Restart Claude Code. The agent should see 5 new tools under the `mycrm` prefix.

### 4. Connect from raw curl (testing)

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

## Tools (v1 — read-only)

| Tool | Description |
|------|-------------|
| `search_contacts(query, limit?)` | Substring search across name (zh/en/local) + email + company. Excludes soft-deleted. Max 100. |
| `get_contact(id)` | Full contact details + tags + 5 most recent interaction logs. |
| `list_newsletter_lists()` | All newsletter lists with member counts. |
| `search_subscribers_in_list(list_id, query?, limit?)` | Subscribers in a list, optionally filtered by substring. Max 500. |
| `list_tags()` | All CRM tags + email-blacklist flag. |

Write tools (`update_contact`, `add_note`, `add_to_newsletter_list`) are
planned for v2 — not in v1 so the surface stays safe to expose.

## Auth model

- Single shared token via `MCP_AGENT_TOKEN` env var. One token = one agent.
- All requests must include `Authorization: Bearer <token>`.
- Requests without / with wrong token get 401.

## Audit log

Every tool call writes a row to `public.agent_actions` with:
- `tool_name`
- `arguments` (JSONB — recorded verbatim, mind PII)
- `succeeded` + `error_message` if failed
- `ip_hash` (first 8 hex chars of a hash of the requester IP, for spotting repeated callers without storing raw IPs)
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
- No SSE / streaming in v1
- No per-agent rate limiting yet — add Vercel rate limit middleware if abuse becomes a concern

## v2 ideas (deferred)

- Write tools: `update_contact` (whitelist fields), `add_note`, `add_to_newsletter_list`
- Per-agent tokens (table `agent_tokens(token_hash, name, scopes[], expires_at)`)
- Scoped read tools (e.g. agent only sees contacts they were granted)
- Streaming responses for long-running searches
