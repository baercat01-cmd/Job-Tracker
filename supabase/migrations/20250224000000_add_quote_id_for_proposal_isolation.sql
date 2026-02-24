-- Isolate data per proposal so -1 stays locked (snapshot) and -2, -3 have their own editable data.
-- Run in Supabase SQL Editor.

-- material_workbooks: each proposal can have its own workbook
ALTER TABLE material_workbooks
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

-- custom_financial_rows: scope rows to a specific proposal
ALTER TABLE custom_financial_rows
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

-- subcontractor_estimates: scope to a specific proposal
ALTER TABLE subcontractor_estimates
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_material_workbooks_quote_id ON material_workbooks(quote_id);
CREATE INDEX IF NOT EXISTS idx_custom_financial_rows_quote_id ON custom_financial_rows(quote_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_estimates_quote_id ON subcontractor_estimates(quote_id);
