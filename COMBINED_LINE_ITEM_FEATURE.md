# Combined Material + Labor Line Items

## Overview
Users can now add line items that include both material costs and labor hours in a single entry.

## Implementation Summary

### 1. Enhanced Line Item Form State
Added new fields to track labor components:
```typescript
{
  // Existing material fields
  description: '',
  quantity: '1',
  unit_cost: '0',
  markup_percent: '10',
  taxable: true,
  
  // NEW: Labor fields
  labor_hours: '0',
  labor_rate: '60',
  labor_markup_percent: '10',
  
  // Notes field (stores labor data as JSON)
  notes: ''
}
```

### 2. Data Storage
Labor data is stored in the `notes` field as JSON:
```json
{
  "labor": {
    "hours": 8,
    "rate": 60,
    "markup": 10
  },
  "notes": "User's actual notes here"
}
```

### 3. Calculation Logic
- **Material Cost** = quantity × unit_cost
- **Material Price** = material_cost × (1 + markup%)
- **Labor Cost** = hours × rate
- **Labor Price** = labor_cost × (1 + labor_markup%)
- **Total Cost** = material_cost + labor_cost
- **Combined Total** = material_price + labor_price

### 4. New Dialog UI
Two-column layout:
- **Left Column**: Material section (blue) - quantity, unit cost, markup
- **Right Column**: Labor section (amber) - hours, rate, markup
- **Bottom**: Combined total showing final price

### 5. Display in Proposal
Line items will show:
- Description
- Combined total cost (material + labor)
- Combined markup calculation
- Edit/Delete buttons

## User Benefits
1. ✅ Single line item for work that includes both materials and labor
2. ✅ Separate markup controls for materials vs labor
3. ✅ Material portion remains taxable, labor is non-taxable (automatic)
4. ✅ Clear breakdown showing both components during editing

## Example Use Case
**Line Item: "Concrete Foundation"**
- Material: 10 yards @ $150/yard = $1,500
- Material Markup: 10% = $150
- Labor: 16 hours @ $60/hr = $960
- Labor Markup: 10% = $96
- **Combined Total: $2,706**

## Technical Notes
- Backward compatible with existing line items (labor fields default to 0)
- Material-only items work as before
- Labor-only items can be created by setting material quantity to 0
- Tax calculation correctly splits taxable materials from non-taxable labor
