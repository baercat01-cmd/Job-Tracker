-- Folders for organizing job documents. Run in Supabase SQL Editor.
-- After running, documents can be assigned to a folder (folder_id).

CREATE TABLE IF NOT EXISTS public.job_document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.job_document_folders(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_document_folders_job_id ON public.job_document_folders (job_id);
CREATE INDEX IF NOT EXISTS idx_job_document_folders_parent ON public.job_document_folders (parent_id);

ALTER TABLE public.job_document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage job_document_folders"
  ON public.job_document_folders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add folder_id to job_documents if the column does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_documents' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE public.job_documents ADD COLUMN folder_id uuid REFERENCES public.job_document_folders(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_job_documents_folder_id ON public.job_documents (folder_id);
  END IF;
END $$;

COMMENT ON TABLE public.job_document_folders IS 'Folders to organize job documents';
