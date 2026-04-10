-- Price-list estimate lines attached to a formal proposal (no extra quotes row).
-- job_id is NOT FK'd to public.jobs: some deployments have quotes.job_id but no jobs table.
CREATE TABLE IF NOT EXISTS public.customer_estimate_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  anchor_quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  budget_material_catalog_id uuid REFERENCES public.budget_material_catalog(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  markup_percent numeric NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_estimate_lines_anchor_sort_idx
  ON public.customer_estimate_lines (anchor_quote_id, sort_order, created_at);

COMMENT ON TABLE public.customer_estimate_lines IS
  'Rough customer estimate line items from budget_material_catalog; scoped to anchor_quote_id (formal proposal).';

ALTER TABLE public.customer_estimate_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_estimate_lines_authenticated_all" ON public.customer_estimate_lines;
CREATE POLICY "customer_estimate_lines_authenticated_all"
  ON public.customer_estimate_lines
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_estimate_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_estimate_lines TO service_role;
