-- Pause / resume a quote without changing workflow status (draft, won, etc.)
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.on_hold IS 'When true, quote is paused for follow-up; status column unchanged.';
