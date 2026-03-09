-- RPC to delete a proposal (quote) and all dependent data.
-- Runs with SECURITY DEFINER so it can delete despite RLS on child tables.
-- Call from app: supabase.rpc('delete_proposal', { p_quote_id: '<uuid>' })

CREATE OR REPLACE FUNCTION public.delete_proposal(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_quote_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_quote_id is required');
  END IF;

  DELETE FROM proposal_versions
  WHERE quote_id = p_quote_id;

  DELETE FROM subcontractor_estimate_line_items
  WHERE estimate_id IN (SELECT id FROM subcontractor_estimates WHERE quote_id = p_quote_id);
  DELETE FROM subcontractor_estimates
  WHERE quote_id = p_quote_id;

  DELETE FROM custom_financial_row_items
  WHERE row_id IN (SELECT id FROM custom_financial_rows WHERE quote_id = p_quote_id);
  DELETE FROM custom_financial_row_items
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = p_quote_id
  );
  DELETE FROM custom_financial_rows
  WHERE quote_id = p_quote_id;

  DELETE FROM material_items
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = p_quote_id
  );
  DELETE FROM material_sheet_labor
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = p_quote_id
  );
  DELETE FROM material_category_markups
  WHERE sheet_id IN (
    SELECT ms.id FROM material_sheets ms
    JOIN material_workbooks mw ON mw.id = ms.workbook_id
    WHERE mw.quote_id = p_quote_id
  );
  DELETE FROM material_sheets
  WHERE workbook_id IN (SELECT id FROM material_workbooks WHERE quote_id = p_quote_id);
  DELETE FROM material_workbooks
  WHERE quote_id = p_quote_id;

  DELETE FROM quotes
  WHERE id = p_quote_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.delete_proposal(uuid) IS 'Deletes a proposal (quote) and all dependent data. Use from app to avoid RLS blocking deletes on child tables.';

GRANT EXECUTE ON FUNCTION public.delete_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_proposal(uuid) TO service_role;
