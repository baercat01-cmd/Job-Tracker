ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_signed boolean DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_at timestamptz;

ALTER TABLE material_workbooks ADD COLUMN IF NOT EXISTS status text DEFAULT 'working';

CREATE INDEX IF NOT EXISTS idx_material_workbooks_status ON material_workbooks(status);
