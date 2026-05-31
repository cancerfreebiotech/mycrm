-- newsletter_period_meta
-- Per-period customization for newsletter draft compose:
--   * highlight_html — optional content block rendered at the very top of the
--     newsletter (above all stories)
--   * label_last / label_next — optional custom names for the two sections
--     (default fallbacks "上月回顧" / "下月預告" in code if these are NULL)
--
-- One row per period (YYYY-MM). Optional — code falls back to defaults when
-- no row exists for a period.

CREATE TABLE IF NOT EXISTS public.newsletter_period_meta (
  period TEXT PRIMARY KEY CHECK (period ~ '^\d{4}-\d{2}$'),
  highlight_html TEXT,
  label_last TEXT,
  label_next TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_period_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_period_meta_read"  ON public.newsletter_period_meta;
DROP POLICY IF EXISTS "newsletter_period_meta_write" ON public.newsletter_period_meta;

CREATE POLICY "newsletter_period_meta_read" ON public.newsletter_period_meta
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "newsletter_period_meta_write" ON public.newsletter_period_meta
  FOR ALL TO authenticated
  USING (public.has_feature('newsletter'))
  WITH CHECK (public.has_feature('newsletter'));

COMMENT ON TABLE public.newsletter_period_meta IS
'Per-period customization: highlight block + custom section labels. v6.9.0.';
