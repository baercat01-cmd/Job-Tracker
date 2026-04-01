-- Standalone proposal sections (custom_financial_rows) can be marked optional like material sheets and subcontractor blocks.
ALTER TABLE public.custom_financial_rows
  ADD COLUMN IF NOT EXISTS is_option boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_financial_rows.is_option IS 'When true, this standalone row is shown as an option and excluded from proposal totals.';
