-- Make sheet-level line items proposal-scoped (quote_id + section_name), not workbook-sheet-id scoped.
-- This prevents "Add Labor" from disappearing when locked/working workbook sheet IDs differ.

DO $$
BEGIN
  IF to_regclass('public.custom_financial_row_items') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.custom_financial_row_items
    ADD COLUMN IF NOT EXISTS quote_id uuid,
    ADD COLUMN IF NOT EXISTS section_name text;

  -- Backfill quote_id + section_name for existing sheet-linked items.
  -- Use sheet_id -> material_sheets -> material_workbooks -> quote_id.
  UPDATE public.custom_financial_row_items i
  SET
    quote_id = mw.quote_id,
    section_name = ms.sheet_name
  FROM public.material_sheets ms
  JOIN public.material_workbooks mw ON mw.id = ms.workbook_id
  WHERE i.sheet_id = ms.id
    AND i.row_id IS NULL
    AND (i.quote_id IS NULL OR i.section_name IS NULL);

  -- Backfill quote_id for row-linked items from the parent custom row.
  UPDATE public.custom_financial_row_items i
  SET quote_id = r.quote_id
  FROM public.custom_financial_rows r
  WHERE i.row_id = r.id
    AND i.quote_id IS NULL;

  -- Helpful index for fetching proposal-scoped line items quickly.
  CREATE INDEX IF NOT EXISTS custom_financial_row_items_quote_section_idx
    ON public.custom_financial_row_items (quote_id, section_name)
    WHERE row_id IS NULL;
END;
$$;

