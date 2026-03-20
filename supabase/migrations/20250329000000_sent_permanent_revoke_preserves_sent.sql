-- Mark as sent: only set sent_at/sent_by (do not lock material_workbooks).
-- Revoke contract: clear signature and office lock but keep sent_at/sent_by (send is permanent).

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
  UPDATE quotes
  SET sent_at = coalesce(sent_at, now()), sent_by = coalesce(sent_by, p_user_id), updated_at = now()
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

COMMENT ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) IS
  'Records when a proposal was sent (sent_at/sent_by). Does not lock workbooks; contract signing locks materials.';

CREATE OR REPLACE FUNCTION public.revoke_quote_contract(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_wb_id uuid;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  END IF;

  UPDATE quotes
  SET
    customer_signed_at = null,
    customer_signed_name = null,
    customer_signed_email = null,
    signed_version = null,
    locked_for_editing = false,
    status = CASE WHEN v_quote.job_id IS NOT NULL THEN 'won' ELSE 'estimated' END,
    updated_at = now()
  WHERE id = p_quote_id;

  UPDATE proposal_versions
  SET is_signed = false, signed_at = null, signed_by = null
  WHERE quote_id = p_quote_id;

  SELECT id INTO v_wb_id
  FROM material_workbooks
  WHERE quote_id = p_quote_id
  ORDER BY version_number DESC NULLS LAST, updated_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    UPDATE material_workbooks
    SET status = 'working', updated_at = now()
    WHERE id = v_wb_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

COMMENT ON FUNCTION public.revoke_quote_contract(uuid) IS
  'Office revokes contract with customer consent: clears signature and signed_version, clears office lock, restores latest workbook to working. Preserves sent_at / Mark as sent.';

NOTIFY pgrst, 'reload schema';
