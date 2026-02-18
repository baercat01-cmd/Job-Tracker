# Apply Parent Markup Feature for Linked Rows

## Problem
When rows are added to a material section (linked to a sheet), the sheet's markup is automatically applied on top of the row's own markup. Some rows should have this option disabled - they should only use their own markup percentage.

## Database
The field `apply_parent_markup` already exists in `custom_financial_rows` table with default value `true`.

## Solution Summary

### 1. Add UI Toggle (in Custom Row Pricing Section)
**Location:** Around line 460 in `SortableRow` function, right after the final price display

Add a checkbox below the pricing that shows when row is linked to a sheet:

```tsx
{(row as any).sheet_id && (
  <div className="flex items-center gap-1 mt-1">
    <input
      type="checkbox"
      checked={row.apply_parent_markup !== false}
      onChange={async (e) => {
        try {
          await supabase
            .from('custom_financial_rows')
            .update({ apply_parent_markup: e.target.checked })
            .eq('id', row.id);
          await loadCustomRows();
        } catch (error) {
          console.error('Error updating apply_parent_markup:', error);
        }
      }}
      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
      title="Apply sheet markup"
    />
    <span className="text-xs text-slate-500">Sheet markup</span>
  </div>
)}
```

### 2. Update Sheet Price Calculation (Material Sheet Row)
**Location:** Around line 125, where linked rows are calculated

**Before:**
```tsx
const linkedRowsTotal = linkedRows.reduce((rowSum: number, row: any) => {
  const lineItems = customRowLineItems[row.id] || [];
  const baseCost = lineItems.length > 0
    ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
    : row.total_cost;
  return rowSum + (baseCost * (1 + row.markup_percent / 100));
}, 0);

const sheetBaseCost = sheet.totalPrice + linkedRowsTotal + linkedSubsTaxableTotal;
const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
const sheetFinalPrice = sheetBaseCost * (1 + sheetMarkup / 100);
```

**After:**
```tsx
// Separate rows by apply_parent_markup
const linkedRowsWithParentMarkup = linkedRows.filter((r: any) => r.apply_parent_markup !== false);
const linkedRowsWithoutParentMarkup = linkedRows.filter((r: any) => r.apply_parent_markup === false);

const linkedRowsTotal = linkedRowsWithParentMarkup.reduce((rowSum: number, row: any) => {
  const lineItems = customRowLineItems[row.id] || [];
  const baseCost = lineItems.length > 0
    ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
    : row.total_cost;
  return rowSum + (baseCost * (1 + row.markup_percent / 100));
}, 0);

const linkedRowsOwnMarkupOnly = linkedRowsWithoutParentMarkup.reduce((rowSum: number, row: any) => {
  const lineItems = customRowLineItems[row.id] || [];
  const baseCost = lineItems.length > 0
    ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
    : row.total_cost;
  return rowSum + (baseCost * (1 + row.markup_percent / 100));
}, 0);

const sheetBaseCost = sheet.totalPrice + linkedRowsTotal + linkedSubsTaxableTotal;
const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
const sheetFinalPrice = (sheetBaseCost * (1 + sheetMarkup / 100)) + linkedRowsOwnMarkupOnly;
```

### 3. Update Display (Collapsible Content)
**Location:** Around line 250, in the linked rows display

Add a badge to show "Own markup only" status:

```tsx
<div className="flex items-center gap-2 flex-1">
  <p className="text-xs font-semibold text-slate-900">{row.description}</p>
  {!row.apply_parent_markup && (
    <Badge variant="outline" className="text-xs h-4 bg-amber-100 text-amber-700">
      Own markup only
    </Badge>
  )}
</div>
```

### 4. Update Proposal Calculations
**Location:** Around line 2700, in `materialSheetsPrice` calculation

Similar changes to separate linked rows by `apply_parent_markup` flag and add only the base cost (without parent markup) to the sheet price.

## Benefits
- Users can now control which linked rows get the parent sheet markup
- Prevents double-markup on items that should only use their own markup percentage
- Visual indicator shows which rows are using "own markup only"
- Checkbox is only visible when row is linked to a sheet

## Usage
1. Add a row to a material section
2. The row will default to applying both its own markup AND the sheet's markup
3. Uncheck "Sheet markup" checkbox to use only the row's own markup percentage
4. The row will show a yellow badge indicating "Own markup only"
