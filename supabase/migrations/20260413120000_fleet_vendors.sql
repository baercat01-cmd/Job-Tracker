-- Manual fleet / vehicle supplier list — separate from public.vendors (Zoho Books catalog sync).

CREATE TABLE IF NOT EXISTS public.fleet_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  city text,
  state text,
  contact_person text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_vendors_name_ci_unique
  ON public.fleet_vendors (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS fleet_vendors_created_at_idx ON public.fleet_vendors (created_at DESC);

ALTER TABLE public.fleet_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read fleet_vendors" ON public.fleet_vendors;
CREATE POLICY "Authenticated can read fleet_vendors"
  ON public.fleet_vendors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert fleet_vendors" ON public.fleet_vendors;
CREATE POLICY "Authenticated can insert fleet_vendors"
  ON public.fleet_vendors FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update fleet_vendors" ON public.fleet_vendors;
CREATE POLICY "Authenticated can update fleet_vendors"
  ON public.fleet_vendors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete fleet_vendors" ON public.fleet_vendors;
CREATE POLICY "Authenticated can delete fleet_vendors"
  ON public.fleet_vendors FOR DELETE TO authenticated USING (true);

GRANT ALL ON TABLE public.fleet_vendors TO authenticated, service_role;
