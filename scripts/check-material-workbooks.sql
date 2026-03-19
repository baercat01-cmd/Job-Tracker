-- Run this in Supabase Dashboard → SQL Editor to see if material workbooks exist.
-- This helps determine whether workbooks were deleted or are hidden (e.g. by RLS).

-- 1) Total count of material_workbooks
SELECT 'Total material_workbooks' AS check_name, COUNT(*) AS count FROM material_workbooks;

-- 2) Count of workbooks per job (so you can see which jobs have workbooks)
SELECT
  j.id AS job_id,
  j.name AS job_name,
  COUNT(mw.id) AS workbook_count
FROM jobs j
LEFT JOIN material_workbooks mw ON mw.job_id = j.id
GROUP BY j.id, j.name
ORDER BY workbook_count DESC, j.name
LIMIT 50;

-- 3) Sample of recent workbooks (id, job_id, quote_id, status, updated_at)
SELECT id, job_id, quote_id, status, version_number, updated_at
FROM material_workbooks
ORDER BY updated_at DESC
LIMIT 20;
