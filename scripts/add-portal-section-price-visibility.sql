-- Add per-section "show price in customer portal" so you can reveal section pricing for certain sections only.
-- Run in Supabase SQL Editor.

-- custom_financial_rows: when true, this row's price is shown in the customer portal (when financial summary is on).
ALTER TABLE public.custom_financial_rows
  ADD COLUMN IF NOT EXISTS show_price_in_portal boolean NOT NULL DEFAULT false;

-- material_sheets: when true, this sheet's total is shown in the customer portal (when financial summary is on).
ALTER TABLE public.material_sheets
  ADD COLUMN IF NOT EXISTS show_price_in_portal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_financial_rows.show_price_in_portal IS 'When true, show this row price in customer portal proposal (if portal has financial summary on).';
COMMENT ON COLUMN public.material_sheets.show_price_in_portal IS 'When true, show this sheet total in customer portal proposal (if portal has financial summary on).';
