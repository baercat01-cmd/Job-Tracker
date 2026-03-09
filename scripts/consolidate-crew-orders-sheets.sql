-- Consolidate duplicate "Crew Orders" / "Field Requests" sheets per job.
-- For each job that has more than one such sheet, move all items into the
-- oldest sheet, then delete the empty duplicates.

DO $$
DECLARE
  r RECORD;
  canonical_id uuid;
BEGIN
  -- Find jobs that have multiple crew-orders sheets in working workbooks
  FOR r IN
    SELECT ms.workbook_id, ms.id AS sheet_id, ms.sheet_name, ms.created_at,
           mw.job_id
    FROM   material_sheets ms
    JOIN   material_workbooks mw ON mw.id = ms.workbook_id
    WHERE  ms.sheet_name IN ('Crew Orders', 'Field Requests')
      AND  mw.status = 'working'
    ORDER  BY mw.job_id, ms.created_at
  LOOP
    -- Determine the canonical (oldest) sheet for this job
    SELECT ms.id INTO canonical_id
    FROM   material_sheets ms
    JOIN   material_workbooks mw ON mw.id = ms.workbook_id
    WHERE  ms.sheet_name IN ('Crew Orders', 'Field Requests')
      AND  mw.status = 'working'
      AND  mw.job_id = r.job_id
    ORDER  BY ms.created_at
    LIMIT  1;

    -- If this sheet is NOT the canonical one, move its items and delete it
    IF r.sheet_id <> canonical_id THEN
      UPDATE material_items SET sheet_id = canonical_id WHERE sheet_id = r.sheet_id;
      DELETE FROM material_sheets WHERE id = r.sheet_id;
      RAISE NOTICE 'Merged sheet % into canonical sheet % for job %', r.sheet_id, canonical_id, r.job_id;
    END IF;
  END LOOP;
END $$;

-- Rename any remaining "Field Requests" sheets to "Crew Orders"
UPDATE material_sheets
SET    sheet_name = 'Crew Orders'
WHERE  sheet_name = 'Field Requests';
