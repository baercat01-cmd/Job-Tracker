-- One quote per job can be the "change order proposal". Sheets added as change orders go into that proposal's workbook.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS is_change_order_proposal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.is_change_order_proposal IS 'When true, this quote is the dedicated change order proposal for the job; its workbook holds only change order sheets.';

-- At most one change order proposal per job (optional; app can enforce instead)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_one_change_order_per_job
  ON quotes (job_id)
  WHERE is_change_order_proposal = true;

NOTIFY pgrst, 'reload schema';
