-- Customer portal sign: always align office contract (signed_version + proposal_versions)
-- even when no version row existed before.

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

  SELECT id, version_number INTO v_pv_id, v_pv_version_number
  FROM proposal_versions
  WHERE quote_id = p_quote_id
  ORDER BY version_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO proposal_versions (
      quote_id, version_number,
      customer_name, customer_address, customer_email, customer_phone,
      project_name, width, length, estimated_price,
      workbook_snapshot, financial_rows_snapshot, subcontractor_snapshot,
      change_notes, created_by,
      is_signed, signed_at
    )
    VALUES (
      p_quote_id, 1,
      v_quote.customer_name, v_quote.customer_address, v_quote.customer_email, v_quote.customer_phone,
      v_quote.project_name, COALESCE(v_quote.width, 0), COALESCE(v_quote.length, 0), v_quote.estimated_price,
      NULL, NULL, NULL,
      'Customer portal signature', NULL,
      true, now()
    )
    RETURNING id, version_number INTO v_pv_id, v_pv_version_number;
  ELSE
    UPDATE proposal_versions SET is_signed = true, signed_at = now() WHERE id = v_pv_id;
  END IF;

  UPDATE quotes
  SET signed_version = v_pv_version_number, updated_at = now()
  WHERE id = p_quote_id;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_sign_proposal(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_sign_proposal(text, uuid, text, text) TO authenticated;
