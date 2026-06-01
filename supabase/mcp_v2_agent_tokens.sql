-- MCP v2.0 schema migration
-- Applied to production (gaxjgcztzfxokesiraai) 2026-06-01.
-- See docs/mcp-v2-plan.md for the full design.

-- 1. Per-agent tokens (replaces the single MCP_AGENT_TOKEN env var).
--    super_admin issues; token_hash = sha256(plaintext); scopes independent
--    of assigned_to user's mycrm permissions.
CREATE TABLE IF NOT EXISTS public.agent_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  assigned_to     UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  token_hash      TEXT NOT NULL UNIQUE,
  prefix          TEXT NOT NULL,                       -- first 12 chars, display only
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,                         -- NULL = never
  last_used_at    TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ,
  disabled_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_token_hash ON public.agent_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_assigned_to ON public.agent_tokens (assigned_to);

ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_tokens_read  ON public.agent_tokens;
DROP POLICY IF EXISTS agent_tokens_write ON public.agent_tokens;
CREATE POLICY agent_tokens_read  ON public.agent_tokens FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY agent_tokens_write ON public.agent_tokens FOR ALL    TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 2. via_mcp flag on every table an MCP write tool can touch.
ALTER TABLE public.interaction_logs            ADD COLUMN IF NOT EXISTS via_mcp BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.newsletter_subscribers      ADD COLUMN IF NOT EXISTS via_mcp BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.newsletter_subscriber_lists ADD COLUMN IF NOT EXISTS via_mcp BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.contact_tags                ADD COLUMN IF NOT EXISTS via_mcp BOOLEAN NOT NULL DEFAULT false;

-- 3. contacts had no update tracking at all — add it (used by update_contact tool).
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_updated_at      TIMESTAMPTZ;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_updated_by      UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_updated_via_mcp BOOLEAN NOT NULL DEFAULT false;

-- 4. agent_actions audit log gains attribution.
ALTER TABLE public.agent_actions ADD COLUMN IF NOT EXISTS token_id  UUID REFERENCES public.agent_tokens(id) ON DELETE SET NULL;
ALTER TABLE public.agent_actions ADD COLUMN IF NOT EXISTS acting_as UUID REFERENCES public.users(id)        ON DELETE SET NULL;

COMMENT ON TABLE public.agent_tokens IS
'MCP v2 per-agent tokens. super_admin issues. token_hash = sha256(plaintext). scopes independent of assigned_to permissions.';

-- ── Security review hardening (v7.0.0, 2026-06-01) ──────────────────────────
-- #1 (critical): bind X-Acting-User to assigned_to by default. allow_any_actor
--    opts a token into shared-bot mode where it may act as any user.
ALTER TABLE public.agent_tokens ADD COLUMN IF NOT EXISTS allow_any_actor BOOLEAN NOT NULL DEFAULT false;

-- #2 (high): row-level attribution for the two write tools whose target tables
--    previously stored only via_mcp (no created_by).
ALTER TABLE public.contact_tags                ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.newsletter_subscriber_lists ADD COLUMN IF NOT EXISTS added_by   UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.newsletter_subscribers      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
