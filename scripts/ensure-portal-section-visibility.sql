-- =============================================================================
-- Fix: "Section price toggles updated here only" / per-proposal section prices
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- =============================================================================

-- Columns required for per-section and per-proposal visibility in Customer Portal
ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_section_prices jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS visibility_by_quote jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customer_portal_access.show_section_prices IS
  'Per-section price visibility: { "sheet-uuid": true|false }.';
COMMENT ON COLUMN public.customer_portal_access.visibility_by_quote IS
  'Per-proposal overrides, including nested show_section_prices per quote.';

-- Help PostgREST pick up columns (optional; restart project if toggles still fail)
NOTIFY pgrst, 'reload schema';

-- If updates are blocked by RLS, deploy the SECURITY DEFINER RPC (same project):
--   supabase/migrations/20250335000000_customer_portal_create_update_link_rpcs.sql
