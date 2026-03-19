-- Job documents and revisions: create tables if missing and ensure RLS allows office/job access
-- Run this if documents are not loading in a job (e.g. tables or policies missing).
--
-- job_id is uuid without FK when public.jobs does not exist yet (some projects create jobs outside migrations).
-- FK is added only when public.jobs exists.

CREATE TABLE IF NOT EXISTS public.job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  current_version integer NOT NULL DEFAULT 1,
  visible_to_crew boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $job_docs_fk$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'job_documents' AND c.conname = 'job_documents_job_id_fkey'
     )
  THEN
    ALTER TABLE public.job_documents
      ADD CONSTRAINT job_documents_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $job_docs_fk$;

CREATE INDEX IF NOT EXISTS idx_job_documents_job_id ON public.job_documents (job_id);

-- job_document_revisions: one row per version of a document
CREATE TABLE IF NOT EXISTS public.job_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.job_documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_url text NOT NULL,
  revision_description text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now(),
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_job_document_revisions_document_id ON public.job_document_revisions (document_id);

-- RLS: allow authenticated users to read/write (office and crew use same app)
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_document_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read job_documents" ON public.job_documents;
CREATE POLICY "Authenticated can read job_documents"
  ON public.job_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert job_documents" ON public.job_documents;
CREATE POLICY "Authenticated can insert job_documents"
  ON public.job_documents FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update job_documents" ON public.job_documents;
CREATE POLICY "Authenticated can update job_documents"
  ON public.job_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete job_documents" ON public.job_documents;
CREATE POLICY "Authenticated can delete job_documents"
  ON public.job_documents FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read job_document_revisions" ON public.job_document_revisions;
CREATE POLICY "Authenticated can read job_document_revisions"
  ON public.job_document_revisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert job_document_revisions" ON public.job_document_revisions;
CREATE POLICY "Authenticated can insert job_document_revisions"
  ON public.job_document_revisions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update job_document_revisions" ON public.job_document_revisions;
CREATE POLICY "Authenticated can update job_document_revisions"
  ON public.job_document_revisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete job_document_revisions" ON public.job_document_revisions;
CREATE POLICY "Authenticated can delete job_document_revisions"
  ON public.job_document_revisions FOR DELETE TO authenticated USING (true);

-- Grant table usage (needed for PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_document_revisions TO authenticated;

COMMENT ON TABLE public.job_documents IS 'Documents attached to a job (drawings, specs, etc.)';
COMMENT ON TABLE public.job_document_revisions IS 'File revisions for each job document';
