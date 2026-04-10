-- Renumber formal proposals for one job so the NEWEST quote (by created_at) shows as {base}-1,
-- the next-newest as {base}-2, etc. Does NOT move workbooks, rows, or IDs — only proposal_number / quote_number.
--
-- Usage:
--   1. In Supabase SQL Editor, set v_anchor_quote_id to the UUID of the proposal row you have open
--      (e.g. the one that currently shows 26040-11).
--   2. Run the whole script.
--
-- Optional: set v_include_change_orders = true to include change-order proposal rows in the same sequence.

BEGIN;

DO $$
DECLARE
  v_anchor_quote_id uuid := '00000000-0000-0000-0000-000000000000';  -- <-- paste quote id here
  v_job_id uuid;
  v_base text;
  v_include_change_orders boolean := false;
BEGIN
  IF v_anchor_quote_id IS NULL OR v_anchor_quote_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Set v_anchor_quote_id to your current quotes.id';
  END IF;

  SELECT job_id INTO v_job_id FROM public.quotes WHERE id = v_anchor_quote_id;
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Quote % not found', v_anchor_quote_id;
  END IF;

  SELECT (regexp_match(proposal_number, '^([0-9]+)-'))[1]
  INTO v_base
  FROM public.quotes
  WHERE id = v_anchor_quote_id
    AND proposal_number IS NOT NULL
    AND proposal_number ~ '^[0-9]+-[0-9]+$';

  IF v_base IS NULL OR btrim(v_base) = '' THEN
    RAISE EXCEPTION 'Could not parse base from proposal_number on quote % (expected like 26040-11)', v_anchor_quote_id;
  END IF;

  WITH ranked AS (
    SELECT
      q.id,
      row_number() OVER (ORDER BY q.created_at DESC NULLS LAST, q.id DESC) AS n
    FROM public.quotes q
    WHERE q.job_id = v_job_id
      AND COALESCE(q.is_customer_estimate, false) = false
      AND (
        v_include_change_orders
        OR COALESCE(q.is_change_order_proposal, false) = false
      )
  )
  UPDATE public.quotes q
  SET
    proposal_number = v_base || '-' || r.n::text,
    quote_number = v_base || '-' || r.n::text
  FROM ranked r
  WHERE q.id = r.id;
END $$;

COMMIT;
