-- ============================================================================
-- FORCE FIX: Customer Portal Visibility Columns and RPCs
-- Date: 2026-03-23
-- Purpose: Comprehensive fix for portal visibility save failures
-- Safe: Idempotent, no data loss, handles all pre-existing signatures
-- ============================================================================

-- ============================================================================
-- STEP 1: ENSURE COLUMNS EXIST ON customer_portal_access
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
      ADD COLUMN show_financial_summary boolean;
  END IF;

  -- show_line_item_prices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_line_item_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_line_item_prices boolean;
  END IF;

  -- show_material_items_no_prices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_material_items_no_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_material_items_no_prices boolean;
  END IF;

  -- show_section_prices
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'show_section_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN show_section_prices jsonb;
  END IF;

  -- visibility_by_quote
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'visibility_by_quote'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN visibility_by_quote jsonb;
  END IF;

  -- updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_portal_access'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.customer_portal_access
      ADD COLUMN updated_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: SET DEFAULTS + NOT NULL CONSTRAINTS
-- ============================================================================

-- Backfill boolean columns with false
UPDATE public.customer_portal_access
SET show_financial_summary = false
WHERE show_financial_summary IS NULL;

UPDATE public.customer_portal_access
SET show_line_item_prices = false
WHERE show_line_item_prices IS NULL;

UPDATE public.customer_portal_access
SET show_material_items_no_prices = false
WHERE show_material_items_no_prices IS NULL;

-- Backfill jsonb columns with empty object
UPDATE public.customer_portal_access
SET show_section_prices = '{}'::jsonb
WHERE show_section_prices IS NULL;

UPDATE public.customer_portal_access
SET visibility_by_quote = '{}'::jsonb
WHERE visibility_by_quote IS NULL;

-- Backfill updated_at with now() if null
UPDATE public.customer_portal_access
SET updated_at = now()
WHERE updated_at IS NULL;

-- Set defaults and NOT NULL constraints
ALTER TABLE public.customer_portal_access
  ALTER COLUMN show_financial_summary SET DEFAULT false,
  ALTER COLUMN show_financial_summary SET NOT NULL;

ALTER TABLE public.customer_portal_access
  ALTER COLUMN show_line_item_prices SET DEFAULT false,
  ALTER COLUMN show_line_item_prices SET NOT NULL;

ALTER TABLE public.customer_portal_access
  ALTER COLUMN show_material_items_no_prices SET DEFAULT false,
  ALTER COLUMN show_material_items_no_prices SET NOT NULL;

ALTER TABLE public.customer_portal_access
  ALTER COLUMN show_section_prices SET DEFAULT '{}'::jsonb,
  ALTER COLUMN show_section_prices SET NOT NULL;

ALTER TABLE public.customer_portal_access
  ALTER COLUMN visibility_by_quote SET DEFAULT '{}'::jsonb,
  ALTER COLUMN visibility_by_quote SET NOT NULL;

ALTER TABLE public.customer_portal_access
  ALTER COLUMN updated_at SET DEFAULT now();

-- ============================================================================
-- STEP 3: DROP ALL EXISTING FUNCTION OVERLOADS
-- ============================================================================

-- Drop all overloads of set_customer_portal_access_visibility
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_customer_portal_access_visibility'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_signature);
    RAISE NOTICE 'Dropped function: %', r.func_signature;
  END LOOP;
END $$;

-- Drop all overloads of get_customer_portal_access_by_token
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_customer_portal_access_by_token'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_signature);
    RAISE NOTICE 'Dropped function: %', r.func_signature;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 4: RECREATE set_customer_portal_access_visibility
-- ============================================================================

