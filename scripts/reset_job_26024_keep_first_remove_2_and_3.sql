-- Remove proposals 26024-2 and 26024-3 from job 26024. Keeps 26024-1 only.
-- No workbook move; 26024-1 keeps its own materials. (App fallback uses job-level
-- workbook for proposal totals when the proposal's workbook is empty.)
-- Run in Supabase SQL Editor. Use BEGIN; ... COMMIT; or ROLLBACK; as needed.

DO $$
DECLARE
  v_job_id UUID;
  v_quote_ids_to_delete UUID[];
BEGIN
  -- 1) Find job 26024
  SELECT id INTO v_job_id
  FROM jobs
  WHERE job_number::text = '26024'
     OR name::text ILIKE '%26024%'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Job 26024 not found';
  END IF;

  -- 2) Quotes to remove: 26024-2 and 26024-3
  SELECT ARRAY_AGG(id) INTO v_quote_ids_to_delete
  FROM quotes
  WHERE job_id = v_job_id
    AND (proposal_number IN ('26024-2', '26024-3') OR quote_number IN ('26024-2', '26024-3'));

  IF v_quote_ids_to_delete IS NULL OR array_length(v_quote_ids_to_delete, 1) IS NULL THEN
    RAISE NOTICE 'No 26024-2 or 26024-3 proposals to delete.';
    RETURN;
  END IF;

  -- 3) Delete dependent data for 26024-2 and 26024-3

  DELETE FROM proposal_versions
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  DELETE FROM subcontractor_estimate_line_items
  WHERE estimate_id IN (
    SELECT id FROM subcontractor_estimates WHERE quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM subcontractor_estimates
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  DELETE FROM custom_financial_row_items
  WHERE row_id IN (
    SELECT id FROM custom_financial_rows WHERE quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM custom_financial_row_items
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM custom_financial_rows
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  DELETE FROM material_items
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM material_sheet_labor
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM material_category_markups
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM material_sheets
  WHERE workbook_id IN (
    SELECT id FROM material_workbooks WHERE quote_id = ANY(v_quote_ids_to_delete)
  );
  DELETE FROM material_workbooks
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  DELETE FROM quotes
  WHERE id = ANY(v_quote_ids_to_delete);

  RAISE NOTICE 'Removed proposals 26024-2 and 26024-3 (% quote(s) deleted). 26024-1 unchanged.', array_length(v_quote_ids_to_delete, 1);
END $$;
