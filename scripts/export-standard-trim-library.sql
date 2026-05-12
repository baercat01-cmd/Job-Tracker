-- Export trim library rows from public.trim_saved_configs for backup / another tool.
-- Run in Supabase → SQL Editor.
--
-- IMPORTANT: Two variants below.
--
-- (A) DEFAULT — works when column is_custom_trim does NOT exist yet.
--     Uses: job_id IS NULL  → trims not tied to a job (same heuristic the app used before
--     the custom-trim flag migration). Excludes job-specific saves.
--
-- (B) OPTIONAL — run ONLY after migration:
--     supabase/migrations/20250326000000_trim_saved_configs_is_custom.sql
--     Then use Query 1B / 2B so "Standard" matches the app (is_custom_trim = false).
--
-- drawing_segments JSON matches TrimDrawingPreview LineSegment shape:
--   id, start/end {x,y}, label; optional hasHem, hemAtStart, hemSide, hemDepthInches

-- =============================================================================
-- Query 1A — Standard library (NO is_custom_trim column required)
-- =============================================================================
SELECT jsonb_pretty(
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(t) ORDER BY lower(t.name))
      FROM (
        SELECT
          id,
          name,
          job_id,
          job_name,
          inches,
          bends,
          drawing_segments,
          material_type_id,
          material_type_name,
          created_at
        FROM public.trim_saved_configs
        WHERE job_id IS NULL
      ) AS t
    ),
    '[]'::jsonb
  )
) AS standard_trim_saved_configs_json;


-- =============================================================================
-- Query 2A — NDJSON (one object per line), same filter as 1A
-- =============================================================================
SELECT to_jsonb(t)::text AS line
FROM (
  SELECT
    id,
    name,
    job_id,
    job_name,
    inches,
    bends,
    drawing_segments,
    material_type_id,
    material_type_name,
    created_at
  FROM public.trim_saved_configs
  WHERE job_id IS NULL
  ORDER BY lower(name)
) AS t;


-- =============================================================================
-- Query 1B — OPTIONAL: use AFTER is_custom_trim exists (matches in-app "Standard" list)
-- =============================================================================
-- SELECT jsonb_pretty(
--   COALESCE(
--     (
--       SELECT jsonb_agg(to_jsonb(t) ORDER BY lower(t.name))
--       FROM (
--         SELECT
--           id, name, job_id, job_name, inches, bends, drawing_segments,
--           material_type_id, material_type_name, created_at, is_custom_trim
--         FROM public.trim_saved_configs
--         WHERE COALESCE(is_custom_trim, false) = false
--       ) AS t
--     ),
--     '[]'::jsonb
--   )
-- ) AS standard_trim_saved_configs_json;


-- =============================================================================
-- Query 2B — OPTIONAL: NDJSON with is_custom_trim (after migration)
-- =============================================================================
-- SELECT to_jsonb(t)::text AS line
-- FROM (
--   SELECT
--     id, name, job_id, job_name, inches, bends, drawing_segments,
--     material_type_id, material_type_name, created_at, is_custom_trim
--   FROM public.trim_saved_configs
--   WHERE COALESCE(is_custom_trim, false) = false
--   ORDER BY lower(name)
-- ) AS t;


-- =============================================================================
-- Query 3: Trim coil types (pricing). If you get "column does not exist", run only
-- the inner columns your table has (width_inches, cost_per_lf, etc. are required).
-- =============================================================================
SELECT jsonb_pretty(
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(t) ORDER BY lower(t.name))
      FROM (
        SELECT
          id,
          name,
          width_inches,
          cost_per_lf,
          price_per_bend,
          markup_percent
        FROM public.trim_types
      ) AS t
    ),
    '[]'::jsonb
  )
) AS trim_types_json;
