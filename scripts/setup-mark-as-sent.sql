-- Fix "Mark as Sent" feature
-- Run this in Supabase SQL Editor if you see: "Mark as sent failed" or "column sent_at does not exist"
-- This migration adds the required columns to quotes and ensures the RPC exists

-- 1) Add sent_at column (when the proposal was sent to customer)
ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- 2) Add sent_by column (who marked it as sent)
ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- 3) Add locked_for_editing column (future use - prevents editing sent proposals)
ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS locked_for_editing boolean DEFAULT false;

-- 4) Add comments for documentation
COMMENT ON COLUMN public.quotes.sent_at IS 'Timestamp when this proposal was marked as sent to the customer';
COMMENT ON COLUMN public.quotes.sent_by IS 'User who marked this proposal as sent';
COMMENT ON COLUMN public.quotes.locked_for_editing IS 'When true, proposal is locked and read-only';

-- 5) Create or update the mark_proposal_as_sent RPC
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
  -- Lock material workbooks for this quote (prevents editing materials after sent)
  UPDATE material_workbooks
  SET status = 'locked', updated_at = now()
  WHERE quote_id = p_quote_id;

  -- Mark quote as sent with timestamp and user
  UPDATE quotes
  SET sent_at = now(), sent_by = p_user_id
  WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id);
END;
$$;

-- 6) Grant permissions
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_proposal_as_sent(uuid, uuid) TO anon;

-- 7) Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
