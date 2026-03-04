-- Add tax_exempt to quotes so proposals can be marked tax exempt (tax not added to grand total).
-- After running this, PostgREST must reload its schema or the API won't see the column.
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.tax_exempt IS 'When true, tax is not applied and grand total equals subtotal.';

-- Tell PostgREST to reload schema so GET/PATCH on quotes include tax_exempt (required for Tax Exempt checkbox to work).
NOTIFY pgrst, 'reload schema';
