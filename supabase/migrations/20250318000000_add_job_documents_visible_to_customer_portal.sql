-- Allow controlling which job documents are visible in the customer portal.
ALTER TABLE public.job_documents
  ADD COLUMN IF NOT EXISTS visible_to_customer_portal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.job_documents.visible_to_customer_portal IS 'When true, this document is visible in the customer portal for this job.';
