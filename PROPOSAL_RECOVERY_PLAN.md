# PROPOSAL RECOVERY PLAN
### Senior Architect Audit — Martin Builder Estimating System
**Date:** February 26, 2026  
**Scope:** YYNNN-Z Multi-Proposal Architecture + Locked Contract vs. Working Workbook System

---

## SECTION 1: CURRENT STATE ASSESSMENT

### What Has Been Successfully Implemented

**1. Proposal Numbering (Database Layer) ✅ SOLID**
- The `generate_proposal_number(p_job_id UUID)` database function is implemented and tested.
- The trigger `assign_proposal_number_on_insert()` now passes `NEW.job_id` to the function.
- New proposals for the same job correctly get the same base number with an incremented suffix (e.g., `26001-1` → `26001-2` → `26001-3`).
- Documented and verified in `PROPOSAL_NUMBER_FIX_SUMMARY.md`.

**2. `quotes` Table as Proposal Records ✅ SOLID**
- Each row in the `quotes` table represents one YYNNN-Z proposal.
- The table has `job_id`, `proposal_number`, `status`, `current_version`, and `signed_version` columns.
- The `QuotesView.tsx` component correctly handles version history via `proposal_versions`.
- The `submitForEstimating()` flow correctly creates a job and links the quote to it.

**3. Historical Proposal Snapshots ✅ PARTIALLY SOLID**
- The `proposal_versions` table exists and stores JSON snapshots: `workbook_snapshot`, `financial_rows_snapshot`, `subcontractor_snapshot`.
- `JobFinancials.tsx` has `isReadOnly` mode logic that, when viewing a non-current proposal, reads from these frozen snapshots instead of live tables.
- `loadMaterialsData()`, `loadCustomRows()`, and `loadSubcontractorEstimates()` all have an `if (isReadOnly && quote)` guard that routes to snapshot data.
- A `restoreVersionToWorkbook()` function exists in `QuotesView.tsx` via the `restore_version_to_workbook` RPC.

**4. Proposal Navigation in JobFinancials ✅ PARTIALLY SOLID**
- `allJobQuotes` state loads all proposals for a job ordered by `created_at DESC`.
- `navigateToPreviousProposal()` and `navigateToNextProposal()` allow flipping between proposals.
- A `userSelectedQuoteIdRef` ref prevents polling from overriding the user's manual navigation.
- The "Create New Proposal" dialog UI exists and calls `create_proposal_version` RPC.

**5. Locked vs. Working Concept in MaterialWorkbookManager ✅ PARTIALLY SOLID**
- `material_workbooks.status` column distinguishes `'locked'` from `'working'` versions.
- `lockWorkbook()` function sets status to locked and records who locked it and when.
- The UI correctly shows working versions in green and locked versions separately.
- The add/edit features (Add Sheet, Delete Sheet, Add from Catalog) are gated to `working` status only.

**6. Quote Save Fixes ✅ SOLID**
- `cleanNum()` helper validated to never return `NaN`.
- User session validation before saves.
- Payload validation before database upsert.
- Proper `currentQuoteId` tracking to prevent duplicate inserts.

---

## SECTION 2: THE GAPS — BROKEN, MISSING, OR FUNDAMENTALLY FLAWED

### GAP 1: THE CORE ARCHITECTURAL FLAW — Data is Job-Scoped, Not Proposal-Scoped

**This is the root cause of every other problem in this system.**

The three critical data tables are scoped to `job_id`, not `quote_id` / proposal_id:

| Table | Current FK | What It Should Be |
|---|---|---|
| `material_workbooks` | `job_id` | `quote_id` (per-proposal) |
| `custom_financial_rows` | `job_id` | `quote_id` (per-proposal) |
| `subcontractor_estimates` | `job_id` | `quote_id` (per-proposal) |

**What this means in practice:** When proposal `26001-1` exists and you create `26001-2`, the `create_proposal_version` RPC is supposed to "duplicate all data for the new proposal." But if the copies also get `job_id = job.id` with no `quote_id` differentiator, every single proposal now reads from the same pool of rows. When `loadCustomRows()` runs for the current (non-read-only) proposal, it fetches `WHERE job_id = job.id` — which returns ALL rows from ALL proposals combined.

