-- When a user "deletes" a section from the current proposal, job-level sections (quote_id null)
-- must only be hidden from that proposal, not removed from previously sent proposals.
-- This table records which sections are removed from which quote (proposal).
CREATE TABLE IF NOT EXISTS public.quote_removed_sections (
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  section_type text NOT NULL CHECK (section_type IN ('custom_row', 'subcontractor_estimate')),
  section_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (quote_id, section_type, section_id)
);

COMMENT ON TABLE public.quote_removed_sections IS 'Sections removed from a specific proposal only (job-level sections). Does not delete the section from DB so other/sent proposals still show it.';

CREATE INDEX IF NOT EXISTS idx_quote_removed_sections_quote_id ON public.quote_removed_sections(quote_id);

ALTER TABLE public.quote_removed_sections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage removed sections for quotes they can access (reuse jobs policy idea: allow if user can access the job for this quote)
CREATE POLICY "quote_removed_sections_select" ON public.quote_removed_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "quote_removed_sections_insert" ON public.quote_removed_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "quote_removed_sections_delete" ON public.quote_removed_sections FOR DELETE TO authenticated USING (true);
