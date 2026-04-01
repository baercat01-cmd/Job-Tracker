-- Customer / subcontractor portal login records (office-managed). Required before portal_job_access FK and hub flows.

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

COMMENT ON TABLE public.portal_users IS 'Portal logins for customer/subcontractor features; office app creates and manages rows.';
