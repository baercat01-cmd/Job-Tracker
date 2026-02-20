# Row Cost Editing Feature - Manual Implementation Instructions

## Overview
Add ability to edit a custom row's base cost (quantity × unit_cost) even after line items have been added. The final price will be: (row base cost + line items + linked subs) × markup.

## Changes Required

### 1. Add New State Variables (after line 236)
```typescript
// Row cost editing dialog
const [showRowCostDialog, setShowRowCostDialog] = useState(false);
const [editingRowCost, setEditingRowCost] = useState<CustomFinancialRow | null>(null);
const [rowCostForm, setRowCostForm] = useState({
  quantity: '1',
  unit_cost: '0',
});
```

### 2. Add New Functions (after deleteRow function, around line 1830)
```typescript
function openRowCostDialog(row: CustomFinancialRow) {
  setEditingRowCost(row);
  setRowCostForm({
    quantity: row.quantity.toString(),
    unit_cost: row.unit_cost.toString(),
  });
  setShowRowCostDialog(true);
}

async function saveRowCost() {
  if (!editingRowCost) return;

  const qty = parseFloat(rowCostForm.quantity) || 0;
  const cost = parseFloat(rowCostForm.unit_cost) || 0;
  const totalCost = qty * cost;

  try {
    const { error } = await supabase
      .from('custom_financial_rows')
      .update({
        quantity: qty,
        unit_cost: cost,
        total_cost: totalCost,
      })
      .eq('id', editingRowCost.id);

    if (error) throw error;
    toast.success('Row cost updated');
    setShowRowCostDialog(false);
    setEditingRowCost(null);
    await loadCustomRows();
    await loadMaterialsData();
  } catch (error: any) {
    console.error('Error updating row cost:', error);
    toast.error('Failed to update row cost');
  }
}
```

### 3. Update SortableRow Props (around line 685)
Add `openRowCostDialog` to the props passed to SortableRow:
```typescript
openRowCostDialog={openRowCostDialog}
```

### 4. Update Custom Row Calculation (in SortableRow, around line 850)
Replace the calculation section with:
```typescript
// NEW CALCULATION: Always include row's base cost + line items
// Row base cost (from quantity × unit_cost)
const rowBaseCost = row.total_cost;

// Combined material cost = row base + line items + linked subs
const combinedMaterialCost = rowBaseCost + materialLineItemsTotal + linkedSubsTaxableTotal;

// Apply row markup to combined cost
const finalPrice = combinedMaterialCost * (1 + row.markup_percent / 100);
```

### 5. Update Pricing Column Display (around line 1050)
Replace the pricing column section with:
```typescript
{/* Pricing column (narrow) */}
<div className="w-[240px] flex-shrink-0 text-right">
  {/* Show cost breakdown */}
  <div className="space-y-1 text-xs mb-2">
    <div className="flex items-center justify-end gap-2 text-slate-600">
      <span>Row Cost:</span>
      <span className="font-semibold">${rowBaseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-4 w-4 p-0"
        onClick={() => openRowCostDialog(row)}
      >
        <Edit className="w-3 h-3 text-blue-600" />
      </Button>
    </div>
    {materialLineItemsTotal > 0 && (
      <div className="flex items-center justify-end gap-2 text-slate-600">
        <span>+ Line Items:</span>
        <span className="font-semibold">${materialLineItemsTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
    )}
    {linkedSubsTaxableTotal > 0 && (
      <div className="flex items-center justify-end gap-2 text-slate-600">
        <span>+ Subcontractors:</span>
        <span className="font-semibold">${linkedSubsTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
    )}
    <div className="flex items-center justify-end gap-2 text-slate-600 pt-1 border-t">
      <span>Subtotal:</span>
      <span className="font-bold">${combinedMaterialCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
    </div>
    <div className="flex items-center justify-end gap-2 text-slate-600">
      <span>Markup:</span>
      <Input
        type="number"
        value={row.markup_percent || 0}
        onChange={(e) => {
          const newMarkup = parseFloat(e.target.value) || 0;
          updateCustomRowMarkup(row.id, newMarkup);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-14 h-5 text-xs px-1 text-center"
        step="1"
        min="0"
      />
      <span>%</span>
    </div>
  </div>
  <p className="text-sm text-slate-500">Materials</p>
  <p className="text-base font-bold text-blue-700">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
  {totalLaborCost > 0 && (
    <>
      <p className="text-sm text-slate-500 mt-2">Labor</p>
      <p className="text-base font-bold text-amber-700">${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </>
  )}
</div>
```

### 6. Add Row Cost Edit Dialog (before the closing `</div>` at the end of component)
```typescript
{/* Row Cost Edit Dialog */}
<Dialog open={showRowCostDialog} onOpenChange={setShowRowCostDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit Row Base Cost</DialogTitle>
      <DialogDescription>
        Edit the base quantity and unit cost for this row. Line items will be added on top of this base cost.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            value={rowCostForm.quantity}
            onChange={(e) => setRowCostForm(prev => ({ ...prev, quantity: e.target.value }))}
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <Label>Unit Cost ($)</Label>
          <Input
            type="number"
            value={rowCostForm.unit_cost}
            onChange={(e) => setRowCostForm(prev => ({ ...prev, unit_cost: e.target.value }))}
            step="0.01"
            min="0"
          />
        </div>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Row Base Cost:</span>
            <span className="font-bold text-blue-700">
              ${(
                (parseFloat(rowCostForm.quantity) || 0) * 
                (parseFloat(rowCostForm.unit_cost) || 0)
              ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          {editingRowCost && customRowLineItems[editingRowCost.id]?.length > 0 && (
            <div className="pt-2 border-t border-blue-300">
              <p className="text-xs text-slate-600">
                Note: This row has {customRowLineItems[editingRowCost.id].length} line item(s) that will be added to this base cost.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setShowRowCostDialog(false);
            setEditingRowCost(null);
          }}
        >
          Cancel
        </Button>
        <Button onClick={saveRowCost}>
          Save Cost
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

### 7. Update Tax Calculation Helpers
In the `getCustomRowTaxableAndNonTaxable` function (around line 2475), ensure it includes the row's base cost:
```typescript
// Start with row's base cost
let taxableTotal = row.taxable ? row.total_cost : 0;
let nonTaxableTotal = row.taxable ? 0 : row.total_cost;

// Then add line items...
```

And in both `standaloneCustomRows.forEach` (around line 2565) and `linkedRows.forEach` (around line 2770) loops, ensure the row's base cost is always included:
```typescript
// Start with row's base cost (always included)
let rowMaterialsTotal = row.category !== 'labor' ? row.total_cost : 0;
let rowMaterialsTaxableOnly = (row.category !== 'labor' && row.taxable) ? row.total_cost : 0;
```

## Result
After these changes:
1. Each custom row will show a breakdown: Row Cost + Line Items + Subcontractors = Subtotal
2. An edit icon next to "Row Cost" allows editing the quantity and unit cost at any time
3. The final price combines all three sources with the row's markup percentage applied to the total
4. This works whether the row has line items or not
