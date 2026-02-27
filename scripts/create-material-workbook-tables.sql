-- Martin Builder: Create material workbook tables
-- Run this in Supabase SQL Editor if your project has "materials" and "project_materials"
-- but is missing material_workbooks, material_sheets, material_items, etc.
--
-- After this runs successfully, run: scripts/fix-material-items-status-constraint.sql
-- (or the status constraint is already included below on material_items).

-- 1. material_workbooks (per-job/quote workbook versions)
CREATE TABLE IF NOT EXISTS public.material_workbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  quote_id uuid,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'working' CHECK (status IN ('working', 'locked')),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_workbooks_job_id ON public.material_workbooks (job_id);
CREATE INDEX IF NOT EXISTS idx_material_workbooks_quote_id ON public.material_workbooks (quote_id);

-- 2. material_sheets (tabs/sheets inside a workbook)
CREATE TABLE IF NOT EXISTS public.material_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id uuid NOT NULL REFERENCES public.material_workbooks (id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  is_option boolean DEFAULT false,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_sheets_workbook_id ON public.material_sheets (workbook_id);

-- 3. material_items (line items on a sheet) — includes status constraint with 'at_job'
CREATE TABLE IF NOT EXISTS public.material_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.material_sheets (id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Uncategorized',
  usage text,
  sku text,
  material_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  length text,
  color text,
  cost_per_unit numeric,
  markup_percent numeric,
  price_per_unit numeric,
  extended_cost numeric,
  extended_price numeric,
  taxable boolean DEFAULT true,
  notes text,
  order_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_ordered'
    CHECK (status IN (
      'not_ordered',
      'pull_from_shop',
      'ordered',
      'received',
      'ready_for_job',
      'at_job'
    )),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Zoho / ordering
  zoho_sales_order_id text,
  zoho_sales_order_number text,
  zoho_purchase_order_id text,
  zoho_purchase_order_number text,
  zoho_invoice_id text,
  zoho_invoice_number text,
  ordered_at timestamptz,
  ordered_by uuid,
  date_needed_by date,
  requested_by uuid
);

CREATE INDEX IF NOT EXISTS idx_material_items_sheet_id ON public.material_items (sheet_id);
CREATE INDEX IF NOT EXISTS idx_material_items_status ON public.material_items (status);

-- 4. material_sheet_labor (labor per sheet)
CREATE TABLE IF NOT EXISTS public.material_sheet_labor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.material_sheets (id) ON DELETE CASCADE,
  description text,
  estimated_hours numeric DEFAULT 0,
  hourly_rate numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_sheet_labor_sheet_id ON public.material_sheet_labor (sheet_id);

-- 5. material_category_markups (category markup % per sheet)
CREATE TABLE IF NOT EXISTS public.material_category_markups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.material_sheets (id) ON DELETE CASCADE,
  category_name text NOT NULL,
  markup_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (sheet_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_material_category_markups_sheet_id ON public.material_category_markups (sheet_id);

-- 6. material_bundles (packages for a job)
CREATE TABLE IF NOT EXISTS public.material_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_ordered' CHECK (status IN ('not_ordered', 'ordered', 'received', 'pull_from_shop', 'ready_for_job', 'at_job')),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_bundles_job_id ON public.material_bundles (job_id);

-- 7. material_bundle_items (which material_items are in a bundle)
CREATE TABLE IF NOT EXISTS public.material_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.material_bundles (id) ON DELETE CASCADE,
  material_item_id uuid NOT NULL REFERENCES public.material_items (id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  UNIQUE (bundle_id, material_item_id)
);

CREATE INDEX IF NOT EXISTS idx_material_bundle_items_bundle_id ON public.material_bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS idx_material_bundle_items_material_item_id ON public.material_bundle_items (material_item_id);

-- 8. material_item_photos (photos attached to a material item)
CREATE TABLE IF NOT EXISTS public.material_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_item_id uuid NOT NULL REFERENCES public.material_items (id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz DEFAULT now(),
  caption text
);

CREATE INDEX IF NOT EXISTS idx_material_item_photos_material_item_id ON public.material_item_photos (material_item_id);

-- Enable RLS (optional; uncomment if you use Row Level Security)
-- ALTER TABLE public.material_workbooks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.material_sheets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.material_items ENABLE ROW LEVEL SECURITY;
-- (repeat for other tables and add policies as needed)
