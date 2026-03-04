-- Add tax_exempt to quotes so proposals can be marked tax exempt (tax not added to grand total)
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.tax_exempt IS 'When true, tax is not applied and grand total equals subtotal.';
