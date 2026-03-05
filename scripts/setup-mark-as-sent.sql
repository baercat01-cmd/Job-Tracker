-- ============================================================
-- SETUP: Mark as Sent (run this once in Supabase SQL Editor)
-- ============================================================

-- Step 1: Add sent_at and sent_by columns to quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid;

-- Step 2: Create the RPC function
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
  -- Lock material workbooks for this quote
  UPDATE material_workbooks
  SET status = 'locked', updated_at = now()
  WHERE quote_id = p_quote_id;

  -- Set sent timestamp and user on quote
  UPDATE quotes
  SET sent_at = now(), sent_by = p_user_id
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO service_role;

-- Step 3: Reload PostgREST schema cache so the API sees the new columns and function
NOTIFY pgrst, 'reload schema';
