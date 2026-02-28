-- Trim Saved Configs: create table (if missing) and set up RLS so delete works
-- Run in Supabase: Dashboard → SQL Editor → New query → paste and Run.

-- =============================================================================
-- STEP 1: Create the table (run this first if you got "relation does not exist")
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trim_saved_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  job_id uuid,
  job_name text,
  inches jsonb NOT NULL DEFAULT '[]',
  bends integer NOT NULL DEFAULT 0,
  drawing_segments jsonb,
  material_type_id uuid,
  material_type_name text,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- STEP 2: RLS and policies (so load/save/delete all work)
-- =============================================================================

ALTER TABLE public.trim_saved_configs ENABLE ROW LEVEL SECURITY;

-- SELECT (so the list loads)
DROP POLICY IF EXISTS "Allow read trim_saved_configs" ON public.trim_saved_configs;
CREATE POLICY "Allow read trim_saved_configs"
  ON public.trim_saved_configs FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Allow read trim_saved_configs anon"
  ON public.trim_saved_configs FOR SELECT
  TO anon USING (true);

-- INSERT (so save works)
DROP POLICY IF EXISTS "Allow insert trim_saved_configs" ON public.trim_saved_configs;
CREATE POLICY "Allow insert trim_saved_configs"
  ON public.trim_saved_configs FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "Allow insert trim_saved_configs anon"
  ON public.trim_saved_configs FOR INSERT
  TO anon WITH CHECK (true);

-- DELETE (so delete persists after refresh)
DROP POLICY IF EXISTS "Allow delete trim_saved_configs" ON public.trim_saved_configs;
DROP POLICY IF EXISTS "Allow delete trim_saved_configs anon" ON public.trim_saved_configs;
CREATE POLICY "Allow delete trim_saved_configs"
  ON public.trim_saved_configs FOR DELETE
  TO authenticated USING (true);
CREATE POLICY "Allow delete trim_saved_configs anon"
  ON public.trim_saved_configs FOR DELETE
  TO anon USING (true);

-- =============================================================================
-- STEP 3: Allow delete (choose ONE of the two options below)
-- =============================================================================

-- OPTION A: Disable RLS on this table (simplest — direct delete will work)
ALTER TABLE public.trim_saved_configs DISABLE ROW LEVEL SECURITY;

-- OPTION B: Use a delete function (if you prefer to keep RLS enabled)
-- Run the block below, then in Supabase go to: Project Settings → API → "Reload schema"
-- (or wait a few minutes) so the new function appears in the schema cache.
/*
CREATE OR REPLACE FUNCTION public.delete_trim_saved_config(config_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_id uuid;
BEGIN
  DELETE FROM public.trim_saved_configs WHERE id = config_id
  RETURNING id INTO deleted_id;
  RETURN deleted_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_trim_saved_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trim_saved_config(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_trim_saved_config(uuid) TO service_role;
*/
