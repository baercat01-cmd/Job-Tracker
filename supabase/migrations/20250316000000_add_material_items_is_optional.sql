-- Allow individual material line items to be marked as optional (excluded from contract total).
ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS is_optional boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
