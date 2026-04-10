-- Separate estimate numbering from formal proposal numbers (same job: proposal # unchanged, estimates get {proposal}-E{n}).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS estimate_number text;

-- Estimates clear proposal_number so they do not appear as another formal proposal #; allow NULL.
ALTER TABLE public.quotes
  ALTER COLUMN proposal_number DROP NOT NULL;

COMMENT ON COLUMN public.quotes.estimate_number IS
  'Customer-estimate identifier (e.g. 26040-9-E1), distinct from formal proposal_number. Set only when is_customer_estimate is true; cleared when converted to formal proposal.';

CREATE INDEX IF NOT EXISTS idx_quotes_job_estimate_number
  ON public.quotes (job_id)
  WHERE estimate_number IS NOT NULL;

-- Assign estimate_number after create_proposal_version(__MB_ESTIMATE__); clears proposal_number on the estimate row so it does not consume the proposal sequence visually.
CREATE OR REPLACE FUNCTION public.finalize_customer_estimate_number(
  p_quote_id uuid,
  p_anchor_quote_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_is_est boolean;
  v_anchor text;
  v_next int;
  v_est text;
  r public.quotes%ROWTYPE;
BEGIN
  SELECT job_id, COALESCE(is_customer_estimate, false)
  INTO v_job_id, v_is_est
  FROM public.quotes
  WHERE id = p_quote_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  IF NOT v_is_est THEN
    RAISE EXCEPTION 'Quote % is not a customer estimate', p_quote_id;
  END IF;

  v_anchor := NULL;

  IF p_anchor_quote_id IS NOT NULL THEN
    SELECT proposal_number INTO v_anchor
    FROM public.quotes
    WHERE id = p_anchor_quote_id
      AND job_id = v_job_id
      AND COALESCE(is_customer_estimate, false) = false
      AND proposal_number IS NOT NULL
      AND trim(proposal_number) <> '';
  END IF;

  IF v_anchor IS NULL OR trim(v_anchor) = '' THEN
    SELECT proposal_number INTO v_anchor
    FROM public.quotes
    WHERE job_id = v_job_id
      AND COALESCE(is_customer_estimate, false) = false
      AND COALESCE(is_change_order_proposal, false) = false
      AND proposal_number IS NOT NULL
      AND trim(proposal_number) <> ''
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_anchor IS NULL OR trim(v_anchor) = '' THEN
    SELECT proposal_number INTO v_anchor
    FROM public.quotes
    WHERE job_id = v_job_id
      AND COALESCE(is_customer_estimate, false) = false
      AND proposal_number IS NOT NULL
      AND trim(proposal_number) <> ''
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_anchor IS NULL OR trim(v_anchor) = '' THEN
    v_anchor := 'JOB-' || left(replace(v_job_id::text, '-', ''), 8);
  END IF;

  v_anchor := trim(v_anchor);

  SELECT COALESCE(MAX(substring(q.estimate_number from '-E([0-9]+)$')::int), 0) + 1
  INTO v_next
  FROM public.quotes q
  WHERE q.job_id = v_job_id
    AND q.id IS DISTINCT FROM p_quote_id
    AND q.estimate_number IS NOT NULL
    AND q.estimate_number LIKE v_anchor || '-E%';

  v_est := v_anchor || '-E' || v_next::text;

  UPDATE public.quotes
  SET
    estimate_number = v_est,
    proposal_number = NULL,
    updated_at = now()
  WHERE id = p_quote_id;

  SELECT * INTO r FROM public.quotes WHERE id = p_quote_id;
  RETURN to_jsonb(r);
END;
$$;

COMMENT ON FUNCTION public.finalize_customer_estimate_number(uuid, uuid) IS
  'After creating a customer estimate quote: sets estimate_number ({formal proposal}-E{n}) and clears proposal_number on that row. Optional p_anchor_quote_id = formal proposal quote to tie numbering.';

GRANT EXECUTE ON FUNCTION public.finalize_customer_estimate_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_estimate_number(uuid, uuid) TO service_role;

-- Clear estimate_number when a row is converted from customer estimate to formal proposal.
CREATE OR REPLACE FUNCTION public.quotes_clear_estimate_when_formalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_customer_estimate, false) = true
     AND COALESCE(NEW.is_customer_estimate, false) = false
  THEN
    NEW.estimate_number := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_clear_estimate_when_formalized ON public.quotes;
CREATE TRIGGER trg_quotes_clear_estimate_when_formalized
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE PROCEDURE public.quotes_clear_estimate_when_formalized();

NOTIFY pgrst, 'reload schema';
