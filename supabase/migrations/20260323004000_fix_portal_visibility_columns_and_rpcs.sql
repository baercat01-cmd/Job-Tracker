-- Migration: Fix customer portal visibility columns and RPCs
-- Date: 2026-03-23
-- Purpose: Ensure all portal visibility columns exist, create/replace RPCs, fix permissions
-- Addresses: "This setting could not be saved because portal visibility columns are missing"

-- ============================================================================
-- 1. ENSURE COLUMNS EXIST ON customer_portal_access
-- ============================================================================

DO $$
BEGIN
  -- show_financial_summary
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_financial_summary'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_financial_summary boolean NOT NULL DEFAULT false;
  END IF;

  -- show_line_item_prices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_line_item_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_line_item_prices boolean NOT NULL DEFAULT false;
  END IF;

  -- show_material_items_no_prices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_material_items_no_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_material_items_no_prices boolean NOT NULL DEFAULT false;
  END IF;

  -- show_section_prices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_section_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_section_prices jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- visibility_by_quote
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'visibility_by_quote'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN visibility_by_quote jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- updated_at (if missing)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- ============================================================================
-- 2. BACKFILL NULLS SAFELY
-- ============================================================================

-- Backfill boolean columns (defensive, in case they somehow allow null)
UPDATE public.customer_portal_access
SET show_financial_summary = false
WHERE show_financial_summary IS NULL;

UPDATE public.customer_portal_access
SET show_line_item_prices = false
WHERE show_line_item_prices IS NULL;

UPDATE public.customer_portal_access
SET show_material_items_no_prices = false
WHERE show_material_items_no_prices IS NULL;

-- Backfill jsonb columns
UPDATE public.customer_portal_access
SET show_section_prices = '{}'::jsonb
WHERE show_section_prices IS NULL;

UPDATE public.customer_portal_access
SET visibility_by_quote = '{}'::jsonb
WHERE visibility_by_quote IS NULL;

-- ============================================================================
-- 3. CREATE INDEXES IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_access'
      AND indexname = 'idx_customer_portal_access_token'
  ) THEN
    CREATE INDEX idx_customer_portal_access_token
      ON public.customer_portal_access(access_token);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_access'
      AND indexname = 'idx_customer_portal_access_job_id'
  ) THEN
    CREATE INDEX idx_customer_portal_access_job_id
      ON public.customer_portal_access(job_id);
  END IF;
END $$;

-- ============================================================================
-- 4. CREATE OR REPLACE RPC: set_customer_portal_access_visibility
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_customer_portal_access_visibility(
  p_link_id uuid,
  p_show_proposal boolean,
  p_show_payments boolean,
  p_show_schedule boolean,
  p_show_documents boolean,
  p_show_photos boolean,
  p_show_financial_summary boolean,
  p_show_line_item_prices boolean,
  p_show_material_items_no_prices boolean,
  p_show_section_prices jsonb,
  p_visibility_by_quote jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customer_portal_access
  SET
    show_proposal = p_show_proposal,
    show_payments = p_show_payments,
    show_schedule = p_show_schedule,
    show_documents = p_show_documents,
    show_photos = p_show_photos,
    show_financial_summary = p_show_financial_summary,
    show_line_item_prices = p_show_line_item_prices,
    show_material_items_no_prices = p_show_material_items_no_prices,
    show_section_prices = COALESCE(p_show_section_prices, '{}'::jsonb),
    visibility_by_quote = COALESCE(p_visibility_by_quote, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_link_id;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 5. CREATE OR REPLACE RPC: get_customer_portal_access_by_token
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_portal_access_by_token(
  p_access_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  SELECT to_jsonb(customer_portal_access.*)
  INTO v_row
  FROM public.customer_portal_access
  WHERE access_token = trim(p_access_token)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY updated_at DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 6. GRANTS AND PERMISSIONS
-- ============================================================================

-- Revoke public access first
REVOKE ALL ON FUNCTION public.set_customer_portal_access_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_portal_access_by_token(text) FROM PUBLIC;

-- Grant execute to authenticated for visibility setter
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb) TO service_role;

-- Grant execute to anon and authenticated for token-based getter (customer portal access)
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO authenticated;

-- ============================================================================
-- 7. VERIFICATION QUERIES
-- ============================================================================

-- Verify all required columns exist
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'customer_portal_access'
  AND column_name IN (
    'show_financial_summary',
    'show_line_item_prices',
    'show_material_items_no_prices',
    'show_section_prices',
    'visibility_by_quote',
    'updated_at'
  )
ORDER BY column_name;

-- Verify RPCs exist
SELECT
  proname AS function_name,
  pg_get_function_identity_arguments(oid) AS arguments
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'set_customer_portal_access_visibility',
    'get_customer_portal_access_by_token'
  )
ORDER BY proname;

-- Sample test: Get portal access by token (replace with actual token)
-- SELECT public.get_customer_portal_access_by_token('YOUR_TEST_TOKEN_HERE');

-- Sample test: Update visibility (replace with actual link ID)
-- SELECT public.set_customer_portal_access_visibility(
--   'YOUR_LINK_ID_HERE'::uuid,
--   true,  -- show_proposal
--   true,  -- show_payments
--   true,  -- show_schedule
--   true,  -- show_documents
--   true,  -- show_photos
--   true,  -- show_financial_summary
--   false, -- show_line_item_prices
--   false, -- show_material_items_no_prices
--   '{}'::jsonb, -- show_section_prices
--   '{}'::jsonb  -- visibility_by_quote
-- );

-- Verify indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'customer_portal_access'
  AND indexname IN (
    'idx_customer_portal_access_token',
    'idx_customer_portal_access_job_id'
  )
ORDER BY indexname;
