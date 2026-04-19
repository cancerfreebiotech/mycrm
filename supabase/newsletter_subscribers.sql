-- ============================================================
-- Newsletter Subscribers Migration
-- Run this in Supabase Dashboard > SQL Editor
--
-- Context: replaces SendGrid Marketing UI ($15/mo) with mycrm-driven
-- newsletter sending. Subscribers are a SEPARATE entity from CRM
-- contacts — a subscriber can exist without a contact (4000+ emails
-- imported from SendGrid lists), and an email that later becomes a
-- contact (via card scan / manual add) is auto-linked via the trigger
-- below.
--
-- Tables created:
--   newsletter_subscribers       — pool of email subscribers
--   newsletter_lists             — groups (zh-TW / en / ja / marketing)
--   newsletter_subscriber_lists  — M:N (handles overlap)
--
-- Trigger: link_subscribers_on_contact_email
--   When a contact's email is inserted or updated, scan subscribers
--   with the same email (case-insensitive) that aren't linked yet,
--   and point their contact_id at the new/updated contact.
-- ============================================================

-- citext for case-insensitive email columns (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS citext;

-- 1. newsletter_subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT       NOT NULL UNIQUE,
  contact_id        UUID         REFERENCES contacts(id) ON DELETE SET NULL,
  first_name        TEXT,
  last_name         TEXT,
  metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  source            TEXT,                  -- e.g. 'sendgrid_import_20260420', 'manual'
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  unsubscribed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_contact_id_idx  ON newsletter_subscribers(contact_id);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_unsubscribed_idx ON newsletter_subscribers(unsubscribed_at) WHERE unsubscribed_at IS NOT NULL;

-- 2. newsletter_lists
CREATE TABLE IF NOT EXISTS newsletter_lists (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT         NOT NULL UNIQUE,   -- 'zh-TW' / 'en' / 'ja' / 'zh-TW-marketing'
  name         TEXT         NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed the 4 default lists (idempotent)
INSERT INTO newsletter_lists (key, name, description) VALUES
  ('zh-TW',            '中文月報',       '繁體中文電子報訂閱者'),
  ('en',               'English Newsletter', 'English newsletter subscribers'),
  ('ja',               '日本語ニュースレター', '日文電子報訂閱者'),
  ('zh-TW-marketing',  '中文行銷',       '行銷活動（中文）訂閱者')
ON CONFLICT (key) DO NOTHING;

-- 3. newsletter_subscriber_lists (M:N)
CREATE TABLE IF NOT EXISTS newsletter_subscriber_lists (
  subscriber_id  UUID         NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  list_id        UUID         NOT NULL REFERENCES newsletter_lists(id)       ON DELETE CASCADE,
  added_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, list_id)
);

CREATE INDEX IF NOT EXISTS newsletter_subscriber_lists_list_id_idx ON newsletter_subscriber_lists(list_id);

-- ============================================================
-- Auto-link trigger: when a contact's email is set/changed,
-- find existing unlinked subscribers with the same email and
-- attach them. citext comparison is already case-insensitive.
-- ============================================================

CREATE OR REPLACE FUNCTION link_subscriber_to_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE newsletter_subscribers
  SET contact_id = NEW.id
  WHERE contact_id IS NULL
    AND lower(trim(email::text)) = lower(trim(NEW.email));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS link_subscribers_on_contact_email ON contacts;
CREATE TRIGGER link_subscribers_on_contact_email
AFTER INSERT OR UPDATE OF email ON contacts
FOR EACH ROW
EXECUTE FUNCTION link_subscriber_to_contact();

-- ============================================================
-- Backfill: link existing subscribers to existing contacts by email
-- (safe to re-run; idempotent because it only updates unlinked rows)
-- ============================================================

UPDATE newsletter_subscribers s
SET contact_id = c.id
FROM contacts c
WHERE s.contact_id IS NULL
  AND c.deleted_at IS NULL
  AND c.email IS NOT NULL
  AND lower(trim(s.email::text)) = lower(trim(c.email));

-- ============================================================
-- RLS (Row Level Security) — mycrm rule: all tables have RLS on.
-- Adjust these policies based on your permission model once you have
-- concrete requirements. Below is a minimal starter: authenticated
-- users can read, only service_role can write.
-- ============================================================

ALTER TABLE newsletter_subscribers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_lists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscriber_lists ENABLE ROW LEVEL SECURITY;

-- Read for authenticated users (admin pages)
DROP POLICY IF EXISTS newsletter_subscribers_read ON newsletter_subscribers;
CREATE POLICY newsletter_subscribers_read ON newsletter_subscribers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS newsletter_lists_read ON newsletter_lists;
CREATE POLICY newsletter_lists_read ON newsletter_lists
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS newsletter_subscriber_lists_read ON newsletter_subscriber_lists;
CREATE POLICY newsletter_subscriber_lists_read ON newsletter_subscriber_lists
  FOR SELECT TO authenticated USING (true);

-- Write goes through service_role (API routes using createServiceClient).
-- If you want admin-user write, add permission-gated INSERT/UPDATE/DELETE
-- policies here referencing user permissions (the same pattern used by
-- other admin-only tables in this project).

-- ============================================================
-- DONE. After running this:
--   1. Create an import page / script that reads the 4 SendGrid CSVs,
--      deduplicates emails, inserts subscribers, and attaches them to
--      the appropriate list(s) via newsletter_subscriber_lists.
--   2. Existing contacts with matching emails are auto-linked by the
--      backfill above.
--   3. Any new contact added via card scan / manual / batch will
--      auto-link via the trigger.
--   4. Newsletter sending should target lists (via newsletter_subscriber_lists)
--      instead of contact tags.
-- ============================================================
