
// Updated subcontractor line items to support three distinct states:
// 1. **Material (Taxable)** - Marked as "Material" with taxable checkbox checked → goes to materials total, gets taxed
// 2. **Material (Non-taxable)** - Marked as "Material" with taxable checkbox unchecked → goes to materials total, not taxed
// 3. **Labor (Always Non-taxable)** - Marked as "Labor" → always goes to labor total, never taxed

// Each subcontractor line item now has:
// - A clickable "Material/Labor" badge to toggle the item type
// - For Material items: a "Tax" checkbox to control taxability
// - For Labor items: a fixed "No Tax" badge (always non-taxable)

// The UI uses color coding:
// - Material items: slate background
// - Labor items: amber background
// - Excluded items: red background

// All calculations have been updated to properly route items based on their type and taxable status.