The frontend has a `dedupeRowsByDescription()` hack to compensate, but this is a ticking time bomb:
- Two legitimate rows with the same description (e.g., two "Framing" rows in different proposals) will be silently merged.
- Any row unique to proposal -2 will still appear when editing proposal -1 (the current one).
- The "complete air gap" promised in the UI tooltip is not real.

### GAP 2: `isReadOnly` Stale Closure Race Condition

In `JobFinancials.tsx`, `isReadOnly` is a derived constant:
```typescript
const isReadOnly = quote && allJobQuotes.length > 0 && quote.id !== allJobQuotes[0]?.id;
```

In `navigateToPreviousProposal()`:
```typescript
setQuote(olderQuote);                    // React state update (ASYNC)
userSelectedQuoteIdRef.current = ...;
await loadData(false);                   // Runs IMMEDIATELY after setQuote
```

**The bug:** `loadData()` is called synchronously after `setQuote()`. React batches state updates — `quote` inside the closures of `loadCustomRows()`, `loadMaterialsData()`, etc. still holds the OLD value at the moment those functions execute. This means `isReadOnly` evaluates with the old `quote` object, not the new one.

**Result:** When navigating FROM a current proposal TO a historical one, the loader functions briefly see `isReadOnly = false` (or an incorrect value) and fetch live data instead of the frozen snapshot. The user sees the current proposal's data displayed under the historical proposal's number.

This is the exact problem documented in `PROPOSAL_ISOLATION_FIX.md` — but that document's proposed fix still uses `isReadOnly` which is computed from potentially-stale state.

### GAP 3: `MaterialWorkbookManager.tsx` Crashes on Multi-Proposal Jobs

In `loadQuote()` (line 84):
```typescript
const { data, error } = await supabase
  .from('quotes')
  .select('*')
  .eq('job_id', jobId)
  .maybeSingle();     // ← THIS WILL FAIL SILENTLY when there are 2+ quotes
```

Supabase's `.maybeSingle()` returns an error (`PGRST116`) when the query returns more than one row. The current code does catch `PGRST116` but only to ignore it — meaning `quote` stays `null`. The component then shows no proposal information banner, which is confusing.

**The real fix is to load the most recent quote** (with `.order()` and `.limit(1)`), but this also exposes Gap 1: the workbook manager has no concept of WHICH proposal's workbook it is managing.

### GAP 4: Material Workbooks Have No Proposal Linkage

The `material_workbooks` table has a `job_id` FK but no `quote_id` FK. When a user locks a workbook and creates a new working version, that new working version belongs to the job — not to any specific proposal.

The intended "Locked Contract vs. Working" model should be:
- **Locked Contract Workbook** = the workbook snapshot at the time the contract was signed (immutable, linked to the signed proposal number, e.g., `26001-2`)
- **Working Workbook** = the current editable workbook the estimator is working in for the active proposal

Right now, these two concepts are mixed. The workbook lock is an internal version control mechanism within the workbook table, not a contract-level concept tied to the proposal number.

### GAP 5: `create_proposal_version` RPC Has Unknown Duplication Safety

The `create_proposal_version` SQL function is called from:
1. `createNewProposal()` in `JobFinancials.tsx` — to lock current proposal and create a new one
2. `createNewProposalVersion()` in `JobFinancials.tsx` — older version creation dialog
3. `createNewVersion()` in `QuotesView.tsx` — from the quotes list view

Since there are no migration files in the `supabase/` directory, the actual SQL body of `create_proposal_version` is unknown from a code review. We cannot verify whether it:
- Uses a strict old_id → new_id mapping when copying parent sections → child line items
- Has `ON CONFLICT DO NOTHING` or upsert guards to prevent duplicate inserts
- Properly scopes copied data to a new `quote_id` (vs. just `job_id`)

**The historical duplication bug** (exponentially duplicating line items during saves) suggests this function was previously doing blind inserts. We cannot confirm the current state of the fix without seeing the SQL.

### GAP 6: Two Parallel Versioning Systems Creating Confusion

There are currently **two overlapping versioning systems** in the codebase:

| System | Table | Trigger | UI Entry Point |
|---|---|---|---|
| System A — "Proposal Numbers" | `quotes` (one row per YYNNN-Z) | "Create New Proposal" button | `JobFinancials.tsx` → `createNewProposal()` |
| System B — "Proposal Versions" | `proposal_versions` (snapshots of a quote) | "Create Version" dialog | `JobFinancials.tsx` → `createNewProposalVersion()` |

