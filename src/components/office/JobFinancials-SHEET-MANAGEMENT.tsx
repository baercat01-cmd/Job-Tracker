// THIS FILE SHOWS THE REQUIRED CHANGES FOR JobFinancials.tsx
// Add these imports at the top (after existing imports):
import { X } from 'lucide-react'; // Add X to the existing lucide-react import line

// Add these state variables after the existing state declarations (around line 117):
const [showAddSheetDialog, setShowAddSheetDialog] = useState(false);
const [newSheetName, setNewSheetName] = useState('');
const [addingSheet, setAddingSheet] = useState(false);
const [workbookId, setWorkbookId] = useState<string | null>(null);

// Modify the loadMaterialsData function to capture workbookId (around line 266):
// Change this line:
//   if (!workbookData) {
// To this:
  if (!workbookData) {
    setWorkbookId(null);  // ADD THIS LINE
    setMaterialsBreakdown({
      sheetBreakdowns: [],
      totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }
    });
    setMaterialSheets([]);
    setSheetLabor({});
    return;
  }

  // After the workbookData check, ADD THIS LINE:
  setWorkbookId(workbookData.id);

// Add these functions after deleteSheetLabor function (around line 633):

async function addNewSheet() {
  if (!workbookId) {
    toast.error('No working workbook found for this job');
    return;
  }

  if (!newSheetName.trim()) {
    toast.error('Please enter a sheet name');
    return;
  }

  setAddingSheet(true);

  try {
    // Get next order index
    const maxOrderIndex = materialSheets.length > 0 
      ? Math.max(...materialSheets.map(s => s.order_index))
      : -1;

    // Create new sheet
    const { data: newSheet, error } = await supabase
      .from('material_sheets')
      .insert({
        workbook_id: workbookId,
        sheet_name: newSheetName.trim(),
        order_index: maxOrderIndex + 1,
      })
      .select()
      .single();

    if (error) throw error;

    toast.success(`Sheet "${newSheetName}" added successfully`);
    setShowAddSheetDialog(false);
    setNewSheetName('');
    
    // Refresh materials data
    await loadMaterialsData();
  } catch (error: any) {
    console.error('Error adding sheet:', error);
    toast.error('Failed to add sheet');
  } finally {
    setAddingSheet(false);
  }
}

async function deleteSheet(sheetId: string, sheetName: string) {
  if (!workbookId) {
    toast.error('No working workbook found');
    return;
  }

  if (materialSheets.length === 1) {
    toast.error('Cannot delete the last sheet. Workbooks must have at least one sheet.');
    return;
  }

  if (!confirm(`Delete sheet "${sheetName}"? This will also delete all materials in this sheet.`)) {
    return;
  }

  try {
    const { error } = await supabase
      .from('material_sheets')
      .delete()
      .eq('id', sheetId);

    if (error) throw error;

    toast.success(`Sheet "${sheetName}" deleted`);
    
    // Refresh materials data
    await loadMaterialsData();
  } catch (error: any) {
    console.error('Error deleting sheet:', error);
    toast.error('Failed to delete sheet');
  }
}

// In the "Add Row Controls" section (around line 945), ADD this button:
{workbookId && (
  <Button 
    onClick={() => setShowAddSheetDialog(true)} 
    variant="outline" 
    size="sm" 
    className="border-2 border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700"
  >
    <Plus className="w-4 h-4 mr-2" />
    Add Material Sheet
  </Button>
)}

// In the material sheet rendering section (around line 986), ADD delete button:
// Find this section:
<div className="flex-1 min-w-0">
  <h3 className="text-lg font-bold text-slate-900 truncate">{sheet.sheetName}</h3>

// Change it to:
<div className="flex-1 min-w-0 pr-8 relative group">
  <h3 className="text-lg font-bold text-slate-900 truncate">{sheet.sheetName}</h3>
  {/* Delete Sheet Button */}
  {workbookId && (
    <Button
      size="sm"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation();
        deleteSheet(sheet.sheetId, sheet.sheetName);
      }}
      className="absolute right-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded"
      title="Delete this sheet"
    >
      <X className="w-4 h-4" />
    </Button>
  )}

// Add this dialog at the end, before the closing tags (around line 1470):
{/* Add Sheet Dialog */}
<Dialog open={showAddSheetDialog} onOpenChange={setShowAddSheetDialog}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Plus className="w-5 h-5" />
        Add New Material Sheet
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div>
        <Label htmlFor="sheet-name">Sheet Name</Label>
        <Input
          id="sheet-name"
          value={newSheetName}
          onChange={(e) => setNewSheetName(e.target.value)}
          placeholder="e.g., Porch, Garage, Interior..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !addingSheet) {
              addNewSheet();
            }
          }}
        />
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button
          onClick={addNewSheet}
          disabled={addingSheet || !newSheetName.trim()}
          className="flex-1"
        >
          {addingSheet ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Add Sheet
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setShowAddSheetDialog(false);
            setNewSheetName('');
          }}
          disabled={addingSheet}
        >
          Cancel
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
