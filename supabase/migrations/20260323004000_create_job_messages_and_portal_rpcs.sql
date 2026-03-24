-- Direct portal communications (email-independent).
-- Creates job_messages and RPCs for customer portal send/read.

CREATE TABLE IF NOT EXISTS public.job_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'team')),
  sender_name text,
  sender_contact text,
  message_text text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_messages_job_created
  ON public.job_messages (job_id, created_at DESC);

-- Customer portal: read messages for validated link/job.
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
  ORDER BY jm.created_at DESC
  LIMIT 200;
END;
$$;

-- Customer portal: create direct message for project team.
CREATE OR REPLACE FUNCTION public.create_job_message_from_customer_portal(
  p_access_token text,
  p_job_id uuid,
  p_message_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access record;
  v_row jsonb;
BEGIN
  IF p_access_token IS NULL OR trim(p_access_token) = '' THEN
    RAISE EXCEPTION 'Access token required';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job id required';
  END IF;
  IF p_message_text IS NULL OR trim(p_message_text) = '' THEN
    RAISE EXCEPTION 'Message body required';
  END IF;

  SELECT id, customer_name, customer_email, job_id
  INTO v_access
  FROM public.customer_portal_access
  WHERE access_token = trim(p_access_token)
    AND is_active = true
  LIMIT 1;

  IF v_access.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive portal access token';
  END IF;
  IF v_access.job_id IS NOT NULL AND v_access.job_id <> p_job_id THEN
    RAISE EXCEPTION 'Portal access is not for this job';
  END IF;

  INSERT INTO public.job_messages (
    job_id,
    sender_role,
    sender_name,
    sender_contact,
    message_text,
    is_read
  ) VALUES (
    p_job_id,
    'customer',
    COALESCE(NULLIF(trim(v_access.customer_name), ''), 'Customer'),
    COALESCE(NULLIF(trim(v_access.customer_email), ''), NULL),
    trim(p_message_text),
    false
  )
  RETURNING to_jsonb(job_messages.*) INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_job_messages_for_customer_portal(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_messages_for_customer_portal(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_job_message_from_customer_portal(text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_job_message_from_customer_portal(text, uuid, text) TO authenticated;

