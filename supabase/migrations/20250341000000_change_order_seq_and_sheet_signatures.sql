-- Per change order sheet: sequence number (display CO-001) and per-sheet customer signatures on the CO quote

ALTER TABLE public.material_sheets
  ADD COLUMN IF NOT EXISTS change_order_seq integer;

COMMENT ON COLUMN public.material_sheets.change_order_seq IS
  'Sequential change order number within the job''s change order workbook (1, 2, 3…). Display as CO-001, etc.';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS change_order_signatures jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quotes.change_order_signatures IS
  'Map of material_sheet id (as text) to { signed_at, signed_name, signed_email } for customer portal.';

-- Backfill change_order_seq for existing change order sheets (per CO workbook, by order_index)
WITH co_sheets AS (
  SELECT
    ms.id,
    ROW_NUMBER() OVER (
      PARTITION BY wb.id
      ORDER BY ms.order_index NULLS LAST, ms.created_at NULLS LAST
    ) AS rn
  FROM public.material_sheets ms
  JOIN public.material_workbooks wb ON wb.id = ms.workbook_id
  JOIN public.quotes q ON q.id = wb.quote_id AND q.is_change_order_proposal = true
  WHERE COALESCE(ms.sheet_type, '') = 'change_order'
)
UPDATE public.material_sheets ms
SET change_order_seq = co_sheets.rn
FROM co_sheets
WHERE ms.id = co_sheets.id
  AND (ms.change_order_seq IS NULL OR ms.change_order_seq = 0);

CREATE OR REPLACE FUNCTION public.customer_sign_change_order_sheet(
  p_access_token text,
  p_sheet_id uuid,
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
  v_job_id uuid;
  v_co_quote_id uuid;
  v_sheet material_sheets%ROWTYPE;
  v_wb material_workbooks%ROWTYPE;
  v_key text;
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
  v_job_id := v_access.job_id;

  SELECT * INTO v_sheet FROM material_sheets WHERE id = p_sheet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Change order not found.');
  END IF;
  IF COALESCE(v_sheet.sheet_type, '') <> 'change_order' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid change order.');
  END IF;

  SELECT * INTO v_wb FROM material_workbooks WHERE id = v_sheet.workbook_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Workbook not found.');
  END IF;
  IF v_wb.job_id IS DISTINCT FROM v_job_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This change order does not belong to your portal.');
  END IF;

  SELECT id INTO v_co_quote_id
  FROM quotes
  WHERE job_id = v_job_id AND is_change_order_proposal = true
  LIMIT 1;
  IF v_co_quote_id IS NULL OR v_wb.quote_id IS DISTINCT FROM v_co_quote_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Change order is not available for signing.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = v_co_quote_id AND sent_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This change order has not been sent yet.');
  END IF;

  v_key := p_sheet_id::text;
  IF EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = v_co_quote_id
      AND q.change_order_signatures ? v_key
      AND (q.change_order_signatures->v_key->>'signed_at') IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This change order has already been signed.');
  END IF;

  UPDATE quotes
  SET
    change_order_signatures = jsonb_set(
      COALESCE(change_order_signatures, '{}'::jsonb),
      ARRAY[v_key],
      jsonb_build_object(
        'signed_at', to_jsonb(now()),
        'signed_name', to_jsonb(trim(p_signer_name)),
        'signed_email', to_jsonb(trim(p_signer_email))
      ),
      true
    ),
    updated_at = now()
  WHERE id = v_co_quote_id;

  RETURN jsonb_build_object('ok', true, 'sheet_id', p_sheet_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_sign_change_order_sheet(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.customer_sign_change_order_sheet(text, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.customer_sign_change_order_sheet(text, uuid, text, text) IS
  'Customer portal: sign one change order sheet (by sheet id) on the job''s change order quote.';
