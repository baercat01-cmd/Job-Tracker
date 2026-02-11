// This is a simplified reorganization showing the key changes needed
// The proposal tab needs:
// 1. All sections collapsed by default (defaultOpen={false})
// 2. Labor rows from custom_financial_rows where category='labor'
// 3. Tax only applied at final total, not per line
// 4. Labor section above subcontractors
// 5. Descriptions visible without expanding
// 6. Totals on right side
// 7. Estimated hours calculated from labor rows

// Key changes summary:
// - Filter labor rows: const laborRows = customRows.filter(r => r.category === 'labor')
// - Calculate hours: const totalLaborHours = laborRows.reduce((sum, r) => sum + r.quantity, 0)
// - Use totalLaborHours instead of estimatedHours for progress
// - Add 'labor' category to categoryLabels and categoryDescriptions
// - Add labor category option in the dialog
// - Change quantity/unitCost labels to Hours/Rate when category === 'labor'
// - Move labor section before subcontractors
// - Remove tax from individual line items, only calculate at end
// - Make all Collapsible components use defaultOpen={false}
// - Add descriptions in collapsed view
// - Move grand total to flex justify-end wrapper
// - Compact subcontractor document management header

// See the full files below for complete implementation
