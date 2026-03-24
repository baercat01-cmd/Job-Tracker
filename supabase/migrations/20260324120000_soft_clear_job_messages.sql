-- Soft-clear support for portal chat history (hide without deleting rows).
ALTER TABLE public.job_messages
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_messages_job_hidden_created
  ON public.job_messages (job_id, hidden_at, created_at DESC);

-- Customer portal read RPC: exclude hidden rows.
CREATE OR REPLACE FUNCTION public.get_job_messages_for_customer_portal(
  p_access_token text,
  p_job_id uuid
)
RETURNS SETOF public.job_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access record;
BEGIN
  IF p_access_token IS NULL OR trim(p_access_token) = '' THEN
    RETURN;
  END IF;
  IF p_job_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, job_id
  INTO v_access
  FROM public.customer_portal_access
  WHERE access_token = trim(p_access_token)
    AND is_active = true
  LIMIT 1;

  IF v_access.id IS NULL THEN
    RETURN;
  END IF;
  IF v_access.job_id IS NOT NULL AND v_access.job_id <> p_job_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jm.*
  FROM public.job_messages jm
  WHERE jm.job_id = p_job_id
    AND jm.hidden_at IS NULL
  ORDER BY jm.created_at DESC
  LIMIT 200;
END;
$$;
