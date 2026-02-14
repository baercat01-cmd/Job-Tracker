# Material Ordering & Invoice Tracking Workflow

## Complete Material Lifecycle

```
1. NOT ORDERED → Materials in workbook, not yet purchased
2. PULL FROM SHOP / ORDERED → Materials "ordered" (from shop OR vendor via PO)
3. INVOICED → Materials invoiced to Martin Builder (Countywide → Martin Builder)
4. RECEIVED → Materials physically received
5. READY FOR JOB → Materials ready to deploy
```

## Key Concepts

### "Ordered" Means:
- **Option A**: Purchase Order created (Vendor → Countywide) - ordered from vendor
- **Option B**: Status marked "pull_from_shop" - ordered from Countywide's shop inventory

**Both count as "ordered"** - the material has been committed/purchased.

### Invoice Workflow (Countywide → Martin Builder):
After materials are "ordered" (via PO or shop), they must be **invoiced** to Martin Builder:
- **Shop materials**: Create invoice only (no PO needed)
- **Vendor materials**: Already have PO, now create invoice to bill Martin Builder
- Track invoice ID/number on each material
- Visibility: see which materials are ordered but not invoiced

## Database Fields (already exist)

### material_items table:
- `status` - Lifecycle stage (not_ordered, pull_from_shop, ordered, received, ready_for_job)
- `zoho_sales_order_id` - Sales Order ID (if created)
- `zoho_sales_order_number` - Sales Order Number
- `zoho_purchase_order_id` - Purchase Order ID (if ordered from vendor)
- `zoho_purchase_order_number` - PO Number  
- `zoho_invoice_id` - **Invoice ID (Countywide → Martin Builder)**
- `zoho_invoice_number` - **Invoice Number**
- `ordered_at` - Timestamp when ordered
- `ordered_by` - User who ordered

## Implementation Plan

### STEP 1: Enhance Status Logic
**When package status changes to "pull_from_shop":**
- Mark all materials as "ordered" 
- Set `ordered_at` timestamp
- Understand: "pull from shop" = ordering from Countywide

**When package status changes to "ordered":**
- Materials already marked via PO creation
- Keep existing logic

### STEP 2: Add "Create Invoice" Button
**Show button when:**
- Package has materials that are "ordered" (status = 'ordered' OR 'pull_from_shop')
- Materials don't have `zoho_invoice_id` yet

**Button action:**
- Filter materials: ordered but not invoiced
- Call edge function: `action='create_invoice'`
- Create invoice in Zoho Books (Countywide → Martin Builder)
- Update materials with invoice ID/number

### STEP 3: Invoice Status Display
**Material list indicators:**
- Green badge: "Ordered" (has PO or status='ordered/pull_from_shop')
- Blue badge: "Invoiced" (has invoice_id)
- Yellow badge: "Needs Invoice" (ordered but not invoiced)

**Package-level summary:**
- Show counts: X ordered, Y invoiced, Z needs invoice
- Filter/sort by invoice status

### STEP 4: Edge Function Enhancement
**Add new action: `create_invoice`**

```typescript
if (action === 'create_invoice') {
  // Get materials that need invoicing
  // Find or create Martin Builder customer
  // Create invoice (Countywide → Martin Builder)
  // Update material_items with invoice ID/number
  // Return invoice details
}
```

### STEP 5: UI Enhancements

**Material Package Card:**
```
Package Name [Badge: 5 ordered | 3 invoiced | 2 need invoice]
[Status Dropdown] [Order Button] [Create Invoice Button*] [Materials]

*Show only if materials need invoicing
```

**Material Item Display:**
```
Material Name
├─ Qty: 10
├─ [Green] Ordered 12/14/2024 - PO: PO-001
└─ [Yellow] Needs Invoice ⚠️

OR

Material Name  
├─ Qty: 10
├─ [Green] Ordered 12/14/2024 - From Shop
├─ [Blue] Invoiced - INV: INV-123
```

## Invoice Creation Dialog

Similar to ZohoOrderConfirmationDialog but for invoices:

```tsx
<InvoiceCreationDialog
  open={showInvoiceDialog}
  jobName={job.name}
  materials={orderedButNotInvoicedMaterials}
  packageName={package.name}
  onSuccess={() => reloadPackages()}
/>
```

## Reporting & Visibility

### Package Level:
- Count: ordered vs invoiced
- Warning indicator if materials ordered but not invoiced

### Job Level (future):
- All materials for job
- Status breakdown (not ordered, ordered, invoiced, received)
- Missing invoices report

## Example Workflow

### Scenario 1: Shop Materials
1. User marks package "Pull from Shop"
2. System marks all materials as "ordered" (from Countywide shop)
3. User clicks "Create Invoice" button
4. System creates invoice in Zoho (Countywide → Martin Builder)
5. Materials marked with invoice ID
6. Package shows: "5 ordered | 5 invoiced"

### Scenario 2: Vendor Materials
1. User clicks "Order" → creates PO (Vendor → Countywide)
2. System marks materials as "ordered" and saves PO number
3. User clicks "Create Invoice" button
4. System creates invoice in Zoho (Countywide → Martin Builder)
5. Materials now have both PO and Invoice
6. Package shows: "10 ordered | 10 invoiced"

### Scenario 3: Mixed (Shop + Vendor)
1. Some materials ordered via PO, some marked "pull from shop"
2. All counted as "ordered"
3. User clicks "Create Invoice" for entire package
4. System creates single invoice for ALL materials
5. All materials marked with invoice ID

## Files to Modify

1. **MaterialPackages.tsx**
   - Add invoice status badges
   - Add "Create Invoice" button logic
   - Add invoice count display
   - Filter materials by invoice status

2. **supabase/functions/zoho-sync/index.ts**
   - Add `create_invoice` action
   - Create invoice in Zoho API
   - Update materials with invoice data

3. **src/components/office/InvoiceCreationDialog.tsx** (NEW)
   - Similar to ZohoOrderConfirmationDialog
   - Show materials needing invoice
   - Confirm invoice creation
   - Display created invoice

## Success Criteria

✅ When package status → "pull_from_shop", materials marked as "ordered"
✅ Clear visibility: which materials are ordered vs invoiced
✅ Easy workflow: click button to invoice ordered materials
✅ Invoice tracking: see invoice numbers on materials
✅ Prevent duplicates: can't invoice already-invoiced materials
✅ Complete tracking: Order → Invoice → Received → Ready for Job
