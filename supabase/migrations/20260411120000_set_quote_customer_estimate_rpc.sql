-- Sets quotes.is_customer_estimate and returns the full row as jsonb so the app never PATCHes
-- or SELECTs that column through PostgREST when the quotes schema cache is stale.

DROP FUNCTION IF EXISTS public.set_quote_customer_estimate(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_quote_customer_estimate(
  p_quote_id uuid,
  p_is_estimate boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.quotes%ROWTYPE;
  n int;
BEGIN
  UPDATE public.quotes
  SET is_customer_estimate = COALESCE(p_is_estimate, false)
  WHERE id = p_quote_id
  RETURNING * INTO r;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;
  RETURN to_jsonb(r);
END;
$$;

COMMENT ON FUNCTION public.set_quote_customer_estimate(uuid, boolean) IS
  'Sets is_customer_estimate and returns updated quotes row as jsonb (avoids REST schema cache on PATCH/SELECT).';

GRANT EXECUTE ON FUNCTION public.set_quote_customer_estimate(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_customer_estimate(uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
