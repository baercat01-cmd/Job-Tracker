-- Remove inactive Zoho-imported materials from the Martin Builder catalog.
-- Safe scope: only rows whose raw_metadata indicates inactive in Zoho Books.

delete from public.materials_catalog
where (
  lower(coalesce(raw_metadata->>'status', '')) = 'inactive'
  or coalesce(raw_metadata->>'is_active', 'true') = 'false'
  or coalesce(raw_metadata->>'is_inactive', 'false') = 'true'
);
