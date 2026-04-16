-- ============================================================
-- Email Tracking Migration
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. email_campaigns: one row per batch send
CREATE TABLE IF NOT EXISTS email_campaigns (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject        TEXT        NOT NULL,
  method         TEXT        NOT NULL,   -- 'outlook' | 'sendgrid'
  sg_mode        TEXT,                   -- 'individual' | 'bcc' | null
  total_recipients INTEGER   NOT NULL DEFAULT 0,
  created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. email_events: one row per SendGrid webhook event
CREATE TABLE IF NOT EXISTS email_events (
  id             BIGSERIAL   PRIMARY KEY,
  campaign_id    UUID        REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id     UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  email          TEXT        NOT NULL,
  event          TEXT        NOT NULL,  -- 'delivered'|'open'|'click'|'bounce'|'spamreport'|'unsubscribe'
  occurred_at    TIMESTAMPTZ NOT NULL,
  sg_message_id  TEXT,
  ip             TEXT,
  user_agent     TEXT,
  url            TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_events_campaign_id_idx ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS email_events_contact_id_idx  ON email_events(contact_id);
CREATE INDEX IF NOT EXISTS email_events_event_idx       ON email_events(event);

-- 3. Add campaign_id to interaction_logs
ALTER TABLE interaction_logs
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS interaction_logs_campaign_id_idx ON interaction_logs(campaign_id);

-- 4. RLS
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_campaigns"   ON email_campaigns;
DROP POLICY IF EXISTS "service_all_campaigns" ON email_campaigns;
DROP POLICY IF EXISTS "auth_read_events"      ON email_events;
DROP POLICY IF EXISTS "service_all_events"    ON email_events;

CREATE POLICY "auth_read_campaigns"   ON email_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all_campaigns" ON email_campaigns FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_events"      ON email_events    FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all_events"    ON email_events    FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- 5. RPC: aggregate stats per campaign
CREATE OR REPLACE FUNCTION get_campaign_stats()
RETURNS TABLE (
  campaign_id    UUID,
  delivered_count BIGINT,
  open_count      BIGINT,
  click_count     BIGINT,
  bounce_count    BIGINT
)
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT
    campaign_id,
    COUNT(DISTINCT CASE WHEN event = 'delivered' THEN email END) AS delivered_count,
    COUNT(DISTINCT CASE WHEN event = 'open'      THEN email END) AS open_count,
    COUNT(DISTINCT CASE WHEN event = 'click'     THEN email END) AS click_count,
    COUNT(DISTINCT CASE WHEN event = 'bounce'    THEN email END) AS bounce_count
  FROM email_events
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id;
$$;

-- 6. RPC: per-recipient status for a campaign
CREATE OR REPLACE FUNCTION get_campaign_recipients(p_campaign_id UUID)
RETURNS TABLE (
  contact_id      UUID,
  contact_name    TEXT,
  contact_email   TEXT,
  company         TEXT,
  delivered_at    TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  open_count      BIGINT,
  last_clicked_at TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ
)
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT
    c.id                                                              AS contact_id,
    c.name                                                            AS contact_name,
    c.email                                                           AS contact_email,
    c.company,
    MAX(CASE WHEN ee.event = 'delivered' THEN ee.occurred_at END)    AS delivered_at,
    MIN(CASE WHEN ee.event = 'open'      THEN ee.occurred_at END)    AS first_opened_at,
    COUNT(CASE WHEN ee.event = 'open'    THEN 1           END)       AS open_count,
    MAX(CASE WHEN ee.event = 'click'     THEN ee.occurred_at END)    AS last_clicked_at,
    MAX(CASE WHEN ee.event = 'bounce'    THEN ee.occurred_at END)    AS bounced_at
  FROM interaction_logs il
  JOIN contacts c ON c.id = il.contact_id
  LEFT JOIN email_events ee
    ON ee.campaign_id = il.campaign_id
   AND ee.email = c.email
  WHERE il.campaign_id = p_campaign_id
    AND il.type = 'email'
  GROUP BY c.id, c.name, c.email, c.company
  ORDER BY first_opened_at ASC NULLS LAST, c.name;
$$;
