-- Add missing show_line_item_prices column to customer_portal_access
-- Fixes: PGRST204 "Could not find the 'show_line_item_prices' column of 'customer_portal_access' in the schema cache"
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run

ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_line_item_prices boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_portal_access.show_line_item_prices IS 'When true, show line/sheet prices in customer portal proposal (when financial summary is on).';
