-- Opaque share tokens for subcontractor portal (like customer_portal_access.access_token).
-- Public resolves token -> portal_user_id via SECURITY DEFINER RPC; table is not readable by anon.

CREATE TABLE IF NOT EXISTS public.subcontractor_portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL,
  subcontractor_id uuid NOT NULL,
  access_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontractor_portal_links_portal_user_unique UNIQUE (portal_user_id),
  CONSTRAINT subcontractor_portal_links_token_unique UNIQUE (access_token)
);

DO $lnk_fk$
BEGIN
  IF to_regclass('public.portal_users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'subcontractor_portal_links' AND c.conname = 'subcontractor_portal_links_portal_user_id_fkey'
     )
  THEN
    ALTER TABLE public.subcontractor_portal_links
      ADD CONSTRAINT subcontractor_portal_links_portal_user_id_fkey
      FOREIGN KEY (portal_user_id) REFERENCES public.portal_users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $lnk_fk$;

DO $lnk_fk2$
BEGIN
  IF to_regclass('public.subcontractors') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'subcontractor_portal_links' AND c.conname = 'subcontractor_portal_links_subcontractor_id_fkey'
     )
  THEN
    ALTER TABLE public.subcontractor_portal_links
      ADD CONSTRAINT subcontractor_portal_links_subcontractor_id_fkey
      FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $lnk_fk2$;

CREATE INDEX IF NOT EXISTS idx_subcontractor_portal_links_token ON public.subcontractor_portal_links (access_token);
CREATE INDEX IF NOT EXISTS idx_subcontractor_portal_links_sub_id ON public.subcontractor_portal_links (subcontractor_id);

ALTER TABLE public.subcontractor_portal_links DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.subcontractor_portal_links FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subcontractor_portal_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subcontractor_portal_links TO service_role;

COMMENT ON TABLE public.subcontractor_portal_links IS 'One opaque portal link per subcontractor portal user; anon resolves via get_subcontractor_portal_link_by_token only.';

-- Anon-safe: return portal_user_id + display fields when token matches an active link and subcontractor is active.
CREATE OR REPLACE FUNCTION public.get_subcontractor_portal_link_by_token(p_access_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  SELECT jsonb_build_object(
    'portal_user_id', l.portal_user_id,
    'subcontractor_id', l.subcontractor_id,
    'full_name', s.name,
    'company_name', s.company_name,
    'is_active', l.is_active
  )
  INTO v_row
  FROM public.subcontractor_portal_links l
  INNER JOIN public.subcontractors s ON s.id = l.subcontractor_id
  WHERE l.access_token = trim(p_access_token)
    AND l.is_active = true
    AND s.active IS NOT FALSE
  LIMIT 1;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_subcontractor_portal_link_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subcontractor_portal_link_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_subcontractor_portal_link_by_token(text) TO authenticated;

COMMENT ON FUNCTION public.get_subcontractor_portal_link_by_token(text) IS 'Resolve subcontractor portal share token to portal_user_id for public portal load.';
