# Restore workbook / proposal data (e.g. Stewart Addition)

Use this if a proposal’s materials look empty after locking or restoring, but you may still have data elsewhere.

## 1. Find the job and quotes (Supabase SQL)

```sql
-- Jobs matching name (adjust spelling: Stewart / Stuart)
SELECT id, job_number, name, created_at
FROM jobs
WHERE name ILIKE '%stewart%' OR name ILIKE '%addition%'
ORDER BY created_at DESC;

-- Replace :job_id
SELECT id, proposal_number, project_name, signed_version, created_at
FROM quotes
WHERE job_id = 'YOUR_JOB_UUID'
ORDER BY created_at;
```

## 2. See where workbook data still lives

```sql
-- Replace :job_id
SELECT mw.id, mw.quote_id, mw.version_number, mw.status, mw.updated_at,
       (SELECT COUNT(*) FROM material_sheets ms WHERE ms.workbook_id = mw.id) AS sheet_count,
       (SELECT COUNT(*) FROM material_items mi
        JOIN material_sheets ms ON ms.id = mi.sheet_id
        WHERE ms.workbook_id = mw.id) AS item_count
FROM material_workbooks mw
WHERE mw.job_id = 'YOUR_JOB_UUID'
ORDER BY mw.quote_id NULLS LAST, mw.version_number DESC;
```

- If **one quote’s locked workbook** has `item_count = 0` but **another row** (same job, different `quote_id` or older version) has items, you can copy from that source in the app (open that proposal) or clone workbook rows in SQL (advanced).

## 3. Restore from `proposal_versions.workbook_snapshot`

If any version row has a non-empty snapshot:

```sql
SELECT pv.id, pv.quote_id, pv.version_number,
       (pv.workbook_snapshot->'sheets') IS NOT NULL
         AND jsonb_array_length(COALESCE(pv.workbook_snapshot->'sheets', '[]'::jsonb)) > 0 AS has_workbook,
       pv.created_at
FROM proposal_versions pv
JOIN quotes q ON q.id = pv.quote_id
WHERE q.job_id = 'YOUR_JOB_UUID'
ORDER BY pv.version_number DESC;
```

**In the app:** Office → Job financials / proposal → use **Restore from snapshot** (or equivalent) for the target quote, **only after confirming** the snapshot row has `has_workbook = true`. That path rebuilds sheets and line items from JSON.

**If all snapshots are empty:** there is nothing to restore from `proposal_versions`; you need a database backup or another environment that still has the rows.

## 4. Deploy fixes (prevents recurrence)

- Apply migration `20250342000000_create_proposal_version_workbook_snapshot.sql` (or run `scripts/create_proposal_version_rpc.sql`) so `create_proposal_version` stores a full `workbook_snapshot`.
- Deploy the latest app so **Set as contract** fills snapshots and **Create working copy from snapshot** copies descriptions, markups, and all item columns.

## 5. Optional: backfill snapshot for a quote (Supabase)

Only if live workbook still has data but `proposal_versions.workbook_snapshot` is null:

```sql
-- After migration defining build_proposal_workbook_snapshot:
SELECT public.build_proposal_workbook_snapshot('YOUR_QUOTE_UUID'::uuid);

-- Then UPDATE the relevant proposal_versions row (careful: test on a copy first).
```

Have a DBA or run in a branch project before updating production rows.
