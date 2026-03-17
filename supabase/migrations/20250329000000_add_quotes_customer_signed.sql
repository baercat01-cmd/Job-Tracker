-- Customer can sign a proposal in the portal to use it as the contract.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS customer_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_signed_name text,
  ADD COLUMN IF NOT EXISTS customer_signed_email text,
  ADD COLUMN IF NOT EXISTS status text;

COMMENT ON COLUMN public.quotes.customer_signed_at IS 'When the customer signed this proposal in the portal (use as contract).';
COMMENT ON COLUMN public.quotes.customer_signed_name IS 'Full name of the person who signed the proposal in the customer portal.';
COMMENT ON COLUMN public.quotes.customer_signed_email IS 'Email of the person who signed the proposal in the customer portal.';
COMMENT ON COLUMN public.quotes.status IS 'Quote/proposal state: e.g. draft, locked (sent), signed (customer accepted in portal).';
