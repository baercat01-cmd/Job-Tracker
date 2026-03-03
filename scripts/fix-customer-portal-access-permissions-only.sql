-- Fix "Database is blocking this action" (42501) for customer_portal_access
-- Run this in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- No CREATE TABLE; only permissions. Use this if the table already exists.

-- 1. Grant table access to anon and authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_access TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_access TO authenticated;

-- 2. Drop any RLS policies on the table
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

-- 3. Disable Row Level Security (so table GRANTs alone control access)
ALTER TABLE public.customer_portal_access DISABLE ROW LEVEL SECURITY;
