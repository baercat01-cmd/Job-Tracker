-- Allow hiding individual custom financial row line items from the customer portal.
ALTER TABLE public.custom_financial_row_items
  ADD COLUMN IF NOT EXISTS hide_from_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_financial_row_items.hide_from_customer IS 'When true, this line item is not shown in the customer portal proposal (office totals unchanged).';
