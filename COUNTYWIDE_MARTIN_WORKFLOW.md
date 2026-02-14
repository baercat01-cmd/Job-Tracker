# Countywide → Martin Builder Material Workflow

## Overview
This system manages the flow of materials from Countywide (lumber yard) to Martin Builder (contractor) to End Customer.

## Companies

### Countywide (Lumber Yard)
- **Zoho Books**: Currently set up
- **Role**: Purchases materials from vendors OR provides from shop
- **Bills to**: Martin Builder (internal customer)

### Martin Builder (Contractor)
- **Zoho Books**: Not yet set up (will be in future)
- **Role**: Receives materials from Countywide, bills end customer
- **Bills to**: End Customer (from Proposal)
- **Customer in**: Countywide's Zoho Books

## Material Workflows

### Workflow A: Shop Materials (Already Owned by Countywide)
```
1. Materials marked as "Shop" source in workbook
2. No vendor needed
3. Create INVOICE (not SO) from Countywide → Martin Builder
4. Multiple packages can be combined on one invoice
```

### Workflow B: Vendor Materials (Need to Purchase)
```
1. Materials marked as "Vendor" source in workbook
2. Vendor selected for materials
3. Create PO: Vendor → Countywide (purchase materials)
4. Create SO/Invoice: Countywide → Martin Builder (bill Martin Builder)
```

## Database Changes Implemented

### material_items table - NEW COLUMNS:
- `vendor_id` - Which vendor to order from (if source = vendor)
- `material_source` - 'shop' | 'vendor' | 'not_specified'
- `zoho_invoice_id` - Direct invoice ID (for shop materials)
- `zoho_invoice_number` - Direct invoice number (for shop materials)

### material_bundles table - NEW COLUMNS:
- `default_vendor_id` - Default vendor for package
- `default_source` - Default source ('shop' or 'vendor')

## User Interface Flow

### 1. Material Package Creation
- User creates packages as usual
- Can optionally set default vendor and source for entire package

### 2. Material Configuration (per item)
- Mark each material as "Shop" or "Vendor"
- If "Vendor", select which vendor
- Track this for proper order creation

### 3. Order Creation Dialog (Enhanced)
**Option 1: From Shop**
- Create Invoice only (Countywide → Martin Builder)
- No PO needed
- Can select multiple packages to combine on one invoice

**Option 2: From Vendor**
- Create PO (Vendor → Countywide)
- Create SO/Invoice (Countywide → Martin Builder)
- Materials tracked with both order numbers

### 4. Combined Invoicing
- Select multiple packages
- Combine shop materials onto single invoice
- One invoice to Martin Builder for multiple packages

## Next Implementation Steps

### STEP 1: Enhance Material Items with Source/Vendor Selection
- [ ] Add vendor dropdown to material items in workbook
- [ ] Add source selector (Shop/Vendor) to material items
- [ ] Show vendor and source in material displays

### STEP 2: Update ZohoOrderConfirmationDialog
- [ ] Change "Sales Order" terminology to "Invoice" for shop materials
- [ ] Add source-based logic:
  - Shop materials → Invoice only
  - Vendor materials → PO + SO/Invoice
- [ ] Add multi-package selection
- [ ] Group materials by source for clarity

### STEP 3: Update MaterialPackages Component  
- [ ] Add vendor and source indicators to package view
- [ ] Show "Shop" vs "Vendor" badges on materials
- [ ] Allow multi-select for combined invoicing

### STEP 4: Update Edge Function (zoho-sync)
- [ ] Add "invoice" order type (not just SO/PO)
- [ ] Handle shop vs vendor material logic
- [ ] Support combined invoicing for multiple packages
- [ ] Update material items with correct order IDs

## Important Notes

### Current State
✅ Database structure ready (vendor_id, material_source, invoice fields)
⏳ UI needs to be updated to use new fields
⏳ Edge function needs invoice creation logic
⏳ Multi-package selection UI needed

### Customer Visibility
- End customers NEVER see Countywide invoices
- End customers only see Martin Builder invoices (from Proposals)
- Countywide ↔ Martin Builder is internal billing

### Job Reference
- All Countywide invoices/orders reference the job
- Job is under "Martin Builder" customer in Countywide's Zoho
- Job name/number included in all orders for tracking

## Questions Answered

**Q: Can we skip SO and go straight to invoice for shop materials?**
✅ Yes - implemented with zoho_invoice_id/number fields

**Q: Can multiple packages be on same invoice?**
✅ Yes - will implement multi-select for packages

**Q: Should we track which vendor materials come from?**
✅ Yes - vendor_id field added to materials

**Q: Does end customer see Countywide billing?**
❌ No - only Martin Builder bills end customer

## Implementation Priority

**Phase 1 (Most Important):**
1. Add vendor/source selection to materials
2. Update order dialog for source-based logic
3. Test shop material invoice creation

**Phase 2:**
4. Implement multi-package invoicing
5. Add vendor filtering and tracking
6. Enhanced reporting by source/vendor

**Phase 3 (Future):**
7. Martin Builder Zoho Books integration
8. Automated markup calculations
9. Cross-company profit tracking
