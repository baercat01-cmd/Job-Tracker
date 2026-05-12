-- Diagnose why Pavilion labor and "Cedar Post Changes" do not both appear on proposal #26030-4 at the same time.
-- Run each numbered block in the Supabase SQL Editor on the project this app actually points at
-- (the one the production app's VITE_SUPABASE_URL resolves to). Paste back the result of each block.
-- If a block errors with "relation does not exist", you are on the wrong project — see Block 0 first.

-- =========================================================================
-- 0) Are you on the right database? Lists every public table that exists here.
--    The live Martin Builder DB MUST have material_workbooks, material_sheets,
--    quotes, custom_financial_rows, subcontractor_estimates. If those are
--    missing, this is the wrong project — switch the SQL editor to the project
--    whose URL matches your app's VITE_SUPABASE_URL and run again.
-- =========================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'jobs', 'projects', 'quotes', 'material_workbooks', 'material_sheets',
    'material_items', 'material_sheet_labor', 'material_category_markups',
    'custom_financial_rows', 'custom_financial_row_items',
    'subcontractor_estimates', 'subcontractor_estimate_line_items',
    'quote_removed_sections', 'proposal_versions'
  )
ORDER BY table_name;


-- =========================================================================
-- 1) Find the job that owns proposal "26030-4" by following the quote, no
--    matter what the parent table is named on this DB. We only need the
--    quote_id; the rest of the diagnostic walks from there.
-- =========================================================================
SELECT
  q.id              AS quote_id,
  q.job_id,
  q.quote_number,
  q.proposal_number,
  q.is_change_order_proposal,
  q.is_customer_estimate,
  q.locked_for_editing,
  q.signed_version,
  q.customer_signed_at,
  q.sent_at,
  q.created_at
FROM public.quotes q
WHERE q.proposal_number = '26030-4'
   OR q.quote_number    = '26030-4'
ORDER BY q.created_at DESC
LIMIT 5;


-- =========================================================================
-- 2) ALL quotes (proposal versions) for the same job as proposal 26030-4.
--    Tells us how many sibling versions exist.
-- =========================================================================
SELECT
  q.id              AS quote_id,
  q.proposal_number,
  q.quote_number,
  q.is_change_order_proposal,
  q.locked_for_editing,
  q.signed_version,
  q.customer_signed_at,
  q.sent_at,
  q.created_at
FROM public.quotes q
WHERE q.job_id IN (
  SELECT job_id FROM public.quotes
  WHERE proposal_number = '26030-4' OR quote_number = '26030-4'
)
ORDER BY q.created_at;


-- =========================================================================
-- 3) ALL workbooks for that job (proposal-bound and job-level), with sheet
--    counts and item counts. Look for: how many workbooks exist? How many
--    are tied to -4's quote_id (working + locked)? Which ones are empty?
-- =========================================================================
SELECT
  w.id              AS workbook_id,
  w.quote_id,
  q.proposal_number,
  w.status,
  w.version_number,
  w.updated_at,
  (SELECT COUNT(*) FROM public.material_sheets s WHERE s.workbook_id = w.id) AS sheets_count,
  (SELECT COUNT(*) FROM public.material_items mi
     JOIN public.material_sheets s ON s.id = mi.sheet_id
     WHERE s.workbook_id = w.id) AS items_count
FROM public.material_workbooks w
LEFT JOIN public.quotes q ON q.id = w.quote_id
WHERE w.job_id IN (
  SELECT job_id FROM public.quotes
  WHERE proposal_number = '26030-4' OR quote_number = '26030-4'
)
ORDER BY w.updated_at DESC;


-- =========================================================================
-- 4) Where is Pavilion labor stored? (sheet -> workbook -> quote)
--    The sheet_id on a labor row points to ONE specific material_sheets row
--    that belongs to ONE workbook. If that workbook is not the one the UI is
--    showing for proposal -4, native pull misses it and only the orphan
--    labor merge can bring it in.
-- =========================================================================
SELECT
  l.id              AS labor_row_id,
  l.sheet_id,
  s.sheet_name,
  s.order_index,
  s.workbook_id,
  w.status          AS workbook_status,
  w.version_number  AS workbook_version,
  w.quote_id,
  q.proposal_number,
  l.estimated_hours,
  l.hourly_rate,
  l.total_labor_cost
