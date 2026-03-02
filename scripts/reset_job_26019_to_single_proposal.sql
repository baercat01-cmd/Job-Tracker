-- Reset job 26019 to only have the first proposal (26019-1)
-- Removes the 2nd and 3rd proposals; keeps only 26019-1.
-- Run in Supabase SQL Editor. Run in a transaction so you can ROLLBACK if needed.

DO $$
DECLARE
  v_job_id UUID;
  v_keep_quote_id UUID;
  v_quote_ids_to_delete UUID[];
BEGIN
  -- 1) Find job 26019 (by job_number or name)
  SELECT id INTO v_job_id
  FROM jobs
  WHERE job_number::text = '26019'
     OR name::text LIKE '%26019%'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Job 26019 not found';
  END IF;

  -- 2) Quote to KEEP: prefer proposal_number = '26019-1', else oldest by created_at
  SELECT id INTO v_keep_quote_id
  FROM quotes
  WHERE job_id = v_job_id
  ORDER BY CASE WHEN proposal_number = '26019-1' THEN 0 ELSE 1 END,
           created_at ASC
  LIMIT 1;

  IF v_keep_quote_id IS NULL THEN
    RAISE EXCEPTION 'No quotes found for job 26019';
  END IF;

  -- 3) All other quotes for this job (to delete)
  SELECT ARRAY_AGG(id) INTO v_quote_ids_to_delete
  FROM quotes
  WHERE job_id = v_job_id
    AND id <> v_keep_quote_id;

  IF v_quote_ids_to_delete IS NULL OR array_length(v_quote_ids_to_delete, 1) IS NULL THEN
    RAISE NOTICE 'Job 26019 already has only one quote. Nothing to delete.';
    UPDATE quotes SET proposal_number = '26019-1' WHERE id = v_keep_quote_id AND (proposal_number IS NULL OR proposal_number <> '26019-1');
    RETURN;
  END IF;

  -- 4) Delete dependent data for the quotes we are removing

  DELETE FROM proposal_versions
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  DELETE FROM subcontractor_estimate_line_items
  WHERE estimate_id IN (SELECT id FROM subcontractor_estimates WHERE quote_id = ANY(v_quote_ids_to_delete));

  DELETE FROM subcontractor_estimates
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  DELETE FROM custom_financial_row_items
  WHERE row_id IN (SELECT id FROM custom_financial_rows WHERE quote_id = ANY(v_quote_ids_to_delete));

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
  WHERE workbook_id IN (SELECT id FROM material_workbooks WHERE quote_id = ANY(v_quote_ids_to_delete));
  DELETE FROM material_workbooks
  WHERE quote_id = ANY(v_quote_ids_to_delete);

  -- 5) Delete the extra quotes
  DELETE FROM quotes
  WHERE id = ANY(v_quote_ids_to_delete);

  -- 6) Ensure the kept quote has proposal_number 26019-1
  UPDATE quotes
  SET proposal_number = '26019-1'
  WHERE id = v_keep_quote_id
    AND (proposal_number IS NULL OR proposal_number <> '26019-1');

  RAISE NOTICE 'Job 26019 reset: kept quote % (26019-1), deleted % extra quote(s)', v_keep_quote_id, array_length(v_quote_ids_to_delete, 1);
END $$;
