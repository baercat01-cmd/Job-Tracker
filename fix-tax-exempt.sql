-- Run this in Supabase → SQL Editor to enable the Tax Exempt checkbox on proposals.
--
-- STEP 1: Run the block below (ALTER TABLE + COMMENT).
-- STEP 2: In a *new* SQL query, run only:  NOTIFY pgrst, 'reload schema';
-- STEP 3: Reload your app page (F5) so it picks up the new column. Then check "Tax exempt".

-- 1) Add the column
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.tax_exempt IS 'When true, tax is not applied and grand total equals subtotal.';

-- 2) In a separate query, run this to refresh the API schema cache:
-- NOTIFY pgrst, 'reload schema';
