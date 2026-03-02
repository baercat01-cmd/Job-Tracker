-- Job Viewer Links: per-job links (e.g. SketchUp 3D, blueprints) shown in the Documents section
-- Run in Supabase SQL Editor.
-- Note: job_id is not a foreign key so this works even if your jobs table has a different name or schema.

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

-- RLS: allow authenticated users to read/insert/update/delete (same scope as job access in app)
CREATE POLICY "Users can read job_viewer_links for jobs they can access"
  ON public.job_viewer_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert job_viewer_links"
  ON public.job_viewer_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update job_viewer_links"
  ON public.job_viewer_links FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete job_viewer_links"
  ON public.job_viewer_links FOR DELETE
  TO authenticated
  USING (true);

COMMENT ON TABLE public.job_viewer_links IS 'Per-job links opened in the Documents panel (e.g. SketchUp 3D viewer, blueprint viewers)';
