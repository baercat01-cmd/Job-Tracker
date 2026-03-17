-- RPC: customer signs a proposal from the portal (validates portal token and quote belong to same job).
CREATE OR REPLACE FUNCTION public.customer_sign_proposal(
  p_access_token text,
  p_quote_id uuid,
  p_signer_name text,
  p_signer_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access customer_portal_access%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_pv_id uuid;
  v_pv_version_number int;
BEGIN
  IF p_signer_name IS NULL OR trim(p_signer_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Signer name is required.');
  END IF;
  IF p_signer_email IS NULL OR trim(p_signer_email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Signer email is required.');
  END IF;

  SELECT * INTO v_access
  FROM customer_portal_access
  WHERE access_token = p_access_token AND is_active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired portal link.');
  END IF;

  SELECT * INTO v_quote
  FROM quotes
  WHERE id = p_quote_id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Proposal not found.');
  END IF;

  IF v_quote.job_id IS DISTINCT FROM v_access.job_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This proposal does not belong to your portal.');
  END IF;

  IF v_quote.sent_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This proposal has not been sent yet.');
  END IF;

  IF v_quote.customer_signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This proposal has already been signed.');
  END IF;

  UPDATE quotes
  SET
    customer_signed_at = now(),
    customer_signed_name = trim(p_signer_name),
    customer_signed_email = trim(p_signer_email),
    status = 'signed',
    updated_at = now()
  WHERE id = p_quote_id;

  -- Activate "Set as Contract" in office: set signed_version and mark proposal version as signed if one exists
  SELECT id, version_number INTO v_pv_id, v_pv_version_number
  FROM proposal_versions
  WHERE quote_id = p_quote_id
  ORDER BY version_number DESC
  LIMIT 1;
  IF FOUND THEN
    UPDATE proposal_versions SET is_signed = true, signed_at = now() WHERE id = v_pv_id;
    UPDATE quotes SET signed_version = v_pv_version_number, updated_at = now() WHERE id = p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_sign_proposal(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_sign_proposal(text, uuid, text, text) TO authenticated;
COMMENT ON FUNCTION public.customer_sign_proposal(text, uuid, text, text) IS 'Customer signs a proposal from the portal to use it as the contract; validates portal token and quote job.';