**System A** creates a new `quotes` row with `26001-2`, `26001-3`, etc. This is the intended YYNNN-Z system.

**System B** creates snapshot records inside `proposal_versions` for a single quote. This was the older versioning approach before the multi-proposal system was designed.

Both systems call the same `create_proposal_version` RPC. The UI in `JobFinancials.tsx` has state for both (`proposalVersions` / `showCreateVersionDialog` for System B AND `allJobQuotes` / `showCreateProposalDialog` for System A). This creates:
- Two different "Create Version" buttons with slightly different behaviors
- User confusion about which to click
- Risk of double-snapshotting

### GAP 7: `loadCustomRows()` Still Loads From `job_id` for the Current Proposal

Even for the "current" (non-read-only) proposal, `loadCustomRows()` does:
```typescript
const { data, error } = await supabase
  .from('custom_financial_rows')
  .select('*')
  .eq('job_id', job.id)    // ← Fetches ALL rows for this job
  .order('order_index');
```

If proposal -2 has been created and its `custom_financial_rows` were copied with the same `job_id`, editing proposal -3 (the current one) will see ALL rows from proposals -1, -2, and -3 combined. The `dedupeRowsByDescription()` function attempts to collapse these but will silently discard legitimate rows with the same description.

---

## SECTION 3: THE VERDICT — REMODEL VS. TEAR DOWN

### Decision: **TARGETED REMODEL with One Strategic Schema Migration**

**Do NOT tear down:**
- The `quotes` table structure and `proposal_number` YYNNN-Z system — this is solid.
- The `generate_proposal_number(p_job_id)` database function — it works correctly.
- The `proposal_versions` snapshot JSON system — the concept is good, and the snapshot reading code in `JobFinancials.tsx` works when triggered correctly.
- The `material_workbooks.status = 'locked' | 'working'` distinction — keep this.
- The `isReadOnly` navigation concept in `JobFinancials.tsx` — keep it, but fix the stale closure issue.
- All the UI components (`QuotesView`, `MaterialWorkbookManager`, `JobFinancials`) — they are large but fixable.

**What MUST be surgically fixed:**

1. **One schema migration** — add `quote_id UUID REFERENCES quotes(id)` to `material_workbooks`, `custom_financial_rows`, and `subcontractor_estimates`. This is the single highest-leverage change in the entire plan.

2. **One RPC rewrite** — rewrite `create_proposal_version` to use strict ID mapping and copy data scoped to the new `quote_id`, not just `job_id`.

3. **Two function fixes** — fix the stale closure in `loadCustomRows()` / `loadMaterialsData()` / `loadSubcontractorEstimates()` by passing `quoteId` and `isHistorical` as explicit parameters instead of relying on component state.

4. **One component fix** — fix `MaterialWorkbookManager.loadQuote()` to handle multiple quotes.

---

## SECTION 4: STEP-BY-STEP EXECUTION PLAN

### PHASE 1: DATABASE SCHEMA (Do This First — Everything Else Depends On It)

**Step 1.1 — Add `quote_id` to proposal-scoped tables**

```sql
-- Add quote_id FK to material_workbooks
ALTER TABLE material_workbooks 
  ADD COLUMN quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

-- Add quote_id FK to custom_financial_rows
ALTER TABLE custom_financial_rows 
  ADD COLUMN quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

-- Add quote_id FK to subcontractor_estimates
ALTER TABLE subcontractor_estimates 
  ADD COLUMN quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
```

**Step 1.2 — Backfill existing data**

For all existing records, find the most recent quote for their `job_id` and set `quote_id` to that quote. This is a one-time migration:

```sql
-- Backfill material_workbooks
UPDATE material_workbooks mw
SET quote_id = (
  SELECT id FROM quotes q 
  WHERE q.job_id = mw.job_id 
  ORDER BY created_at DESC 
  LIMIT 1
)
WHERE quote_id IS NULL AND job_id IS NOT NULL;

-- Backfill custom_financial_rows
UPDATE custom_financial_rows cfr
SET quote_id = (
  SELECT id FROM quotes q 
  WHERE q.job_id = cfr.job_id 
  ORDER BY created_at DESC 
  LIMIT 1
)
WHERE quote_id IS NULL AND job_id IS NOT NULL;

-- Backfill subcontractor_estimates  
UPDATE subcontractor_estimates se
SET quote_id = (
  SELECT id FROM quotes q 
  WHERE q.job_id = se.job_id 
  ORDER BY created_at DESC 
  LIMIT 1
)
WHERE quote_id IS NULL AND job_id IS NOT NULL;
```

