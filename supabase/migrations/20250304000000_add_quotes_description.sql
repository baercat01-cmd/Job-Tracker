-- Add description to quotes so "Create New Proposal" (Step 1 insert) succeeds.
-- PostgREST schema cache error: "Could not find the 'description' column of 'quotes'"
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN quotes.description IS 'Building or proposal description (e.g. for proposal summary).';
