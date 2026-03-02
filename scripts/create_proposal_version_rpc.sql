-- create_proposal_version: Deep-copy clone for air-gap proposal versions
-- Run this in your Supabase SQL Editor to create or replace the RPC.
-- When p_quote_id is set: creates a new quote and physically duplicates all
-- material_workbooks/sheets/items/labor/markups, custom_financial_rows/items,
-- and subcontractor_estimates/line_items with NEW UUIDs tied to the new quote_id.
-- When p_quote_id is null and p_job_id is set: creates a new (empty) quote for the job.

CREATE OR REPLACE FUNCTION create_proposal_version(
  p_quote_id UUID DEFAULT NULL,
  p_job_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_change_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
  v_new_quote_id UUID;
  v_old_wb_id UUID;
  v_new_wb_id UUID;
  v_old_sheet_id UUID;
  v_new_sheet_id UUID;
  v_old_row_id UUID;
  v_new_row_id UUID;
  v_old_est_id UUID;
  v_new_est_id UUID;
  v_sheet_id_map JSONB := '{}';
  v_row_id_map JSONB := '{}';
  v_est_id_map JSONB := '{}';
  v_next_wb_version INT;
  v_old_quote RECORD;
  v_snap_ver INT;
BEGIN
  -- Resolve job_id: from existing quote when cloning, or from param when creating first proposal
  IF p_quote_id IS NOT NULL THEN
    SELECT id, job_id, customer_name, customer_address, customer_email, customer_phone,
           project_name, width, length, description, estimated_price
      INTO v_old_quote
      FROM quotes
      WHERE id = p_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Quote % not found', p_quote_id;
    END IF;
    v_job_id := v_old_quote.job_id;
  ELSIF p_job_id IS NOT NULL THEN
    v_job_id := p_job_id;
  ELSE
    RAISE EXCEPTION 'Either p_quote_id or p_job_id must be provided';
  END IF;

  -- Create new quote row (trigger will set proposal_number from job_id)
  IF p_quote_id IS NOT NULL THEN
    INSERT INTO quotes (
      job_id, customer_name, customer_address, customer_email, customer_phone,
      project_name, width, length, status, created_by, description, estimated_price
    )
    VALUES (
      v_job_id,
      v_old_quote.customer_name,
      v_old_quote.customer_address,
      v_old_quote.customer_email,
      v_old_quote.customer_phone,
      v_old_quote.project_name,
      COALESCE(v_old_quote.width, 0),
      COALESCE(v_old_quote.length, 0),
      'draft',
      p_user_id,
      v_old_quote.description,
      v_old_quote.estimated_price
    )
    RETURNING id INTO v_new_quote_id;
  ELSE
    INSERT INTO quotes (job_id, status, created_by)
    VALUES (v_job_id, 'draft', p_user_id)
    RETURNING id INTO v_new_quote_id;
  END IF;

  -- Clone path: copy all data from old quote to new quote
  IF p_quote_id IS NOT NULL THEN
    -- Lock old proposal's workbooks
    UPDATE material_workbooks
    SET status = 'locked', updated_at = now()
    WHERE quote_id = p_quote_id;

    -- Optional: snapshot old quote into proposal_versions (same as frontend Step 5)
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_snap_ver
    FROM proposal_versions
    WHERE quote_id = p_quote_id;
    INSERT INTO proposal_versions (
      quote_id, version_number, customer_name, customer_address, customer_email,
      customer_phone, project_name, width, length, estimated_price,
      workbook_snapshot, financial_rows_snapshot, subcontractor_snapshot,
      change_notes, created_by
    )
    SELECT
      p_quote_id,
      v_snap_ver,
      v_old_quote.customer_name,
      v_old_quote.customer_address,
      v_old_quote.customer_email,
      v_old_quote.customer_phone,
      v_old_quote.project_name,
      COALESCE(v_old_quote.width, 0),
      COALESCE(v_old_quote.length, 0),
      v_old_quote.estimated_price,
      NULL,
      NULL,
      NULL,
      COALESCE(p_change_notes, 'New proposal version'),
      p_user_id;

    -- Workbook version for new quote
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_wb_version
    FROM material_workbooks
    WHERE job_id = v_job_id;

    -- Copy material_workbooks → material_sheets → material_items, material_sheet_labor, material_category_markups
    FOR v_old_wb_id IN
      SELECT id FROM material_workbooks WHERE quote_id = p_quote_id
    LOOP
      INSERT INTO material_workbooks (job_id, quote_id, version_number, status, created_by)
      SELECT job_id, v_new_quote_id, v_next_wb_version, 'working', p_user_id
      FROM material_workbooks WHERE id = v_old_wb_id
      RETURNING id INTO v_new_wb_id;
      v_next_wb_version := v_next_wb_version + 1;

      FOR v_old_sheet_id IN
        SELECT id FROM material_sheets WHERE workbook_id = v_old_wb_id ORDER BY order_index
      LOOP
        INSERT INTO material_sheets (workbook_id, sheet_name, order_index, is_option, description)
        SELECT v_new_wb_id, sheet_name, order_index, is_option, description
        FROM material_sheets WHERE id = v_old_sheet_id
        RETURNING id INTO v_new_sheet_id;
        v_sheet_id_map := v_sheet_id_map || jsonb_build_object(v_old_sheet_id::text, v_new_sheet_id);

        INSERT INTO material_items (
          sheet_id, category, usage, sku, material_name, quantity, length, color,
          cost_per_unit, markup_percent, price_per_unit, extended_cost, extended_price,
          taxable, notes, order_index, status
        )
        SELECT
          v_new_sheet_id,
          category, usage, sku, material_name, quantity, length, color,
          cost_per_unit, markup_percent, price_per_unit, extended_cost, extended_price,
          taxable, notes, order_index, status
        FROM material_items
        WHERE sheet_id = v_old_sheet_id
        ORDER BY order_index;

        INSERT INTO material_sheet_labor (sheet_id, description, estimated_hours, hourly_rate, notes)
        SELECT v_new_sheet_id, description, estimated_hours, hourly_rate, notes
        FROM material_sheet_labor
        WHERE sheet_id = v_old_sheet_id;

        INSERT INTO material_category_markups (sheet_id, category_name, markup_percent)
        SELECT v_new_sheet_id, category_name, markup_percent
        FROM material_category_markups
        WHERE sheet_id = v_old_sheet_id;
      END LOOP;
    END LOOP;

    -- Copy custom_financial_rows → custom_financial_row_items (row-linked and sheet-linked)
    FOR v_old_row_id IN
      SELECT id FROM custom_financial_rows WHERE quote_id = p_quote_id ORDER BY order_index
    LOOP
      INSERT INTO custom_financial_rows (
        job_id, quote_id, category, description, quantity, unit_cost, total_cost,
        markup_percent, selling_price, notes, order_index, taxable, sheet_id
      )
      SELECT
        job_id, v_new_quote_id,
        category, description, quantity, unit_cost, total_cost,
        markup_percent, selling_price, notes, order_index, taxable,
        CASE WHEN sheet_id IS NOT NULL AND (v_sheet_id_map ? sheet_id::text)
          THEN (v_sheet_id_map ->> sheet_id::text)::uuid
          ELSE NULL
        END
      FROM custom_financial_rows
      WHERE id = v_old_row_id
      RETURNING id INTO v_new_row_id;
      v_row_id_map := v_row_id_map || jsonb_build_object(v_old_row_id::text, v_new_row_id);

      INSERT INTO custom_financial_row_items (
        row_id, sheet_id, description, quantity, unit_cost, total_price, notes,
        order_index, taxable, markup_percent, item_type, labor_hours, labor_rate, labor_markup_percent, excluded
      )
      SELECT
        v_new_row_id,
        CASE WHEN c.sheet_id IS NOT NULL AND (v_sheet_id_map ? c.sheet_id::text)
          THEN (v_sheet_id_map ->> c.sheet_id::text)::uuid
          ELSE NULL
        END,
        c.description, c.quantity, c.unit_cost, COALESCE(c.total_price, c.total_cost), c.notes,
        c.order_index, c.taxable, c.markup_percent, c.item_type,
        c.labor_hours, c.labor_rate, c.labor_markup_percent, COALESCE(c.excluded, false)
      FROM custom_financial_row_items c
      WHERE c.row_id = v_old_row_id
      ORDER BY c.order_index;
    END LOOP;

    -- Sheet-linked custom_financial_row_items (row_id IS NULL) — only for sheets we cloned
    INSERT INTO custom_financial_row_items (
      row_id, sheet_id, description, quantity, unit_cost, total_price, notes,
      order_index, taxable, markup_percent, item_type, labor_hours, labor_rate, labor_markup_percent, excluded
    )
    SELECT
      NULL,
      (v_sheet_id_map ->> c.sheet_id::text)::uuid,
      c.description, c.quantity, c.unit_cost, COALESCE(c.total_price, c.total_cost), c.notes,
      c.order_index, c.taxable, c.markup_percent, c.item_type,
      c.labor_hours, c.labor_rate, c.labor_markup_percent, COALESCE(c.excluded, false)
    FROM custom_financial_row_items c
    WHERE c.row_id IS NULL
      AND (v_sheet_id_map ? c.sheet_id::text);

    -- Copy subcontractor_estimates → subcontractor_estimate_line_items
    FOR v_old_est_id IN
      SELECT id FROM subcontractor_estimates WHERE quote_id = p_quote_id ORDER BY order_index
    LOOP
      INSERT INTO subcontractor_estimates (
        job_id, quote_id, company_name, total_amount, markup_percent, scope_of_work,
        order_index, sheet_id, row_id, extraction_status
      )
      SELECT
        job_id, v_new_quote_id,
        company_name, total_amount, markup_percent, scope_of_work,
        order_index,
        CASE WHEN e.sheet_id IS NOT NULL AND (v_sheet_id_map ? e.sheet_id::text)
          THEN (v_sheet_id_map ->> e.sheet_id::text)::uuid
          ELSE NULL
        END,
        CASE WHEN e.row_id IS NOT NULL AND (v_row_id_map ? e.row_id::text)
          THEN (v_row_id_map ->> e.row_id::text)::uuid
          ELSE NULL
        END,
        COALESCE(extraction_status, 'completed')
      FROM subcontractor_estimates e
      WHERE e.id = v_old_est_id
      RETURNING id INTO v_new_est_id;
      v_est_id_map := v_est_id_map || jsonb_build_object(v_old_est_id::text, v_new_est_id);

      INSERT INTO subcontractor_estimate_line_items (
        estimate_id, description, quantity, unit_price, total_price, taxable, excluded, order_index, item_type, markup_percent
      )
      SELECT
        v_new_est_id,
        description, quantity, unit_price, total_price, taxable, COALESCE(excluded, false), order_index,
        COALESCE(item_type, 'material'), COALESCE(markup_percent, 0)
      FROM subcontractor_estimate_line_items
      WHERE estimate_id = v_old_est_id
      ORDER BY order_index;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'quote_id', v_new_quote_id,
    'job_id', v_job_id
  );
END;
$$;

-- Optional: ensure the function is executable by authenticated users
-- GRANT EXECUTE ON FUNCTION create_proposal_version(uuid, uuid, uuid, text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION create_proposal_version(uuid, uuid, uuid, text) TO service_role;
