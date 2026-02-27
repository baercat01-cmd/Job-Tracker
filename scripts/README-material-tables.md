# Material workbook tables (Supabase)

The Martin Builder app uses these tables for the materials/workbook flow (crew “Ready” list, “At Job” check-off, office view):

- `material_workbooks`
- `material_sheets`
- `material_items`
- `material_sheet_labor`
- `material_category_markups`
- `material_bundles`
- `material_bundle_items`
- `material_item_photos`

## If you see "relation material_items does not exist"

Your project only has `materials` and `project_materials`, so the workbook tables were never created.

**Fix:**

1. In **Supabase** → **SQL Editor** → **New query**.
2. Paste and run the contents of **`create-material-workbook-tables.sql`**.
3. That creates all of the above tables and already includes the `at_job` status on `material_items`. You do **not** need to run `fix-material-items-status-constraint.sql` after.

## If you see "violates check constraint material_items_status_check"

The table `material_items` exists but its check constraint does not allow the value `at_job`.

**Fix:**

1. In **Supabase** → **SQL Editor** → **New query**.
2. Paste and run the contents of **`fix-material-items-status-constraint.sql`**.

## Summary

| Situation | Script to run |
|-----------|----------------|
| No `material_items` table | `create-material-workbook-tables.sql` |
| `material_items` exists, status 'at_job' not allowed | `fix-material-items-status-constraint.sql` |

Always run scripts in the **same** Supabase project your app uses (check `VITE_SUPABASE_URL` in `.env`).
