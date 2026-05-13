-- Drift fix: source has schema items that aren't in supabase_migrations.schema_migrations.
-- This patch adds the missing tables, columns, functions, and constraints so the
-- replayed migrations on target can succeed.
--
-- Discovered via comparing source pg_catalog vs replayed schema on target.

-- ── 1. contact_photos table (referenced by migrations 20260325144500 and later) ──
CREATE TABLE IF NOT EXISTS public.contact_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  storage_path text NOT NULL,
  taken_at timestamptz,
  latitude double precision,
  longitude double precision,
  location_name text,
  created_at timestamptz DEFAULT now(),
  note text
);
ALTER TABLE public.contact_photos ENABLE ROW LEVEL SECURITY;

-- ── 2. feedback table (referenced by RLS migrations) ──
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  screenshot_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'open',
  CONSTRAINT feedback_type_check CHECK (type = ANY (ARRAY['feature', 'bug'])),
  CONSTRAINT feedback_status_check CHECK (status = ANY (ARRAY['open', 'in_progress', 'done', 'wont_fix']))
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- ── 3. users.granted_features (referenced by RLS + has_feature) ──
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS granted_features text[] DEFAULT '{}'::text[];

-- ── 4. contacts.email_status + check ──
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_status text;
DO $$ BEGIN
  ALTER TABLE public.contacts ADD CONSTRAINT contacts_email_status_check
    CHECK (email_status = ANY (ARRAY['bounced', 'unsubscribed', 'invalid', 'deferred', 'mailbox_full', 'sender_blocked', 'recipient_blocked']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. contacts.email_opt_out (referenced) ──
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;

-- ── 6. interaction_logs.send_method + direction + check ──
ALTER TABLE public.interaction_logs ADD COLUMN IF NOT EXISTS send_method text;
ALTER TABLE public.interaction_logs ADD COLUMN IF NOT EXISTS direction text;
DO $$ BEGIN
  ALTER TABLE public.interaction_logs ADD CONSTRAINT interaction_logs_send_method_check
    CHECK (send_method IS NULL OR send_method = ANY (ARRAY['outlook', 'sendgrid', 'newsletter']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.interaction_logs ADD CONSTRAINT interaction_logs_direction_check
    CHECK (direction IS NULL OR direction = ANY (ARRAY['inbound', 'outbound']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. newsletter_blacklist.status + check ──
ALTER TABLE public.newsletter_blacklist ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'bounced';
DO $$ BEGIN
  ALTER TABLE public.newsletter_blacklist ADD CONSTRAINT newsletter_blacklist_status_check
    CHECK (status = ANY (ARRAY['bounced', 'invalid', 'deferred', 'mailbox_full', 'sender_blocked', 'recipient_blocked']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 8. tags.is_email_blacklist ──
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS is_email_blacklist boolean NOT NULL DEFAULT false;

-- ── 9. newsletter_campaigns drift columns ──
ALTER TABLE public.newsletter_campaigns ADD COLUMN IF NOT EXISTS list_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE public.newsletter_campaigns ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.newsletter_campaigns ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.newsletter_campaigns ADD COLUMN IF NOT EXISTS promo_text text;

-- ── 10. newsletter_subscribers.company ──
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS company text;

-- ── 11. contacts.last_activity_at + hunter_searched_at + met_date ──
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hunter_searched_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS met_date date;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS imported_at timestamptz;

-- ── 12. camcard_pending.assignee_label + back_img_url + back_storage_path ──
ALTER TABLE public.camcard_pending ADD COLUMN IF NOT EXISTS assignee_label text;
ALTER TABLE public.camcard_pending ADD COLUMN IF NOT EXISTS back_img_url text;
ALTER TABLE public.camcard_pending ADD COLUMN IF NOT EXISTS back_storage_path text;

-- ── 13. Helper functions referenced by RLS migrations ──
CREATE OR REPLACE FUNCTION public.has_feature(feature_key text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT CASE
      WHEN u.role = 'super_admin' THEN true
      ELSE u.granted_features @> ARRAY[feature_key]
    END
    FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')
      AND u.role = 'super_admin'
  )
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_country_stats()
 RETURNS TABLE(country_code text, name_zh text, emoji text, count bigint)
 LANGUAGE sql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.country_code, co.name_zh, co.emoji, COUNT(*)::bigint AS count
  FROM contacts c
  LEFT JOIN countries co ON co.code = c.country_code
  WHERE c.deleted_at IS NULL
  GROUP BY c.country_code, co.name_zh, co.emoji
  ORDER BY count DESC
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_tag_stats()
 RETURNS TABLE(name text, count bigint)
 LANGUAGE sql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.name, COUNT(ct.tag_id)::bigint AS count
  FROM tags t
  JOIN contact_tags ct ON ct.tag_id = t.id
  JOIN contacts c ON c.id = ct.contact_id
  WHERE c.deleted_at IS NULL
  GROUP BY t.name
  ORDER BY count DESC
$function$;

CREATE OR REPLACE FUNCTION public.can_access_duplicate_pairs()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users pu
    JOIN auth.users au ON lower(au.email) = lower(pu.email)
    WHERE au.id = auth.uid()
    AND (pu.role = 'super_admin' OR 'duplicates' = ANY(pu.granted_features))
  )
$function$;
