-- Mark proposal as sent: lock workbooks and set sent_at/sent_by (runs in DB, bypasses schema cache).
--
-- SETUP (do this once):
-- 1. Run add-quote-sent-columns.sql first (adds sent_at, sent_by to quotes).
-- 2. In Supabase Dashboard → SQL Editor: paste this entire file → Run.
-- 3. If "Mark as Sent" still errors, refresh the PostgREST schema cache (Supabase-recommended fix):
--    In SQL Editor run these TWO statements in order (same query or one after the other):
--      select pg_notification_queue_usage();
--      NOTIFY pgrst, 'reload schema';
--    Then retry "Mark as Sent" in the app.

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

  -- Set sent timestamp and user on quote (column must exist; run add-quote-sent-columns.sql first)
  UPDATE quotes
  SET sent_at = now(), sent_by = p_user_id
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

-- Allow authenticated users to call
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO service_role;

-- Reload schema so the RPC is visible
NOTIFY pgrst, 'reload schema';
