-- IMPORTANT: Run this in the SAME Supabase project your app uses (check .env VITE_SUPABASE_URL).
-- 1. Open that project's SQL Editor
-- 2. Paste and run ALL lines below
-- 3. Refresh your app and try deleting again

-- Stop RLS from blocking deletes
ALTER TABLE public.trim_saved_configs DISABLE ROW LEVEL SECURITY;

-- Ensure anon and authenticated roles can delete (required even with RLS off)
GRANT ALL ON public.trim_saved_configs TO anon;
GRANT ALL ON public.trim_saved_configs TO authenticated;
GRANT ALL ON public.trim_saved_configs TO service_role;
