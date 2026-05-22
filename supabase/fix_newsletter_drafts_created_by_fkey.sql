-- Fix newsletter_drafts.created_by FK
--
-- BUG: Original constraint referenced auth.users(id), but every code path
-- (bot getAuthorizedUser, /api/newsletter/drafts authorize helper, GET query
-- that joins creator:created_by(display_name)) treats created_by as a
-- public.users(id). Result: every insert from /news in Telegram and every
-- POST /api/newsletter/drafts failed with FK violation.
--
-- Table is empty (0 rows) at the time of this migration — safe drop + recreate.
-- Applied to production 2026-05-22.

ALTER TABLE public.newsletter_drafts DROP CONSTRAINT newsletter_drafts_created_by_fkey;
ALTER TABLE public.newsletter_drafts
  ADD CONSTRAINT newsletter_drafts_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