**Step 1.3 — Create indexes for the new columns**

```sql
CREATE INDEX idx_material_workbooks_quote_id ON material_workbooks(quote_id);
CREATE INDEX idx_custom_financial_rows_quote_id ON custom_financial_rows(quote_id);
CREATE INDEX idx_subcontractor_estimates_quote_id ON subcontractor_estimates(quote_id);
```

---

### PHASE 2: REWRITE `create_proposal_version` RPC (Anti-Duplication Critical Path)

This is the highest-risk function in the entire system. The rewrite must follow these exact rules:

**Rule 1: Strict ID Mapping — Never Blindly Insert Children**

When copying a parent row and its children (e.g., a `custom_financial_rows` parent and its `custom_row_line_items` children), the function MUST:
1. Insert the new parent row and capture its new `id`.
2. Build a mapping: `old_parent_id → new_parent_id`.
3. For each child, use the mapping to set `row_id = new_parent_id`.
4. NEVER use `INSERT ... SELECT` for children without first resolving the new parent ID.

**Rule 2: Upsert Guards — No Blind Inserts**

Every `INSERT` in the copy operation must include an `ON CONFLICT DO NOTHING` guard or check for existence first. Use `gen_random_uuid()` for new IDs — never reuse old IDs.

**Rule 3: Scope to New `quote_id` — Not `job_id`**

All copied rows must have `quote_id = p_new_quote_id`. The `job_id` should remain the same for foreign key integrity, but all queries in the frontend will filter by `quote_id`.

**Pseudocode for the safe copy algorithm:**

