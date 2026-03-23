-- Migration: Fix Customer Portal Visibility Columns and RPCs
-- Description: Adds missing columns to customer_portal_access and job_documents,
--              creates/replaces RPC functions for updating visibility settings,
--              and ensures proper RLS policies for authenticated users.
-- Safe to run multiple times (idempotent).

BEGIN;

-- ============================================================================
-- 1. Add missing columns to customer_portal_access
-- ============================================================================

DO $$
BEGIN
  -- Add show_line_item_prices if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'customer_portal_access' 
    AND column_name = 'show_line_item_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access 
    ADD COLUMN show_line_item_prices boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'Added column: show_line_item_prices';
  END IF;

  -- Add show_material_items_no_prices if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'customer_portal_access' 
    AND column_name = 'show_material_items_no_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access 
    ADD COLUMN show_material_items_no_prices boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'Added column: show_material_items_no_prices';
  END IF;

  -- Add show_section_prices if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'customer_portal_access' 
    AND column_name = 'show_section_prices'
  ) THEN
    ALTER TABLE public.customer_portal_access 
    ADD COLUMN show_section_prices jsonb NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added column: show_section_prices';
  END IF;

  -- Add visibility_by_quote if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'customer_portal_access' 
    AND column_name = 'visibility_by_quote'
  ) THEN
    ALTER TABLE public.customer_portal_access 
    ADD COLUMN visibility_by_quote jsonb NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added column: visibility_by_quote';
  END IF;
END $$;

-- ============================================================================
-- 2. Add missing column to job_documents
-- ============================================================================

DO $$
BEGIN
  -- Add visible_to_customer_portal if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'job_documents' 
    AND column_name = 'visible_to_customer_portal'
  ) THEN
    ALTER TABLE public.job_documents 
    ADD COLUMN visible_to_customer_portal boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'Added column: visible_to_customer_portal';
  END IF;
END $$;

-- ============================================================================
-- 3. Create/Replace RPC: set_customer_portal_access_visibility
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

COMMENT ON FUNCTION public.set_customer_portal_access_visibility IS 
'Updates visibility settings for a customer portal access link. Returns true if row was found and updated.';

-- ============================================================================
-- 4. Create/Replace RPC: set_job_document_portal_visibility
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_job_document_portal_visibility(
  p_document_id uuid,
  p_visible boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.job_documents
  SET
    visible_to_customer_portal = p_visible,
    updated_at = now()
  WHERE id = p_document_id;
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.set_job_document_portal_visibility IS 
'Updates customer portal visibility for a job document. Returns true if document was found and updated.';

-- ============================================================================
-- 5. Grants - Revoke from PUBLIC, Grant to authenticated
-- ============================================================================

REVOKE ALL ON FUNCTION public.set_customer_portal_access_visibility FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility TO authenticated;

REVOKE ALL ON FUNCTION public.set_job_document_portal_visibility FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_document_portal_visibility TO authenticated;

-- ============================================================================
-- 6. Ensure RLS policies allow authenticated users to UPDATE
-- ============================================================================

-- For customer_portal_access
DO $$
BEGIN
  -- Check if authenticated update policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'customer_portal_access' 
    AND policyname = 'authenticated_can_update_portal_access'
  ) THEN
    CREATE POLICY authenticated_can_update_portal_access
      ON public.customer_portal_access
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'Created policy: authenticated_can_update_portal_access';
  END IF;
END $$;

-- For job_documents
DO $$
BEGIN
  -- Check if authenticated update policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'job_documents' 
    AND policyname = 'authenticated_can_update_job_documents'
  ) THEN
    CREATE POLICY authenticated_can_update_job_documents
      ON public.job_documents
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'Created policy: authenticated_can_update_job_documents';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify columns exist in customer_portal_access
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'customer_portal_access'
  AND column_name IN (
    'show_line_item_prices',
    'show_material_items_no_prices', 
    'show_section_prices',
    'visibility_by_quote'
  )
ORDER BY column_name;

-- Expected: 4 rows showing all columns with boolean/jsonb types, NOT NULL, proper defaults

-- Verify column exists in job_documents
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'job_documents'
  AND column_name = 'visible_to_customer_portal';

-- Expected: 1 row showing boolean NOT NULL DEFAULT false

-- Verify RPC functions exist with correct signatures
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_customer_portal_access_visibility',
    'set_job_document_portal_visibility'
  )
ORDER BY p.proname;

-- Expected: 2 rows showing both functions with security_definer = true

-- Verify grants on functions
SELECT 
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'set_customer_portal_access_visibility',
    'set_job_document_portal_visibility'
  )
ORDER BY routine_name, grantee;

-- Expected: Only 'authenticated' role should have EXECUTE privilege

-- Verify RLS policies exist
SELECT 
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customer_portal_access', 'job_documents')
  AND policyname IN (
    'authenticated_can_update_portal_access',
    'authenticated_can_update_job_documents'
  )
ORDER BY tablename, policyname;

-- Expected: 2 policies showing UPDATE command for authenticated role

-- Test RPC calls (using sample UUIDs - will return false if no matching rows)
-- These demonstrate the expected function signatures

-- Test set_customer_portal_access_visibility
SELECT public.set_customer_portal_access_visibility(
  '00000000-0000-0000-0000-000000000000'::uuid,  -- p_link_id (non-existent)
  true,   -- p_show_proposal
  true,   -- p_show_payments
  true,   -- p_show_schedule
  true,   -- p_show_documents
  true,   -- p_show_photos
  true,   -- p_show_financial_summary
  false,  -- p_show_line_item_prices
  false,  -- p_show_material_items_no_prices
  '{}'::jsonb,  -- p_show_section_prices
  '{}'::jsonb   -- p_visibility_by_quote
) AS test_portal_visibility_update;
-- Expected: Returns false (no row with that ID exists)

-- Test set_job_document_portal_visibility
SELECT public.set_job_document_portal_visibility(
  '00000000-0000-0000-0000-000000000000'::uuid,  -- p_document_id (non-existent)
  true  -- p_visible
) AS test_document_visibility_update;
-- Expected: Returns false (no row with that ID exists)

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
