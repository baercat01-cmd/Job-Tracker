-- Create Customer Portal Access table (shareable links for customers to view job/proposal)
-- Run this in Supabase SQL Editor first. Then run fix-customer-portal-access-rls.sql if you get permission errors.

CREATE TABLE IF NOT EXISTS public.customer_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  customer_identifier text NOT NULL,
  access_token text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  show_proposal boolean NOT NULL DEFAULT true,
  show_payments boolean NOT NULL DEFAULT true,
  show_schedule boolean NOT NULL DEFAULT true,
  show_documents boolean NOT NULL DEFAULT true,
  show_photos boolean NOT NULL DEFAULT true,
  show_financial_summary boolean NOT NULL DEFAULT true,
  custom_message text
);

CREATE INDEX IF NOT EXISTS idx_customer_portal_access_job_id ON public.customer_portal_access (job_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_access_token ON public.customer_portal_access (access_token);
CREATE INDEX IF NOT EXISTS idx_customer_portal_access_customer_identifier ON public.customer_portal_access (customer_identifier);

-- Unique: one link per customer+job (optional; remove if you want multiple links per customer per job)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_portal_access_customer_job ON public.customer_portal_access (customer_identifier, job_id);

COMMENT ON TABLE public.customer_portal_access IS 'Shareable portal links for customers; visibility toggles control what they see (proposal, price, documents, etc.).';
