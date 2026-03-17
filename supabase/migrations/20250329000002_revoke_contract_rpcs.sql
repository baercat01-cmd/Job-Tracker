-- Revoke contract: office (with consent) and customer (self-revoke from portal).

-- Office revokes contract (only with customer consent – confirmed in UI).
CREATE OR REPLACE FUNCTION public.revoke_quote_contract(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_pv_id uuid;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  END IF;

  -- Clear customer signature and contract state
  UPDATE quotes
  SET
    customer_signed_at = null,
    customer_signed_name = null,
    customer_signed_email = null,
    status = 'locked',
    signed_version = null,
    updated_at = now()
  WHERE id = p_quote_id;

  -- Unsign the proposal version if one was set
  SELECT id INTO v_pv_id
  FROM proposal_versions
  WHERE quote_id = p_quote_id
  ORDER BY version_number DESC
  LIMIT 1;
  IF FOUND THEN
    UPDATE proposal_versions SET is_signed = false, signed_at = null, signed_by = null WHERE quote_id = p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_quote_contract(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_quote_contract(uuid) TO service_role;
COMMENT ON FUNCTION public.revoke_quote_contract(uuid) IS 'Revoke contract for a quote (office only). Clear customer signature and signed_version. Use only with customer consent.';

-- Customer revokes their own signature from the portal.
CREATE OR REPLACE FUNCTION public.customer_revoke_proposal_signature(p_access_token text, p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access customer_portal_access%ROWTYPE;
  v_quote quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_access FROM customer_portal_access WHERE access_token = p_access_token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired portal link.');
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  END IF;

  IF v_quote.job_id IS DISTINCT FROM v_access.job_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This proposal does not belong to your portal.');
  END IF;

  IF v_quote.customer_signed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This proposal is not signed.');
  END IF;

  UPDATE quotes
  SET
    customer_signed_at = null,
    customer_signed_name = null,
    customer_signed_email = null,
    status = 'locked',
    signed_version = null,
    updated_at = now()
  WHERE id = p_quote_id;

  UPDATE proposal_versions SET is_signed = false, signed_at = null, signed_by = null WHERE quote_id = p_quote_id;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.customer_revoke_proposal_signature(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_revoke_proposal_signature(text, uuid) TO authenticated;
COMMENT ON FUNCTION public.customer_revoke_proposal_signature(text, uuid) IS 'Customer revokes their signature from the portal. Clears contract state.';
