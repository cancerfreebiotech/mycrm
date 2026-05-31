-- newsletter_drafts: extend section enum to include 'highlight'
--
-- v6.8.2: highlight is no longer a single text block stored on period_meta.
-- It's now a full story (title + content + photo + link), stored as a
-- newsletter_drafts row with section='highlight'. At most one highlight per
-- period (enforced by partial unique index).
--
-- Applied to production 2026-05-31.

ALTER TABLE public.newsletter_drafts DROP CONSTRAINT IF EXISTS newsletter_drafts_section_check;
ALTER TABLE public.newsletter_drafts ADD CONSTRAINT newsletter_drafts_section_check
  CHECK (section = ANY (ARRAY['highlight'::text, 'last_month'::text, 'next_month'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_drafts_one_highlight_per_period
  ON public.newsletter_drafts (period)
  WHERE section = 'highlight' AND status <> 'deleted';

-- Drop the obsolete highlight_html column from period_meta (added in v6.8.1,
-- never used by any user before the redesign).
ALTER TABLE public.newsletter_period_meta DROP COLUMN IF EXISTS highlight_html;
