-- Documents section: folders + viewer links. Run once in Supabase SQL Editor.
-- This enables document folders and shared viewer links (e.g. SketchUp, SmartBuild) for all users.

-- 1) Folders for organizing job documents
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
DROP POLICY IF EXISTS "Authenticated can manage job_document_folders" ON public.job_document_folders;
CREATE POLICY "Authenticated can manage job_document_folders"
  ON public.job_document_folders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add folder_id to job_documents only if that table exists (e.g. from your main schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_documents')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_documents' AND column_name = 'folder_id') THEN
    ALTER TABLE public.job_documents ADD COLUMN folder_id uuid REFERENCES public.job_document_folders(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_job_documents_folder_id ON public.job_documents (folder_id);
  END IF;
END $$;

COMMENT ON TABLE public.job_document_folders IS 'Folders to organize job documents';

-- 2) Viewer links (shared for all users, like documents)
CREATE TABLE IF NOT EXISTS public.job_viewer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  label text NOT NULL,
  url text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_viewer_links_job_id ON public.job_viewer_links (job_id);
ALTER TABLE public.job_viewer_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read job_viewer_links for jobs they can access" ON public.job_viewer_links;
CREATE POLICY "Users can read job_viewer_links for jobs they can access"
  ON public.job_viewer_links FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can insert job_viewer_links" ON public.job_viewer_links;
CREATE POLICY "Users can insert job_viewer_links"
  ON public.job_viewer_links FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update job_viewer_links" ON public.job_viewer_links;
CREATE POLICY "Users can update job_viewer_links"
  ON public.job_viewer_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users can delete job_viewer_links" ON public.job_viewer_links;
CREATE POLICY "Users can delete job_viewer_links"
  ON public.job_viewer_links FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.job_viewer_links IS 'Per-job viewer links (e.g. SketchUp, SmartBuild) — shared for all users like documents';
