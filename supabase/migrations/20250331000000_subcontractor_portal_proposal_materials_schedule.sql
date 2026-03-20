-- Subcontractor portal: proposal + materials visibility flags, schedule edit RPC.
-- Apply where public.portal_job_access and public.calendar_events exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'portal_job_access'
  ) THEN
    ALTER TABLE public.portal_job_access ADD COLUMN IF NOT EXISTS can_view_proposal boolean NOT NULL DEFAULT false;
    ALTER TABLE public.portal_job_access ADD COLUMN IF NOT EXISTS can_view_materials boolean NOT NULL DEFAULT false;
    ALTER TABLE public.portal_job_access ADD COLUMN IF NOT EXISTS can_edit_schedule boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.subcontractor_assert_job_schedule_access(p_portal_user_id uuid, p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_users pu
    INNER JOIN public.portal_job_access pja ON pja.portal_user_id = pu.id
    WHERE pu.id = p_portal_user_id
      AND COALESCE(pu.is_active, true) = true
      AND pu.user_type = 'subcontractor'
      AND pja.job_id = p_job_id
      AND COALESCE(pja.can_edit_schedule, false) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.subcontractor_update_calendar_event(
  p_portal_user_id uuid,
  p_job_id uuid,
  p_event_id uuid,
  p_title text,
  p_description text,
  p_event_date date,
  p_event_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.subcontractor_assert_job_schedule_access(p_portal_user_id, p_job_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.calendar_events
    WHERE id = p_event_id AND job_id = p_job_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  UPDATE public.calendar_events
  SET
    title = COALESCE(NULLIF(trim(p_title), ''), title),
    description = p_description,
    event_date = COALESCE(p_event_date, event_date),
    event_type = COALESCE(NULLIF(trim(p_event_type), ''), event_type),
    updated_at = now()
  WHERE id = p_event_id AND job_id = p_job_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.subcontractor_update_calendar_event(uuid, uuid, uuid, text, text, date, text) TO anon;
GRANT EXECUTE ON FUNCTION public.subcontractor_update_calendar_event(uuid, uuid, uuid, text, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.subcontractor_update_calendar_event IS 'Subcontractor portal: update calendar event when portal_job_access.can_edit_schedule.';
