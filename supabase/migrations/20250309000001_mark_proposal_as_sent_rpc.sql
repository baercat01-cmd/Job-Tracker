-- Mark proposal as sent: lock workbooks and set sent_at/sent_by.
-- Used by the "Mark as Sent" button in JobFinancials.
CREATE OR REPLACE FUNCTION public.mark_proposal_as_sent(
  p_quote_id uuid,
  p_user_id uuid DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lock material workbooks for this quote
  UPDATE material_workbooks
  SET status = 'locked', updated_at = now()
  WHERE quote_id = p_quote_id;

  -- Set sent timestamp and user on quote
  UPDATE quotes
  SET sent_at = now(), sent_by = p_user_id
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO service_role;

-- Reload PostgREST schema so the new RPC is visible to the API (fixes "Mark as Sent" button).
NOTIFY pgrst, 'reload schema';
