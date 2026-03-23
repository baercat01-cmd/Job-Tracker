-- ============================================================================
-- HARD FIX: Customer portal message sending - JSONB vs text[] conflict
-- Date: 2026-03-23
-- Purpose: Drop ALL function overloads and recreate with correct JSONB syntax
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC - Check actual column types
-- ============================================================================
-- Run this query to verify column types:
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema='public'
--   AND table_name='job_emails'
--   AND column_name IN ('to_emails','cc_emails');

-- ============================================================================
-- STEP 2: DIAGNOSTIC - List ALL existing function overloads
-- ============================================================================
-- Run this query to see all existing function bodies:
-- SELECT
--   p.oid::regprocedure AS signature,
--   pg_get_functiondef(p.oid) AS definition
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public'
--   AND p.proname='create_job_email_from_customer_portal';

-- ============================================================================
-- STEP 3: DROP ALL EXISTING OVERLOADS
-- ============================================================================

-- Drop all possible overloads (defensive approach - some may not exist)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_job_email_from_customer_portal'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_signature);
    RAISE NOTICE 'Dropped function: %', r.func_signature;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 4: RECREATE FUNCTION WITH CORRECT JSONB SYNTAX
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_job_email_from_customer_portal(
  p_access_token text,
  p_job_id uuid,
  p_subject text,
  p_body_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access record;
  v_message_id text;
  v_row jsonb;
BEGIN
  IF p_access_token IS NULL OR trim(p_access_token) = '' THEN
    RAISE EXCEPTION 'Access token required';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job id required';
  END IF;
  IF p_body_text IS NULL OR trim(p_body_text) = '' THEN
    RAISE EXCEPTION 'Message body required';
  END IF;

  SELECT id, customer_name, customer_email, job_id
  INTO v_access
  FROM public.customer_portal_access
  WHERE access_token = trim(p_access_token)
    AND is_active = true
  LIMIT 1;

  IF v_access.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive portal access token';
  END IF;
  IF v_access.job_id IS NOT NULL AND v_access.job_id != p_job_id THEN
    RAISE EXCEPTION 'Portal access is not for this job';
  END IF;

  v_message_id := 'customer-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 7);

  INSERT INTO public.job_emails (
    job_id, message_id, subject, from_email, from_name,
    to_emails, cc_emails, body_text, email_date, direction, is_read, entity_category
  ) VALUES (
    p_job_id,
    v_message_id,
    coalesce(trim(p_subject), 'Message from ' || coalesce(v_access.customer_name, 'Customer')),
    coalesce(trim(v_access.customer_email), ''),
    coalesce(trim(v_access.customer_name), 'Customer'),
    '[]'::jsonb,
    '[]'::jsonb,
    trim(p_body_text),
    now(),
    'inbound',
    false,
    'customer'
  )
  RETURNING to_jsonb(job_emails.*) INTO v_row;

  RETURN v_row;
END;
$$;

-- ============================================================================
-- STEP 5: GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO authenticated;

-- ============================================================================
-- STEP 6: FORCE POSTGREST SCHEMA RELOAD
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- STEP 7: VERIFICATION QUERIES
-- ============================================================================

-- Verify column types are JSONB
SELECT 
  column_name, 
  data_type, 
  udt_name,
  CASE 
    WHEN data_type = 'jsonb' THEN '✓ CORRECT'
    ELSE '✗ WRONG TYPE'
  END AS status
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='job_emails'
  AND column_name IN ('to_emails','cc_emails')
ORDER BY column_name;

-- Verify function exists with correct signature
SELECT
  p.oid::regprocedure AS signature,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%''[]''::jsonb%' THEN '✓ Uses JSONB syntax'
    WHEN pg_get_functiondef(p.oid) LIKE '%ARRAY[]::text[]%' THEN '✗ Uses text[] syntax'
    ELSE '? Unknown syntax'
  END AS syntax_check
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname='create_job_email_from_customer_portal';

-- Show complete function definition for manual inspection
SELECT pg_get_functiondef(p.oid) AS complete_function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname='create_job_email_from_customer_portal';

-- Count number of overloads (should be exactly 1)
SELECT 
  COUNT(*) AS number_of_overloads,
  CASE 
    WHEN COUNT(*) = 1 THEN '✓ Correct (single function)'
    WHEN COUNT(*) > 1 THEN '✗ Multiple overloads still exist'
    ELSE '✗ Function missing'
  END AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname='create_job_email_from_customer_portal';

-- Test query template (uncomment and fill in values to test):
-- SELECT public.create_job_email_from_customer_portal(
--   'your-test-access-token-here',
--   'your-job-uuid-here'::uuid,
--   'Test Subject',
--   'Test message body'
-- );
