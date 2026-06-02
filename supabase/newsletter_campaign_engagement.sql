-- Per-campaign open/click aggregate, for the campaigns list page.
-- newsletter_recipients has RLS enabled with no SELECT policy, so the browser
-- client can't read it directly — this SECURITY DEFINER function exposes only
-- aggregate counts (no PII) to authenticated users.
--
-- Applied to production 2026-06-02 (v7.0.1).

CREATE OR REPLACE FUNCTION public.get_campaign_engagement(p_campaign_ids uuid[])
RETURNS TABLE(campaign_id uuid, recipients bigint, opened bigint, clicked bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT campaign_id, count(*)::bigint, count(opened_at)::bigint, count(clicked_at)::bigint
  FROM public.newsletter_recipients
  WHERE campaign_id = ANY(p_campaign_ids)
  GROUP BY campaign_id
$$;
REVOKE ALL ON FUNCTION public.get_campaign_engagement(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_engagement(uuid[]) TO authenticated;
COMMENT ON FUNCTION public.get_campaign_engagement(uuid[]) IS
'Per-campaign open/click aggregate counts from newsletter_recipients. Authenticated only.';
