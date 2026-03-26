-- Sent locking + contract pairing rules (2026-03-26)
-- - Mark as sent: permanent sent_at, locks proposal + workbook (single-workbook; no working copy).
-- - Signed contract: locked snapshot + separate working copy for job tracking.
-- - Revoke contract: clears contract flags, preserves sent_at/sent_by.

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
  SET
    sent_at = COALESCE(sent_at, now()),
    sent_by = COALESCE(sent_by, p_user_id),
    locked_for_editing = true,
    updated_at = now()
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  -- Sent = single-workbook lock (no copies). Only lock working rows.
  UPDATE material_workbooks
  SET status = 'locked', updated_at = now()
  WHERE quote_id = p_quote_id
    AND status = 'working';

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

COMMENT ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) IS
  'Records sent_at/sent_by (permanent) and locks proposal + working material workbook(s) for the quote.';

CREATE OR REPLACE FUNCTION public.revoke_quote_contract(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_only_locked_id uuid;
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

  -- If this quote has ONLY locked workbooks (no working), restore the newest locked row to working.
  -- If a locked+working pair already exists, leave it to the app to prune/choose correctly.
  IF NOT EXISTS (
    SELECT 1 FROM material_workbooks WHERE quote_id = p_quote_id AND status = 'working'
  ) THEN
    SELECT id INTO v_only_locked_id
    FROM material_workbooks
    WHERE quote_id = p_quote_id AND status = 'locked'
    ORDER BY version_number DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_only_locked_id IS NOT NULL THEN
      UPDATE material_workbooks
      SET status = 'working', updated_at = now()
      WHERE id = v_only_locked_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

COMMENT ON FUNCTION public.revoke_quote_contract(uuid) IS
  'Revokes contract: clears signature + signed_version, clears locked_for_editing, preserves sent_at/sent_by; restores a working workbook if none exists.';

-- Customer portal signing: lock snapshot + create working copy (job tracking)
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
  v_src_wb_id uuid;
  v_new_wb_id uuid;
  v_next_ver int;
  v_old_sheet_id uuid;
  v_new_sheet_id uuid;
  v_sheet_id_map jsonb := '{}';
  v_map_rec record;
  v_cmp uuid;
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

  -- Lock any working workbook(s) as the contract snapshot.
  UPDATE material_workbooks
  SET status = 'locked', updated_at = now()
  WHERE quote_id = p_quote_id AND status = 'working';

  -- Ensure there is a separate editable working copy for job tracking.
  IF v_quote.job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM material_workbooks WHERE quote_id = p_quote_id AND status = 'working'
  ) THEN
    SELECT id INTO v_src_wb_id
    FROM material_workbooks
    WHERE quote_id = p_quote_id AND status = 'locked'
    ORDER BY version_number DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_src_wb_id IS NOT NULL THEN
      SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_ver
      FROM material_workbooks
      WHERE job_id = v_quote.job_id;

      INSERT INTO material_workbooks (job_id, quote_id, version_number, status, created_by)
      VALUES (v_quote.job_id, p_quote_id, v_next_ver, 'working', NULL)
      RETURNING id INTO v_new_wb_id;

      FOR v_old_sheet_id IN
        SELECT id FROM material_sheets WHERE workbook_id = v_src_wb_id ORDER BY order_index
      LOOP
        INSERT INTO material_sheets (
          workbook_id, sheet_name, order_index, is_option, description,
          sheet_type, change_order_seq, category_order, compare_to_sheet_id
        )
        SELECT
          v_new_wb_id, sheet_name, order_index, is_option, description,
          COALESCE(sheet_type, 'proposal'),
          change_order_seq,
          category_order,
          NULL
        FROM material_sheets
        WHERE id = v_old_sheet_id
        RETURNING id INTO v_new_sheet_id;

        v_sheet_id_map := v_sheet_id_map || jsonb_build_object(v_old_sheet_id::text, v_new_sheet_id);

        INSERT INTO material_items (
          sheet_id, category, usage, sku, material_name, quantity, length, color,
          cost_per_unit, markup_percent, price_per_unit, extended_cost, extended_price,
          taxable, notes, order_index, status,
          trim_saved_config_id, quantity_ready_for_job, is_optional
        )
        SELECT
          v_new_sheet_id,
          category, usage, sku, material_name, quantity, length, color,
          cost_per_unit, markup_percent, price_per_unit, extended_cost, extended_price,
          taxable, notes, order_index, COALESCE(status, 'not_ordered'),
          trim_saved_config_id, quantity_ready_for_job, COALESCE(is_optional, false)
        FROM material_items
        WHERE sheet_id = v_old_sheet_id
        ORDER BY order_index;

        INSERT INTO material_sheet_labor (sheet_id, description, estimated_hours, hourly_rate, notes, total_labor_cost)
        SELECT v_new_sheet_id, description, estimated_hours, hourly_rate, notes, total_labor_cost
        FROM material_sheet_labor
        WHERE sheet_id = v_old_sheet_id;

        INSERT INTO material_category_markups (sheet_id, category_name, markup_percent)
        SELECT v_new_sheet_id, category_name, markup_percent
        FROM material_category_markups
        WHERE sheet_id = v_old_sheet_id;
      END LOOP;

      -- Remap compare_to_sheet_id inside the cloned workbook.
      FOR v_map_rec IN SELECT * FROM jsonb_each_text(v_sheet_id_map)
      LOOP
        SELECT compare_to_sheet_id INTO v_cmp FROM material_sheets WHERE id = (v_map_rec.key)::uuid;
        IF v_cmp IS NOT NULL AND (v_sheet_id_map ? v_cmp::text) THEN
          UPDATE material_sheets
          SET compare_to_sheet_id = ((v_sheet_id_map ->> v_cmp::text)::uuid)
          WHERE id = (v_map_rec.value)::uuid;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

COMMENT ON FUNCTION public.customer_sign_proposal(text, uuid, text, text) IS
  'Customer signs proposal in portal; sets signature + signed_version, locks proposal workbook snapshot and ensures a separate editable working copy.';

NOTIFY pgrst, 'reload schema';

