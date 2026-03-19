-- Idempotent: adds JSONB columns required for section-level and per-proposal portal visibility.

ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_section_prices jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS visibility_by_quote jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customer_portal_access.show_section_prices IS
  'Per-section price visibility map for customer portal.';
COMMENT ON COLUMN public.customer_portal_access.visibility_by_quote IS
  'Per-proposal visibility including show_section_prices per quote.';

NOTIFY pgrst, 'reload schema';
