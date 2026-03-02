-- Customer Portal Access: create table (if missing) and fix permissions
-- Goal: any office user can create/update portal links (no special permission).
--
-- Run this ENTIRE script in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- If you still get "Database is blocking", run it again; ensure no errors appear in the Results panel.

-- ========== 1. CREATE TABLE (if it doesn't exist) ==========
CREATE TABLE IF NOT EXISTS public.customer_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  customer_identifier text NOT NULL,
  access_token text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  show_proposal boolean NOT NULL DEFAULT true,
  show_payments boolean NOT NULL DEFAULT true,
  show_schedule boolean NOT NULL DEFAULT true,
  show_documents boolean NOT NULL DEFAULT true,
  show_photos boolean NOT NULL DEFAULT true,
  show_financial_summary boolean NOT NULL DEFAULT true,
  custom_message text
);

CREATE INDEX IF NOT EXISTS idx_customer_portal_access_job_id ON public.customer_portal_access (job_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_access_token ON public.customer_portal_access (access_token);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_customer_identifier ON public.customer_portal_access (customer_identifier);

-- ========== 2. TABLE GRANTS ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_access TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_access TO authenticated;

-- ========== 3. DROP EXISTING RLS POLICIES (if any) ==========
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'customer_portal_access' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_portal_access', pol.policyname);
  END LOOP;
END $$;

-- ========== 4. DISABLE RLS (so only table GRANTs apply; no policy can block) ==========
ALTER TABLE public.customer_portal_access DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.customer_portal_access IS 'Portal links for customers. RLS disabled so any office user (anon/authenticated) can create/update; customers use token to read.';