```sql
CREATE OR REPLACE FUNCTION create_proposal_version(
  p_quote_id UUID,      -- The current (to-be-locked) quote
  p_job_id UUID,        -- The job ID
  p_user_id UUID,
  p_change_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_new_quote_id UUID;
  v_new_quote_number TEXT;
  v_old_workbook_id UUID;
  v_new_workbook_id UUID;
  v_old_sheet_id UUID;
  v_new_sheet_id UUID;
  v_old_row_id UUID;
  v_new_row_id UUID;
  -- ID mapping tables (temporary, in-memory for this transaction)
  v_sheet_id_map JSONB := '{}';
  v_row_id_map JSONB := '{}';
BEGIN
  -- STEP 1: Generate a new proposal number for the NEW proposal
  v_new_quote_number := generate_proposal_number(p_job_id);

  -- STEP 2: Create the NEW quote row (the new proposal)
  INSERT INTO quotes (job_id, proposal_number, status, created_by, ...)
  VALUES (p_job_id, v_new_quote_number, 'draft', p_user_id, ...)
  RETURNING id INTO v_new_quote_id;

  -- STEP 3: Snapshot the OLD quote's current live data into proposal_versions
  --         (This freezes the old proposal permanently)
  INSERT INTO proposal_versions (
    quote_id, version_number, workbook_snapshot, 
    financial_rows_snapshot, subcontractor_snapshot, change_notes, created_by
  )
  SELECT 
    p_quote_id,
    COALESCE((SELECT MAX(version_number) FROM proposal_versions WHERE quote_id = p_quote_id), 0) + 1,
    build_workbook_snapshot(p_quote_id),       -- helper that assembles JSON
    build_financial_rows_snapshot(p_quote_id), -- helper that assembles JSON
    build_subcontractor_snapshot(p_quote_id),  -- helper that assembles JSON
    p_change_notes,
    p_user_id;

  -- STEP 4: Copy material_workbooks (scoped to old quote_id → new quote_id)
  FOR v_old_workbook_id IN 
    SELECT id FROM material_workbooks WHERE quote_id = p_quote_id
  LOOP
    INSERT INTO material_workbooks (job_id, quote_id, version_number, status, created_by)
    SELECT job_id, v_new_quote_id, version_number, 'working', p_user_id
    FROM material_workbooks WHERE id = v_old_workbook_id
    RETURNING id INTO v_new_workbook_id;

    -- STEP 4a: Copy material_sheets with ID mapping
    FOR v_old_sheet_id IN 
      SELECT id FROM material_sheets WHERE workbook_id = v_old_workbook_id
    LOOP
      INSERT INTO material_sheets (workbook_id, sheet_name, order_index, is_option)
      SELECT v_new_workbook_id, sheet_name, order_index, is_option
      FROM material_sheets WHERE id = v_old_sheet_id
      RETURNING id INTO v_new_sheet_id;

      -- Record the mapping: old sheet ID → new sheet ID
      v_sheet_id_map := v_sheet_id_map || jsonb_build_object(v_old_sheet_id::text, v_new_sheet_id::text);

      -- STEP 4b: Copy material_items for this sheet (children of sheet)
      INSERT INTO material_items (
        sheet_id, category, usage, sku, material_name, quantity,
        length, color, cost_per_unit, markup_percent, price_per_unit,
        extended_cost, extended_price, taxable, notes, order_index
      )
      SELECT 
        v_new_sheet_id,  -- ← Use NEW sheet ID, never the old one
        category, usage, sku, material_name, quantity,
        length, color, cost_per_unit, markup_percent, price_per_unit,
        extended_cost, extended_price, taxable, notes, order_index
      FROM material_items
      WHERE sheet_id = v_old_sheet_id;
      -- No ON CONFLICT needed here since sheet_id is new UUID — items cannot pre-exist

    END LOOP;
  END LOOP;

  -- STEP 5: Copy custom_financial_rows with strict parent→child ID mapping
  FOR v_old_row_id IN 
    SELECT id FROM custom_financial_rows WHERE quote_id = p_quote_id ORDER BY order_index
  LOOP
    INSERT INTO custom_financial_rows (
      job_id, quote_id, category, description, quantity,
      unit_cost, total_cost, markup_percent, selling_price,
      notes, order_index, taxable, sheet_id
    )
    SELECT
      job_id, v_new_quote_id,  -- ← New quote_id
      category, description, quantity,
      unit_cost, total_cost, markup_percent, selling_price,
      notes, order_index, taxable,
      -- Remap sheet_id using the sheet_id_map built in Step 4a
      CASE WHEN sheet_id IS NOT NULL 
        THEN (v_sheet_id_map->>(sheet_id::text))::UUID 
        ELSE NULL 
      END
    FROM custom_financial_rows WHERE id = v_old_row_id
    RETURNING id INTO v_new_row_id;

    -- Record the mapping: old row ID → new row ID
    v_row_id_map := v_row_id_map || jsonb_build_object(v_old_row_id::text, v_new_row_id::text);

    -- STEP 5a: Copy custom_row_line_items using the row ID mapping
    INSERT INTO custom_row_line_items (
      row_id, description, quantity, unit_cost, total_cost,
      notes, order_index, taxable, markup_percent, item_type, sheet_id
    )
    SELECT
      v_new_row_id,  -- ← CRITICAL: Use mapped NEW row ID
      description, quantity, unit_cost, total_cost,
      notes, order_index, taxable, markup_percent, item_type,
      CASE WHEN sheet_id IS NOT NULL 
        THEN (v_sheet_id_map->>(sheet_id::text))::UUID 
        ELSE NULL 
      END
    FROM custom_row_line_items
    WHERE row_id = v_old_row_id;
    -- Safe: row_id is a brand new UUID, children cannot pre-exist

  END LOOP;

  -- STEP 6: Copy subcontractor_estimates with strict ID mapping
  -- (Follow same pattern as Steps 5/5a — parent first, then children using mapped IDs)
  -- ...

  RETURN jsonb_build_object(
    'quote_id', v_new_quote_id,
    'quote_number', v_new_quote_number,
    'sheets_copied', (SELECT count(*) FROM material_sheets ms 
                      JOIN material_workbooks mw ON ms.workbook_id = mw.id 
                      WHERE mw.quote_id = v_new_quote_id),
    'rows_copied', (SELECT count(*) FROM custom_financial_rows WHERE quote_id = v_new_quote_id)
  );
END;
$$ LANGUAGE plpgsql;
```

**Key Safety Properties of This Algorithm:**
- Each new parent gets a fresh `gen_random_uuid()` ID from Postgres.
- Children are ALWAYS inserted with the new parent's ID (`v_new_row_id` / `v_new_sheet_id`).
- The `v_sheet_id_map` and `v_row_id_map` JSONB objects act as the strict ID translation table.
- Sheet-level `sheet_id` references on rows are also remapped, preventing cross-proposal contamination.
- A child can NEVER receive an old parent's ID because we always use the `RETURNING id INTO` variable.

