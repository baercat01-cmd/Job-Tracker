-- Allow hiding individual custom financial row line items from the customer portal (skip if table missing).
DO $hide_col$
BEGIN
  IF to_regclass('public.custom_financial_row_items') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.custom_financial_row_items
    ADD COLUMN IF NOT EXISTS hide_from_customer boolean NOT NULL DEFAULT false;
  EXECUTE $doc$
    COMMENT ON COLUMN public.custom_financial_row_items.hide_from_customer IS
      'When true, this line item is not shown in the customer portal proposal (office totals unchanged).'
  $doc$;
END $hide_col$;