CREATE FUNCTION public.set_customer_portal_access_visibility(
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
-- STEP 5: RECREATE get_customer_portal_access_by_token
-- ============================================================================

CREATE FUNCTION public.get_customer_portal_access_by_token(
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
  ORDER BY 
    updated_at DESC NULLS LAST,
    created_at DESC NULLS LAST,
    id DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

-- ============================================================================
-- STEP 6: PERMISSIONS
-- ============================================================================

-- Revoke all from public first
REVOKE ALL ON FUNCTION public.set_customer_portal_access_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_portal_access_by_token(text) FROM PUBLIC;

-- Grant execute on get_customer_portal_access_by_token to anon and authenticated (customer portal access)
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO authenticated;

-- Grant execute on set_customer_portal_access_visibility to authenticated and service_role (office users)
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb) TO service_role;

-- ============================================================================
-- STEP 7: CREATE INDEXES IF MISSING
-- ============================================================================

DO $$
BEGIN
  -- Index on access_token
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_access'
      AND indexname = 'idx_customer_portal_access_token'
  ) THEN
    CREATE INDEX idx_customer_portal_access_token
      ON public.customer_portal_access(access_token);
    RAISE NOTICE 'Created index: idx_customer_portal_access_token';
  END IF;

  -- Index on job_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'customer_portal_access'
      AND indexname = 'idx_customer_portal_access_job_id'
  ) THEN
    CREATE INDEX idx_customer_portal_access_job_id
      ON public.customer_portal_access(job_id);
    RAISE NOTICE 'Created index: idx_customer_portal_access_job_id';
  END IF;
END $$;

-- ============================================================================
-- STEP 8: FORCE POSTGREST SCHEMA REFRESH
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- STEP 9: VERIFICATION QUERIES
-- ============================================================================

-- Check all required columns exist with correct types and defaults
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable,
  CASE 
    WHEN column_name LIKE 'show_%' AND data_type = 'boolean' AND column_default LIKE '%false%' AND is_nullable = 'NO' THEN '✓ CORRECT'
    WHEN column_name LIKE '%_by_quote' AND data_type = 'jsonb' AND column_default LIKE '%{}%' AND is_nullable = 'NO' THEN '✓ CORRECT'
    WHEN column_name = 'updated_at' AND data_type = 'timestamp with time zone' AND column_default LIKE '%now()%' THEN '✓ CORRECT'
    ELSE '✗ CHECK NEEDED'
  END AS status
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

-- Check exactly two functions exist with correct signatures
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE 
    WHEN p.proname = 'set_customer_portal_access_visibility' THEN '✓ Visibility setter'
    WHEN p.proname = 'get_customer_portal_access_by_token' THEN '✓ Token getter'
    ELSE '? Unknown'
  END AS purpose
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_customer_portal_access_visibility',
    'get_customer_portal_access_by_token'
  )
ORDER BY p.proname;

-- Count total function overloads (should be exactly 2)
SELECT 
  COUNT(*) AS total_functions,
  CASE 
    WHEN COUNT(*) = 2 THEN '✓ Correct (2 functions)'
    ELSE '✗ Unexpected count'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_customer_portal_access_visibility',
    'get_customer_portal_access_by_token'
  );

-- Verify indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  '✓ EXISTS' AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'customer_portal_access'
  AND indexname IN (
    'idx_customer_portal_access_token',
    'idx_customer_portal_access_job_id'
  )
ORDER BY indexname;

-- Sample test: Get portal access by token (REPLACE <PASTE_TOKEN> WITH REAL TOKEN)
-- SELECT public.get_customer_portal_access_by_token('<PASTE_TOKEN>');

-- Sample test: Update visibility (UNCOMMENT AND REPLACE VALUES)
-- SELECT public.set_customer_portal_access_visibility(
--   '<PASTE_LINK_ID>'::uuid,
--   true,  -- show_proposal
--   true,  -- show_payments
--   true,  -- show_schedule
--   true,  -- show_documents
--   true,  -- show_photos
--   true,  -- show_financial_summary
--   false, -- show_line_item_prices
--   false, -- show_material_items_no_prices
--   '{"section1": true, "section2": false}'::jsonb, -- show_section_prices
--   '{"quote123": {"show_materials": true}}'::jsonb  -- visibility_by_quote
-- );
