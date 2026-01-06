# Materials List Date Editing Feature

## Changes Made:

1. **Added new state variables** for date editing without status change:
   - `editDatesMaterial` - For single material date editing
   - `editDatesGroup` - For material group date editing  
   - `savingDates` - Loading state for save operation

2. **Added helper functions**:
   - `openEditDates(material)` - Opens date edit dialog for single material
   - `openEditDatesGroup(group)` - Opens date edit dialog for material group
   - `saveDates()` - Saves updated dates without changing status

3. **UI Changes**:
   - Added "Edit Dates" button below each status dropdown
   - Shows "Order By Date" prominently in "Not Ordered" status
   - New dialog for editing all dates (order by, delivery, pull by, actual delivery)

4. **Status Display Updates**:
   - Order by date now shows in "not_ordered" status with 📋 icon
   - Delivery dates show with 🚚 icon for expected or ✅ for actual
   - Timeline shows order requested and pull by dates

## Implementation Details:

The "Edit Dates" button appears in:
- Individual material group cards in the foreman view
- Allows updating all date fields without changing material status
- Works for both single materials and material groups

All date fields are optional and can be updated independently.
