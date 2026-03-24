-- Fix customer portal message RPC for schemas where job_emails.to_emails/cc_emails are jsonb.
-- Previous versions inserted text[] (ARRAY[...]::text[]), which fails with:
-- "column to_emails is of type jsonb but expression is of type text[]"

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
    is_read,
    entity_category
  ) VALUES (
    p_job_id,
    v_message_id,
    coalesce(trim(p_subject), 'Message from ' || coalesce(v_access.customer_name, 'Customer')),
    coalesce(trim(v_access.customer_email), ''),
    coalesce(trim(v_access.customer_name), 'Customer'),
    '[]'::jsonb,
    '[]'::jsonb,
    trim(p_body_text),
    now(),
    'inbound',
    false,
    'customer'
  )
  RETURNING to_jsonb(job_emails.*) INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) IS
  'Inserts a customer portal message into job_emails using jsonb recipient fields (to_emails/cc_emails).';

GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO authenticated;

