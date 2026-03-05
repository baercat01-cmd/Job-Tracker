-- Add sent_at and sent_by to quotes for "Mark as sent" (lock proposal + materials, timestamp).
-- Required for the Mark as Sent button in JobFinancials.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid;

COMMENT ON COLUMN quotes.sent_at IS 'When the proposal was marked as sent to customer; locks proposal and materials.';
COMMENT ON COLUMN quotes.sent_by IS 'User who marked the proposal as sent.';

-- Reload PostgREST schema so sent_at/sent_by are visible to the API.
NOTIFY pgrst, 'reload schema';
