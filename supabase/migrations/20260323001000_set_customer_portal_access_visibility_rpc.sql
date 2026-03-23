-- Fallback RPC for portal visibility saves when PostgREST schema cache strips optional columns.

CREATE OR REPLACE FUNCTION public.set_customer_portal_access_visibility(
  p_link_id uuid,
  p_show_proposal boolean,
  p_show_payments boolean,
  p_show_schedule boolean,
  p_show_documents boolean,
  p_show_photos boolean,
  p_show_financial_summary boolean,
  p_show_line_item_prices boolean,
  p_show_material_items_no_prices boolean,
  p_show_section_prices jsonb,
  p_visibility_by_quote jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customer_portal_access
  SET
    show_proposal = p_show_proposal,
    show_payments = p_show_payments,
    show_schedule = p_show_schedule,
    show_documents = p_show_documents,
    show_photos = p_show_photos,
    show_financial_summary = p_show_financial_summary,
    show_line_item_prices = p_show_line_item_prices,
    show_material_items_no_prices = p_show_material_items_no_prices,
    show_section_prices = COALESCE(p_show_section_prices, '{}'::jsonb),
    visibility_by_quote = COALESCE(p_visibility_by_quote, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_link_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_portal_access_visibility(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb
) TO authenticated;
