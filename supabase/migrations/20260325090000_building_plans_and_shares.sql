-- Building Plans + share-link access (customer edit / subcontractor view-only).
-- Uses SECURITY DEFINER RPCs (granted to anon) to support public share links while keeping tables under RLS.

-- Ensure crypto helpers are available for token generation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Core plans table
CREATE TABLE IF NOT EXISTS public.building_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NULL,
  quote_id uuid NULL,
  name text NOT NULL DEFAULT 'New plan',
  model_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Version snapshots (audit + rollback support)
CREATE TABLE IF NOT EXISTS public.building_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.building_plans(id) ON DELETE CASCADE,
  model_json jsonb NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Share links
CREATE TABLE IF NOT EXISTS public.building_plan_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.building_plans(id) ON DELETE CASCADE,
  token text NOT NULL,
  role text NOT NULL DEFAULT 'viewer', -- e.g. 'customer' | 'subcontractor' | 'viewer'
  can_edit boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  last_accessed_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS building_plan_shares_token_uq ON public.building_plan_shares(token);
CREATE INDEX IF NOT EXISTS building_plan_shares_plan_id_idx ON public.building_plan_shares(plan_id);

-- Updated-at triggers are omitted (project does not appear to use a global trigger pattern);
-- RPCs will set updated_at explicitly when writing.

-- RLS
ALTER TABLE public.building_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_plan_shares ENABLE ROW LEVEL SECURITY;

-- Basic owner-based policies (office users operate authenticated; share access is via RPCs).
DROP POLICY IF EXISTS "building_plans_owner_read" ON public.building_plans;
CREATE POLICY "building_plans_owner_read"
ON public.building_plans
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

DROP POLICY IF EXISTS "building_plans_owner_write" ON public.building_plans;
CREATE POLICY "building_plans_owner_write"
ON public.building_plans
FOR ALL
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "building_plan_versions_owner_read" ON public.building_plan_versions;
CREATE POLICY "building_plan_versions_owner_read"
ON public.building_plan_versions
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.building_plans p
  WHERE p.id = building_plan_versions.plan_id AND p.created_by = auth.uid()
));

DROP POLICY IF EXISTS "building_plan_shares_owner_read" ON public.building_plan_shares;
CREATE POLICY "building_plan_shares_owner_read"
ON public.building_plan_shares
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.building_plans p
  WHERE p.id = building_plan_shares.plan_id AND p.created_by = auth.uid()
));

DROP POLICY IF EXISTS "building_plan_shares_owner_write" ON public.building_plan_shares;
CREATE POLICY "building_plan_shares_owner_write"
ON public.building_plan_shares
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.building_plans p
  WHERE p.id = building_plan_shares.plan_id AND p.created_by = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.building_plans p
  WHERE p.id = building_plan_shares.plan_id AND p.created_by = auth.uid()
));

-- RPC: Create a plan (owner = auth.uid) with optional seed model_json
CREATE OR REPLACE FUNCTION public.create_building_plan(
  p_job_id uuid DEFAULT null,
  p_quote_id uuid DEFAULT null,
  p_name text DEFAULT 'New plan',
  p_model_json jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.building_plans (job_id, quote_id, name, model_json, created_by)
  VALUES (p_job_id, p_quote_id, coalesce(p_name, 'New plan'), coalesce(p_model_json, '{}'::jsonb), v_uid)
  RETURNING to_jsonb(building_plans.*) INTO v_row;

  INSERT INTO public.building_plan_versions (plan_id, model_json, created_by)
  VALUES ((v_row->>'id')::uuid, (v_row->'model_json'), v_uid);

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_building_plan(uuid, uuid, text, jsonb) TO authenticated;

-- RPC: Create share token for a plan (authenticated owner only)
CREATE OR REPLACE FUNCTION public.create_building_plan_share(
  p_plan_id uuid,
  p_role text DEFAULT 'viewer',
  p_can_edit boolean DEFAULT false,
  p_expires_at timestamptz DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_plan public.building_plans;
  v_token text;
  v_row jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_plan FROM public.building_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;
  IF v_plan.created_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.building_plan_shares (
    plan_id, token, role, can_edit, is_active, expires_at, created_by, updated_at
  ) VALUES (
    p_plan_id, v_token, coalesce(p_role, 'viewer'), coalesce(p_can_edit, false), true, p_expires_at, v_uid, now()
  )
  RETURNING to_jsonb(building_plan_shares.*) INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_building_plan_share(uuid, text, boolean, timestamptz) TO authenticated;

-- Helper: validate token and return share row + plan id
CREATE OR REPLACE FUNCTION public.get_building_plan_share_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(r) FROM (
    SELECT s.id, s.plan_id, s.role, s.can_edit, s.is_active, s.expires_at, s.last_accessed_at,
           s.created_at, s.updated_at
    FROM public.building_plan_shares s
    WHERE s.token = p_token
      AND s.is_active = true
      AND (s.expires_at IS NULL OR s.expires_at > now())
    LIMIT 1
  ) r;
$$;

GRANT EXECUTE ON FUNCTION public.get_building_plan_share_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_building_plan_share_by_token(text) TO authenticated;

-- RPC: Fetch plan by token (anon-friendly). Returns { plan, share } in jsonb.
CREATE OR REPLACE FUNCTION public.get_building_plan_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share record;
  v_plan public.building_plans;
BEGIN
  SELECT s.* INTO v_share
  FROM public.building_plan_shares s
  WHERE s.token = p_token
    AND s.is_active = true
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1;

  IF v_share.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.building_plan_shares
  SET last_accessed_at = now(), updated_at = now()
  WHERE id = v_share.id;

  SELECT * INTO v_plan FROM public.building_plans WHERE id = v_share.plan_id;
  IF v_plan.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'share', jsonb_build_object(
      'id', v_share.id,
      'plan_id', v_share.plan_id,
      'role', v_share.role,
      'can_edit', v_share.can_edit,
      'expires_at', v_share.expires_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_building_plan_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_building_plan_by_token(text) TO authenticated;

-- RPC: Update plan by token (anon-friendly if token allows edit). Stores version snapshots.
CREATE OR REPLACE FUNCTION public.update_building_plan_by_token(
  p_token text,
  p_model_json jsonb,
  p_name text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share record;
  v_plan public.building_plans;
  v_row jsonb;
BEGIN
  SELECT s.* INTO v_share
  FROM public.building_plan_shares s
  WHERE s.token = p_token
    AND s.is_active = true
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1;

  IF v_share.id IS NULL THEN
    RAISE EXCEPTION 'Invalid share token';
  END IF;
  IF v_share.can_edit IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Share token is view-only';
  END IF;

  SELECT * INTO v_plan FROM public.building_plans WHERE id = v_share.plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  UPDATE public.building_plans
  SET
    model_json = coalesce(p_model_json, v_plan.model_json),
    name = coalesce(p_name, v_plan.name),
    updated_at = now()
  WHERE id = v_plan.id
  RETURNING to_jsonb(building_plans.*) INTO v_row;

  INSERT INTO public.building_plan_versions (plan_id, model_json, created_by)
  VALUES (v_plan.id, (v_row->'model_json'), auth.uid());

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_building_plan_by_token(text, jsonb, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_building_plan_by_token(text, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.get_building_plan_by_token(text) IS 'Fetch building plan + share info via public share token.';
COMMENT ON FUNCTION public.update_building_plan_by_token(text, jsonb, text) IS 'Update building plan via share token if can_edit=true; writes version snapshot.';

NOTIFY pgrst, 'reload schema';

