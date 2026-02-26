-- Add rotation_degrees to photos so job photos can be rotated and stay in that position.
-- Run this entire block in Supabase → SQL Editor → New query, then Run.

-- 1. Add the column (required for "Could not find the 'rotation_degrees' column" error)
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS rotation_degrees integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN photos.rotation_degrees IS 'Display rotation in degrees: 0, 90, 180, or 270.';

-- 2. Tell PostgREST to reload the schema cache so the app sees the new column
NOTIFY pgrst, 'reload schema';

-- 3. If rotation then fails with a row-level security / policy error, run this in a separate query:
--    DROP POLICY IF EXISTS "photos_allow_authenticated_update" ON photos;
--    CREATE POLICY "photos_allow_authenticated_update"
--      ON photos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
