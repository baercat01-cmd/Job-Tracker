-- Fix: allow 'at_job' (and all app-used statuses) in material_items.status.
-- Error: new row for relation 'material_items' violates check constraint 'material_items_status_check'
--
-- If you get "relation material_items does not exist": run create-material-workbook-tables.sql first.
-- If material_items exists but does not allow 'at_job': run this script in Supabase SQL Editor.

-- Use public schema explicitly (required if table is in public).
ALTER TABLE public.material_items
  DROP CONSTRAINT IF EXISTS material_items_status_check;

ALTER TABLE public.material_items
  ADD CONSTRAINT material_items_status_check
  CHECK (status IN (
    'not_ordered',
    'pull_from_shop',
    'ordered',
    'received',
    'ready_for_job',
    'at_job'
  ));
