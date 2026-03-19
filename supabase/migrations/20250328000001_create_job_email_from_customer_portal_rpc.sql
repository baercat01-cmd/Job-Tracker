-- RPC so customer portal can send messages to the project team when RLS blocks direct INSERT on job_emails.
-- Verifies the portal access token and inserts the email with SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.create_job_email_from_customer_portal(
  p_access_token text,
  p_job_id uuid,
  p_subject text,
  p_body_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access record;
  v_message_id text;
  v_row jsonb;
BEGIN
  IF p_access_token IS NULL OR trim(p_access_token) = '' THEN
    RAISE EXCEPTION 'Access token required';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job id required';
  END IF;
  IF p_body_text IS NULL OR trim(p_body_text) = '' THEN
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
  IF v_access.job_id IS NOT NULL AND v_access.job_id != p_job_id THEN
    RAISE EXCEPTION 'Portal access is not for this job';
  END IF;

  v_message_id := 'customer-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 7);

  INSERT INTO public.job_emails (
    job_id,
    message_id,
    subject,
    from_email,
    from_name,
    to_emails,
    cc_emails,
    body_text,
    email_date,
    direction,
    is_read
  ) VALUES (
    p_job_id,
    v_message_id,
    coalesce(trim(p_subject), 'Message from ' || coalesce(v_access.customer_name, 'Customer')),
    coalesce(trim(v_access.customer_email), ''),
    coalesce(trim(v_access.customer_name), 'Customer'),
    ARRAY['office@company.com']::text[],
    ARRAY[]::text[],
    trim(p_body_text),
    now(),
    'inbound',
    false
  )
  RETURNING to_jsonb(job_emails.*) INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) IS
  'Inserts a message from the customer portal into job_emails. Verifies portal access token. Use when RLS blocks direct insert.';

GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO authenticated;
