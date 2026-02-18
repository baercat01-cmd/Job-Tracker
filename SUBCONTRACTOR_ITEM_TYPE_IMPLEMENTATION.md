# Subcontractor Line Item Type Toggle Implementation

## Problem
Subcontractor line items need to distinguish between materials and labor to properly calculate totals. Currently only uses `taxable` field, but need explicit `item_type` field control.

## Database
The `item_type` field already exists in `subcontractor_estimate_line_items` table with default value 'material'.

## Changes Needed

### 1. Add toggle function (after `toggleSubcontractorLineItemTaxable`)

```typescript
async function toggleSubcontractorLineItemType(lineItemId: string, currentType: string) {
  try {
    const newType = currentType === 'material' ? 'labor' : 'material';
    const updates: any = { item_type: newType };
    
    // Labor is always non-taxable
    if (newType === 'labor') {
      updates.taxable = false;
    }
    
    const { error } = await supabase
      .from('subcontractor_estimate_line_items')
      .update(updates)
      .eq('id', lineItemId);

    if (error) throw error;
    await loadSubcontractorEstimates();
  } catch (error: any) {
    console.error('Error toggling item type:', error);
    toast.error('Failed to update item type');
  }
}
```

### 2. Update UI in subcontractor line items section (around line 1100)

Replace the existing badge/checkbox section with:

```typescript
<div className="flex items-center gap-2">
  <Badge
    variant="outline"
    className={`text-xs h-5 cursor-pointer hover:bg-slate-100 ${lineItem.excluded ? 'opacity-50' : ''}`}
    onClick={() => !lineItem.excluded && toggleSubcontractorLineItemType(lineItem.id, lineItem.item_type || 'material')}
    title="Click to toggle between Material and Labor"
  >
    {(lineItem.item_type || 'material') === 'labor' ? '👷 Labor' : '📦 Material'}
  </Badge>
  {(lineItem.item_type || 'material') === 'material' && (
    <>
      <Badge variant={lineItem.taxable ? 'default' : 'secondary'} className="text-xs h-5">
        {lineItem.taxable ? 'Tax' : 'No Tax'}
      </Badge>
      <input
        type="checkbox"
        checked={lineItem.taxable}
        onChange={() => toggleSubcontractorLineItemTaxable(lineItem.id, lineItem.taxable)}
        className="rounded border-slate-300 text-green-600 focus:ring-green-500"
        title="Taxable"
        disabled={lineItem.excluded}
      />
    </>
  )}
  <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
    ${lineItem.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
  </p>
</div>
```

### 3. Pass function to SortableRow component props

Add to the props destructuring in SortableRow:
```typescript
toggleSubcontractorLineItemType,
```

Add to the main component where SortableRow is called:
```typescript
toggleSubcontractorLineItemType={toggleSubcontractorLineItemType}
```

### 4. Update calculation logic to use `item_type`

Replace all instances of subcontractor calculations that check `item.taxable` to check `item.item_type`:

**For materials total:**
```typescript
.filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material')
```

**For labor total:**
```typescript
.filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
```

This ensures:
- Material items can be taxable or non-taxable → go to materials total
- Labor items → always non-taxable → go to labor total

## Implementation Complete
Once implemented, users will see a clickable badge showing "📦 Material" or "👷 Labor". Clicking toggles between the two types. Labor items automatically hide the tax checkbox since they're always non-taxable.
