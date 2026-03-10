-- ============================================================
-- Lumber/Rebar Purchase Orders
-- Run this in your Supabase SQL editor.
-- ============================================================

-- 1. Add SKU column to lumber_rebar_materials so each material
--    can be matched to an item in Zoho Books.
ALTER TABLE public.lumber_rebar_materials
  ADD COLUMN IF NOT EXISTS sku text;

-- 2. Create the purchase orders tracking table.
CREATE TABLE IF NOT EXISTS public.lumber_purchase_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id          uuid NOT NULL REFERENCES public.lumber_rebar_materials(id) ON DELETE CASCADE,
  vendor_id            uuid REFERENCES public.lumber_rebar_vendors(id) ON DELETE SET NULL,
  quantity             numeric NOT NULL DEFAULT 1,
  price_per_unit       numeric NOT NULL,
  unit                 text,
  notes                text,
  order_date           date NOT NULL DEFAULT CURRENT_DATE,
  status               text NOT NULL DEFAULT 'ordered'
                         CHECK (status IN ('ordered', 'received', 'cancelled')),
  zoho_po_id           text,
  zoho_po_number       text,
  zoho_po_url          text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lumber_pos_material   ON public.lumber_purchase_orders(material_id);
CREATE INDEX IF NOT EXISTS idx_lumber_pos_vendor      ON public.lumber_purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_lumber_pos_order_date  ON public.lumber_purchase_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_lumber_pos_status      ON public.lumber_purchase_orders(status);

-- RLS
ALTER TABLE public.lumber_purchase_orders ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read and write
CREATE POLICY "auth_read_lumber_pos"
  ON public.lumber_purchase_orders FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_insert_lumber_pos"
  ON public.lumber_purchase_orders FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_lumber_pos"
  ON public.lumber_purchase_orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
