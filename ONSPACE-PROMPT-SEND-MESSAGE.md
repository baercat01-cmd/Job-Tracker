# Prompt for Onspace.ai: Make "Send Message to Project Team" work

Copy and paste the following into Onspace.ai (or your deployment/support chat) so customer portal messages reach the office.

---

**Prompt:**

The **Send Message to Project Team** button in the customer portal does not send messages to the office. Customers can type a message and click Send, but the office never sees it in Email Communications.

Please run the following in the **Supabase project** that backs this app (Supabase Dashboard → SQL Editor):

**Step 1 – Run this SQL**

It does two things:
1. Adds the `entity_category` column to `job_emails` if it doesn’t exist (so the office can filter by Customer).
2. Creates or replaces the function `create_job_email_from_customer_portal` so that when a customer sends a message from the portal, it is inserted into `job_emails` with `entity_category = 'customer'` and the office sees it under that job’s **Email Communications** tab.

```sql
-- Ensure customer portal messages are stored with entity_category = 'customer'
-- so the office sees them in Email Communications (and in the Customer filter).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_emails' AND column_name = 'entity_category'
  ) THEN
    ALTER TABLE public.job_emails ADD COLUMN entity_category text;
  END IF;
END $$;

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
    ARRAY['office@company.com']::text[],
    ARRAY[]::text[],
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
  'Inserts a message from the customer portal into job_emails. Verifies portal access token. Sets entity_category=customer so office sees it in Communications.';

GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_job_email_from_customer_portal(text, uuid, text, text) TO authenticated;
```

**Step 2 – Reload the API schema**

After running the SQL:

- In Supabase SQL Editor run: `NOTIFY pgrst, 'reload schema';`  
  **or**
- In Supabase: Project Settings → General → **Restart project**, then wait until it’s fully back up.

**Step 3 – Where the office sees messages**

The office sees customer portal messages here:

- Open a **Job** → **Email Communications** (or Communications tab).
- Use the **Refresh** button to load new messages.
- Messages from the portal appear under the **All** and **Customers** filters.

After this, when a customer uses **Send Message to Project Team** in the portal, the message is stored in `job_emails` with `entity_category = 'customer'` and the office can see it in that job’s Email Communications.

---

If you see **"Sending messages is not set up yet"** in the portal, the function did not exist before; the SQL above creates it. If you still get errors, ensure the `job_emails` and `customer_portal_access` tables exist and that the portal link the customer is using has a valid, active token in `customer_portal_access`.