---

### PHASE 3: FIX THE STALE CLOSURE BUG IN `JobFinancials.tsx`

**The Problem (Do Not Do This):**
```typescript
// navigateToPreviousProposal:
setQuote(olderQuote);           // State update is async
await loadData(false);          // isReadOnly still reads OLD quote from stale closure
```

**The Fix — Pass quoteId and isHistorical as Explicit Parameters:**

Refactor `loadCustomRows`, `loadMaterialsData`, and `loadSubcontractorEstimates` to accept explicit parameters:

```typescript
async function loadCustomRows(targetQuoteId: string, isHistorical: boolean) { ... }
async function loadMaterialsData(targetQuoteId: string, isHistorical: boolean) { ... }
async function loadSubcontractorEstimates(targetQuoteId: string, isHistorical: boolean) { ... }

async function loadData(silent = false, targetQuote?: any) {
  const q = targetQuote ?? quote;
  const historical = q && allJobQuotes.length > 0 && q.id !== allJobQuotes[0]?.id;

  if (!silent) setLoading(true);
  try {
    await Promise.all([
      loadCustomRows(q.id, historical),
      loadMaterialsData(q.id, historical),
      loadSubcontractorEstimates(q.id, historical),
      loadLaborPricing(),
      loadLaborHours(),
    ]);
  } finally {
    if (!silent) setLoading(false);
  }
}

async function navigateToPreviousProposal() {
  const olderQuote = allJobQuotes[currentIndex + 1];
  setQuote(olderQuote);
  userSelectedQuoteIdRef.current = olderQuote.id;
  await loadData(false, olderQuote);   // Pass the quote explicitly — no stale closure
}
```

Inside each load function, replace `if (isReadOnly && quote)` with `if (isHistorical && targetQuoteId)`. This eliminates all dependency on stale React state.

---

### PHASE 4: FIX `MaterialWorkbookManager.tsx`

**Step 4.1 — Fix `loadQuote()` to not crash on multiple quotes:**
```typescript
async function loadQuote() {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })  // Most recent first
    .limit(1)
    .maybeSingle();

  if (error) { console.error('Error loading quote:', error); return; }
  setQuote(data);
}
```

**Step 4.2 — Update `loadWorkbooks()` to filter by `quote_id`:**
```typescript
async function loadWorkbooks() {
  if (!quote) return;  // Don't load until quote is resolved
  const { data, error } = await supabase
    .from('material_workbooks')
    .select('*')
    .eq('quote_id', quote.id)   // Filter by proposal, not just job
    .order('version_number', { ascending: false });
  // ...
}
```

**Step 4.3 — Update workbook creation to include `quote_id`:**
```typescript
const { data: newWorkbook, error: workbookError } = await supabase
  .from('material_workbooks')
  .insert({
    job_id: jobId,
    quote_id: quote.id,    // ← Add this
    version_number: nextVersion,
    status: 'working',
    created_by: profile.id,
  })
  .select().single();
```

---

### PHASE 5: FIX LIVE DATA QUERIES IN `JobFinancials.tsx`

After schema migration, update all live (non-read-only) queries to filter by `quote_id`:

**`loadCustomRows()` (live path):**
```typescript
const { data, error } = await supabase
  .from('custom_financial_rows')
  .select('*')
  .eq('quote_id', targetQuoteId)   // ← Was: .eq('job_id', job.id)
  .order('order_index');
```

**`loadMaterialsData()` (live path):**
```typescript
const { data: workbook } = await supabase
  .from('material_workbooks')
  .select('id')
  .eq('quote_id', targetQuoteId)   // ← Was: .eq('job_id', jobId)
  .eq('status', 'working')
  .maybeSingle();
```

**`loadSubcontractorEstimates()` (live path):**
```typescript
const { data, error } = await supabase
  .from('subcontractor_estimates')
  .select('*')
  .eq('quote_id', targetQuoteId)   // ← Was: .eq('job_id', job.id)
  .order('order_index');
```

---

### PHASE 6: CONSOLIDATE THE DUAL VERSIONING SYSTEMS

The confusing `proposal_versions` System B (snapshot-only) and the multi-quote System A (YYNNN-Z) should be consolidated:

