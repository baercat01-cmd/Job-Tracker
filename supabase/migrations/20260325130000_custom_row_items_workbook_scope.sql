-- Scope proposal-level sheet line items to a specific workbook (working vs locked).
-- This ensures edits/additions in the working workbook do NOT change the locked proposal pricing.

DO $$
BEGIN
  IF to_regclass('public.custom_financial_row_items') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.custom_financial_row_items
    ADD COLUMN IF NOT EXISTS workbook_id uuid;

  -- Backfill from legacy sheet_id linkage.
  UPDATE public.custom_financial_row_items i
  SET workbook_id = ms.workbook_id
  FROM public.material_sheets ms
  WHERE i.sheet_id = ms.id
    AND i.workbook_id IS NULL;

  -- Index for fast lookups by quote + workbook + section.
  CREATE INDEX IF NOT EXISTS custom_financial_row_items_quote_wb_section_idx
    ON public.custom_financial_row_items (quote_id, workbook_id, section_name)
    WHERE row_id IS NULL;
END;
$$;