FROM public.material_sheet_labor l
JOIN public.material_sheets s ON s.id = l.sheet_id
JOIN public.material_workbooks w ON w.id = s.workbook_id
LEFT JOIN public.quotes q ON q.id = w.quote_id
WHERE w.job_id IN (
  SELECT job_id FROM public.quotes
  WHERE proposal_number = '26030-4' OR quote_number = '26030-4'
)
  AND s.sheet_name ILIKE '%pavilion%'
ORDER BY s.sheet_name, w.updated_at DESC;


-- =========================================================================
-- 5a) Cedar Post Changes — as a material_sheet (proposal or change_order)
-- =========================================================================
SELECT 'material_sheet' AS kind, s.id, s.sheet_name, s.sheet_type,
       s.order_index, s.workbook_id,
       w.status AS workbook_status, w.version_number,
       w.quote_id, q.proposal_number
FROM public.material_sheets s
JOIN public.material_workbooks w ON w.id = s.workbook_id
LEFT JOIN public.quotes q ON q.id = w.quote_id
WHERE w.job_id IN (
  SELECT job_id FROM public.quotes
  WHERE proposal_number = '26030-4' OR quote_number = '26030-4'
)
  AND s.sheet_name ILIKE '%cedar%';

-- =========================================================================
-- 5b) Cedar Post Changes — as a custom_financial_rows row
-- =========================================================================
SELECT 'custom_financial_row' AS kind, c.id, c.description, c.category,
       c.quote_id, c.job_id, c.sheet_id,
       q.proposal_number,
       (SELECT COUNT(*) FROM public.custom_financial_row_items i WHERE i.row_id = c.id) AS line_items
FROM public.custom_financial_rows c
LEFT JOIN public.quotes q ON q.id = c.quote_id
WHERE (
        c.job_id IN (SELECT job_id FROM public.quotes
                     WHERE proposal_number = '26030-4' OR quote_number = '26030-4')
     OR c.quote_id IN (SELECT q2.id FROM public.quotes q2
                       WHERE q2.job_id IN (SELECT job_id FROM public.quotes
                                           WHERE proposal_number = '26030-4' OR quote_number = '26030-4'))
      )
  AND c.description ILIKE '%cedar%';

-- =========================================================================
-- 5c) Cedar Post Changes — as a subcontractor_estimates row
-- =========================================================================
SELECT 'subcontractor_estimate' AS kind, e.id, e.company_name, e.scope_of_work,
       e.quote_id, e.job_id, e.sheet_id, e.row_id,
       q.proposal_number
FROM public.subcontractor_estimates e
LEFT JOIN public.quotes q ON q.id = e.quote_id
WHERE (
        e.job_id IN (SELECT job_id FROM public.quotes
                     WHERE proposal_number = '26030-4' OR quote_number = '26030-4')
     OR e.quote_id IN (SELECT q2.id FROM public.quotes q2
                       WHERE q2.job_id IN (SELECT job_id FROM public.quotes
                                           WHERE proposal_number = '26030-4' OR quote_number = '26030-4'))
      )
  AND (e.company_name ILIKE '%cedar%' OR e.scope_of_work ILIKE '%cedar%');


-- =========================================================================
-- 6) Was Cedar Post Changes flagged as removed for some sibling? If yes for
--    -4, that's the smoking gun.
-- =========================================================================
SELECT r.id, r.quote_id, r.section_type, r.section_id,
       q.proposal_number,
       r.created_at
FROM public.quote_removed_sections r
LEFT JOIN public.quotes q ON q.id = r.quote_id
WHERE r.quote_id IN (
  SELECT q2.id FROM public.quotes q2
  WHERE q2.job_id IN (SELECT job_id FROM public.quotes
                      WHERE proposal_number = '26030-4' OR quote_number = '26030-4')
);


-- =========================================================================
-- 7) Paste back the rows from blocks 0, 1, 3, 4, 5a, 5b, 5c, 6 so I can pin
--    down exactly which workbook stores what and write the right fix.
-- =========================================================================
