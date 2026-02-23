# Proposal Version Isolation Fix

## Problem
When viewing a historical proposal (e.g., -2), editing materials in the current proposal (-1) was affecting the historical view. This is because both proposals were loading data from the **same underlying workbook and material sheets** in the database.

## Root Cause
In `JobFinancials.tsx`, the `loadMaterialsData()` function has a check for `isReadOnly && quote`, but this check comes AFTER the component has already determined which quote to load. The issue is:

1. Proposal -1 (current) → loads live workbook data ✓
2. Proposal -2 (historical) → **should** load snapshot data, but was loading live workbook data ✗

The `isReadOnly` check exists, but it's not being properly enforced. The historical proposals were still querying the live `material_workbooks`, `material_sheets`, and `material_items` tables instead of using only the snapshot.

## Solution
Modify `loadMaterialsData()` to:

1. **Check isReadOnly FIRST** before any database queries
2. If viewing a historical proposal (not the most recent), **ONLY** load from `proposal_versions.workbook_snapshot`
3. **NEVER** query live workbook/sheets/items tables for historical views
4. Add logging to clearly show when snapshot vs live data is being used

### Code Changes Required

In `src/components/office/JobFinancials.tsx`, line ~2282:

```typescript
async function loadMaterialsData() {
  try {
    // CRITICAL FIX: Check if viewing historical proposal BEFORE any database queries
    // Compute isReadOnly inline since it's a derived value
    const viewingHistoricalProposal = quote && allJobQuotes.length > 0 && quote.id !== allJobQuotes[0]?.id;
    
    if (viewingHistoricalProposal) {
      console.log('📖 HISTORICAL VIEW - Loading from SNAPSHOT ONLY for:', quote.proposal_number);
      console.log('   ⚠️ Skipping live database - isolated from current workbook');
      
      // Find the proposal version snapshot
      const { data: versionData, error: versionError } = await supabase
        .from('proposal_versions')
        .select('workbook_snapshot')
        .eq('quote_id', quote.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (versionError) {
        console.error('❌ Error loading snapshot:', versionError);
        throw versionError;
      }
      
      if (!versionData?.workbook_snapshot) {
        console.log('⚠️ No snapshot found');
        // Set empty state
        setMaterialsBreakdown({ sheetBreakdowns: [], totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }});
        setMaterialSheets([]);
        setSheetLabor({});
        setCategoryMarkups({});
        return;
      }
      
      // Use ONLY snapshot data - never touch live database
      const snapshot = versionData.workbook_snapshot;
      const sheetsData = snapshot.sheets || [];
      
      console.log(`✅ Loaded ${sheetsData.length} sheets from snapshot (completely isolated)`);
      
      // Rest of snapshot processing code...
      // (existing code that processes snapshot.sheets, snapshot.category_markups, snapshot.sheet_labor)
      
      return; // CRITICAL: Exit here - don't continue to live database queries
    }
    
    // Normal flow for CURRENT proposal only (not historical)
    console.log('📝 CURRENT VIEW - Loading live workbook data');
    // ... existing database query code ...
  }
}
```

## Same Fix Needed For:
The same isolation fix is needed in:

1. **loadCustomRows()** - line ~2149
2. **loadSubcontractorEstimates()** - line ~2216
3. Any other function that loads data

Each must check `viewingHistoricalProposal` FIRST and use snapshot if true.

## Testing
After fix:
1. Navigate to Proposal -2 (historical)
2. Edit materials in Proposal -1 (current)  
3. Navigate back to Proposal -2
4. **Verify:** Proposal -2 shows EXACT same data as before (unchanged)
5. Check console: Should see "HISTORICAL VIEW - Loading from SNAPSHOT ONLY"

## Key Principle
**Historical proposals must be completely isolated from live database changes.**  
They should ONLY ever read from their frozen snapshot, never from live tables.
