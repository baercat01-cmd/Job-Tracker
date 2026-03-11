-- Add is_optional to material_items so sections can be marked as options.
-- Run this in Supabase Dashboard → SQL Editor if you see "Could not find the 'is_optional' column" in the app.
ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS is_optional boolean DEFAULT false;

-- Refresh PostgREST schema cache so the app sees the new column.
NOTIFY pgrst, 'reload schema';