1. **Remove the old `showCreateVersionDialog` / `createNewProposalVersion()` flow** from `JobFinancials.tsx`. This is the System B dialog that creates snapshot-only versions.
2. **The ONLY way to create a new version is `createNewProposal()`** which creates a full new YYNNN-Z proposal with duplicated data AND a snapshot.
3. The `proposal_versions` table is retained as the snapshot store but is only written to by `create_proposal_version` — never by the UI directly.
4. Keep the `restoreVersionToWorkbook()` function — it remains useful for rolling back.

---

### PHASE 7: DEFINE THE "LOCKED CONTRACT VS. WORKING" MODEL

The final correct mental model, to be enforced by schema and UI:

| Concept | Where It Lives | What It Means |
|---|---|---|
| **Active (Working) Proposal** | The latest `quotes` row for a job (highest `created_at`) | Currently being edited; all live data editable |
| **Historical Proposal** | All other `quotes` rows for the same job | Read-only; data served from `proposal_versions` snapshot |
| **Working Workbook** | `material_workbooks WHERE quote_id = [active_quote.id] AND status = 'working'` | The editable materials for the current proposal |
| **Locked Contract Workbook** | `material_workbooks WHERE quote_id = [signed_quote.id] AND status = 'locked'` | The frozen materials at contract signing; never edited |
| **Contract Signing Event** | `quotes.status = 'signed'`, `job_budgets` row created | Triggers workbook lock, budget creation, and proposal freeze |

---

## CRITICAL: ANTI-DUPLICATION PROTOCOL FOR CLONE WORKBOOK

The following rules are **NON-NEGOTIABLE** and must be verified in the `create_proposal_version` SQL before it goes live:

### Rule 1: Parent-First, Then Children
Every copy operation must be:
```
INSERT parent → capture new_parent_id
INSERT children WHERE parent_id = new_parent_id  ← never old_parent_id
```

### Rule 2: Explicit ID Translation Map
Before the copy begins, declare local mapping variables:
```sql
v_sheet_id_map JSONB := '{}';   -- old_sheet_id → new_sheet_id
v_row_id_map JSONB := '{}';     -- old_row_id → new_row_id
v_sub_id_map JSONB := '{}';     -- old_sub_estimate_id → new_sub_estimate_id
```
These maps are built during the copy and used to resolve ALL foreign key references in child rows. No child insert should ever reference an ID that is NOT in the map.

### Rule 3: Children Are Inserted Exactly Once
The copy loop structure is:
```sql
FOR old_parent_row IN SELECT * FROM parent_table WHERE quote_id = p_quote_id LOOP
  INSERT INTO parent_table (...) RETURNING id INTO new_parent_id;
  -- Build map entry ONCE here
  
  -- NOW insert children
  INSERT INTO child_table (parent_id, ...) 
  SELECT new_parent_id, ...  -- ← ONLY the new ID, never the old
  FROM child_table WHERE parent_id = old_parent_row.id;
  
END LOOP;
```
There is no outer loop, no secondary pass, no re-query. One loop = one parent copy = one batch of child copies.

### Rule 4: Verify Before Executing
Before running the migration in production, run a verification query:
```sql
-- After cloning, verify no orphaned line items
SELECT COUNT(*) FROM custom_row_line_items cli
LEFT JOIN custom_financial_rows cfr ON cli.row_id = cfr.id
WHERE cfr.id IS NULL;  -- Should return 0
```

---

## SUMMARY: EXECUTION ORDER

| Step | Action | Risk | Reversible? |
|---|---|---|---|
| 1.1 | `ALTER TABLE` — add `quote_id` columns | Low | Yes (DROP COLUMN) |
| 1.2 | Backfill `quote_id` on existing rows | Medium | Yes (SET NULL) |
| 2 | Rewrite `create_proposal_version` RPC | High | Yes (roll back SQL) |
| 3 | Fix stale closure in `loadData()` | Low | Yes (git revert) |
| 4 | Fix `MaterialWorkbookManager` | Low | Yes (git revert) |
| 5 | Update live queries to use `quote_id` | Medium | Yes (git revert) |
| 6 | Remove System B versioning dialogs | Low | Yes (git revert) |
| 7 | Verify with a full end-to-end test | — | N/A |

**Do not skip Step 1 before doing Steps 2–5.** Steps 2–5 will produce wrong results without the schema column existing.

---

*End of PROPOSAL_RECOVERY_PLAN.md*  
*This document is a read-only audit plan. No code changes have been made to the repository.*
