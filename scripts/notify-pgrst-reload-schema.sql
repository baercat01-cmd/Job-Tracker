-- After running migrations or ALTER TABLE on Supabase/PostgREST, reload the API schema cache
-- so new columns (e.g. job_documents.visible_to_customer_portal) are visible to REST clients.
--
-- Run in Supabase SQL Editor (or any session connected to the project's database):

NOTIFY pgrst, 'reload schema';
