-- Run in Supabase → SQL Editor (all at once).
-- Creates public.portal_users if missing, disables RLS, grants, and installs office_portal_user_ensure_for_subcontractor_json.

-- Fix: "new row violates row-level security policy for table portal_users" when granting
-- subcontractor job access or creating share links. Ensures RLS stays off for office REST
-- and re-applies the SECURITY DEFINER RPC if it was never deployed or was dropped.
--
-- Creates portal_users if missing (older DBs / partial migrations); full DDL also in
-- 20250331500000_create_portal_users_table.sql.

CREATE TABLE IF NOT EXISTS public.portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type text NOT NULL DEFAULT 'subcontractor',
  email text NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL DEFAULT '—',
  full_name text NOT NULL,
  company_name text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_users_user_type_check CHECK (
    user_type = ANY (ARRAY['customer'::text, 'subcontractor'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_users_username_unique ON public.portal_users (username);

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.portal_users', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.portal_users DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users TO service_role;

COMMENT ON TABLE public.portal_users IS 'Portal logins; RLS disabled so office REST can manage users.';

-- Same body as 20260327000000_portal_user_ensure_subcontractor_json.sql (idempotent replace).
CREATE OR REPLACE FUNCTION public.office_portal_user_ensure_for_subcontractor_json(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid := NULLIF(trim(p_row->>'subcontractor_id'), '')::uuid;
  v_created_by uuid := NULL;
  v_username text;
  v_existing uuid;
  v_email text;
  v_name text;
  v_company text;
  v_new_id uuid;
BEGIN
  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subcontractor_id required');
  END IF;

  IF p_row ? 'created_by' AND length(trim(coalesce(p_row->>'created_by', ''))) > 0 THEN
    v_created_by := (p_row->>'created_by')::uuid;
  END IF;

  v_username := 'sub:' || v_sub_id::text;

  SELECT pu.id INTO v_existing
  FROM public.portal_users pu
  WHERE pu.username = v_username AND pu.user_type = 'subcontractor'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing);
  END IF;

  SELECT s.name, s.company_name, s.email
  INTO v_name, v_company, v_email
  FROM public.subcontractors s
  WHERE s.id = v_sub_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subcontractor not found');
  END IF;

  v_email := CASE
    WHEN v_email IS NOT NULL AND length(trim(v_email)) > 0 THEN trim(v_email)
    ELSE 'subcontractor.' || replace(v_sub_id::text, '-', '') || '@portal.internal'
  END;

  INSERT INTO public.portal_users (
    user_type,
    email,
    username,
    password_hash,
    full_name,
    company_name,
    created_by,
    is_active
  ) VALUES (
    'subcontractor',
    v_email,
    v_username,
    '—',
    coalesce(nullif(trim(v_name), ''), 'Subcontractor'),
    nullif(trim(v_company), ''),
    v_created_by,
    true
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT pu.id INTO v_existing
    FROM public.portal_users pu
    WHERE pu.username = v_username AND pu.user_type = 'subcontractor'
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'id', v_existing);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  WHEN SQLSTATE '42703' THEN
    INSERT INTO public.portal_users (
      user_type,
      email,
      username,
      password_hash,
      full_name,
      company_name,
      created_by
    ) VALUES (
      'subcontractor',
      v_email,
      v_username,
      '—',
      coalesce(nullif(trim(v_name), ''), 'Subcontractor'),
      nullif(trim(v_company), ''),
      v_created_by
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('ok', true, 'id', v_new_id);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.office_portal_user_ensure_for_subcontractor_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_portal_user_ensure_for_subcontractor_json(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
