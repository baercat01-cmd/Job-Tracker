-- One quote per job can be the "change order proposal". Sheets added as change orders go into that proposal's workbook.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS is_change_order_proposal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.is_change_order_proposal IS 'When true, this quote is the dedicated change order proposal for the job; its workbook holds only change order sheets.';

-- At most one change order proposal per job (only when quotes.job_id exists)
DO $co_idx$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'job_id'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_one_change_order_per_job
      ON public.quotes (job_id)
      WHERE is_change_order_proposal = true;
  END IF;
END $co_idx$;

NOTIFY pgrst, 'reload schema';
