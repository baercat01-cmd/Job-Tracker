-- RPC to set tax_exempt on quotes so the app can save even when PostgREST schema cache
-- does not yet expose the tax_exempt column on the quotes table.
-- Ensures tax exempt saves to the job after the user selects it.

CREATE OR REPLACE FUNCTION set_quote_tax_exempt(
  p_job_id uuid,
  p_quote_id uuid,
  p_value boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_value THEN
    UPDATE quotes SET tax_exempt = true WHERE job_id = p_job_id;
  ELSE
    UPDATE quotes SET tax_exempt = false WHERE id = p_quote_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION set_quote_tax_exempt(uuid, uuid, boolean) IS 'Set tax_exempt on quote(s). When true: all quotes for job_id; when false: single quote by id. Use when PostgREST schema cache does not expose tax_exempt column.';

-- Required: allow the app (authenticated user) to call this function via the API
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
