-- Remove all imported placeholder SKUs from materials catalog.
-- Any SKU beginning with "imported" is considered invalid for Martin Builder.

delete from public.materials_catalog
where lower(coalesce(sku, '')) like 'imported%';
