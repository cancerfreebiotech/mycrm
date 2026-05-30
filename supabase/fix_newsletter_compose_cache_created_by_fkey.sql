-- Fix newsletter_compose_cache.created_by FK
--
-- BUG: Original constraint referenced auth.users(id), but the code in
-- src/app/api/newsletter/compose-from-drafts/route.ts passes
-- `auth.userId` which comes from public.users.id (via authorize helper).
-- Two different UUIDs → every INSERT silently fails with FK violation.
-- Symptom: cache stays empty → commit returns 409 "No recent preview to commit"
-- even right after a successful preview.
--
-- (Same bug pattern as fix_newsletter_drafts_created_by_fkey.sql, v6.7.1.)
--
-- Applied to production 2026-05-31.

ALTER TABLE public.newsletter_compose_cache DROP CONSTRAINT newsletter_compose_cache_created_by_fkey;
ALTER TABLE public.newsletter_compose_cache
  ADD CONSTRAINT newsletter_compose_cache_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;
