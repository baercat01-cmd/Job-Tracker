import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ArrowRight, Check } from 'lucide-react';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  material_name: string;
  sku: string | null;
  quantity: number;
  extended_price: number;
}

interface Sheet {
  id: string;
  sheet_name: string;
}

interface BulkMaterialMoverProps {
  sheet: {
    sheetId: string;
    sheetName: string;
    categories: Array<{
      name: string;
      itemCount: number;
      items: Array<{
        material_name: string;
        sku: string | null;
        quantity: number;
        extended_price: number;
      }>;
    }>;
  };
  allSheets: Sheet[];
  onMoveComplete: () => Promise<void>;
}

export function BulkMaterialMover({ sheet, allSheets, onMoveComplete }: BulkMaterialMoverProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [targetSheetId, setTargetSheetId] = useState('');
  const [moving, setMoving] = useState(false);

  function toggleItem(categoryName: string, materialName: string, sku: string | null) {
    const itemKey = `${categoryName}|||${materialName}|||${sku || ''}`;
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  }

  function toggleCategorySelection(category: any) {
    const categoryItems = category.items || [];
    const allSelected = categoryItems.every((item: any) => 
      selectedItems.has(`${category.name}|||${item.material_name}|||${item.sku || ''}`)
    );

    setSelectedItems(prev => {
      const newSet = new Set(prev);
      categoryItems.forEach((item: any) => {
        const itemKey = `${category.name}|||${item.material_name}|||${item.sku || ''}`;
        if (allSelected) {
          newSet.delete(itemKey);
        } else {
          newSet.add(itemKey);
        }
      });
      return newSet;
    });
  }

  function isCategorySelected(category: any) {
    const categoryItems = category.items || [];
    if (categoryItems.length === 0) return false;
    return categoryItems.every((item: any) => 
      selectedItems.has(`${category.name}|||${item.material_name}|||${item.sku || ''}`)
    );
  }

  function isItemSelected(categoryName: string, materialName: string, sku: string | null) {
    return selectedItems.has(`${categoryName}|||${materialName}|||${sku || ''}`);
  }

  async function handleMove() {
    if (!targetSheetId || selectedItems.size === 0) {
      toast.error('Please select a destination sheet');
      return;
    }

    setMoving(true);
    try {
      // Fetch all material items for this sheet
      const { data: dbItems, error: fetchError } = await supabase
        .from('material_items')
        .select('id, category, material_name, sku')
        .eq('sheet_id', sheet.sheetId);

      if (fetchError) throw fetchError;

      // Match selected items with database IDs
      const itemsToMove: string[] = [];
      selectedItems.forEach(itemKey => {
        const [categoryName, materialName, sku] = itemKey.split('|||');
        const dbItem = dbItems?.find(item => 
          item.category === categoryName &&
          item.material_name === materialName &&
          (item.sku || '') === sku
        );
        if (dbItem) {
          itemsToMove.push(dbItem.id);
        }
      });

      if (itemsToMove.length === 0) {
        toast.error('No matching items found');
        return;
      }

      // Update sheet_id for all selected items
      const { error: updateError } = await supabase
        .from('material_items')
        .update({ sheet_id: targetSheetId })
        .in('id', itemsToMove);

      if (updateError) throw updateError;

      toast.success(`Moved ${itemsToMove.length} item(s) successfully`);
      setShowMoveDialog(false);
      setTargetSheetId('');
      setSelectedItems(new Set());
      await onMoveComplete();
    } catch (error: any) {
      console.error('Error moving items:', error);
      toast.error('Failed to move items');
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      {/* Selection UI */}
      <div className="space-y-2">
        {sheet.categories?.map((category: any, idx: number) => {
          const categorySelected = isCategorySelected(category);
          
          return (
            <div key={idx} className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 p-2 flex items-center gap-2 border-b">
                <Checkbox
                  checked={categorySelected}
                  onCheckedChange={() => toggleCategorySelection(category)}
                />
                <span className="font-semibold text-sm">{category.name}</span>
                <span className="text-xs text-muted-foreground">({category.itemCount} items)</span>
              </div>
              <div className="p-2 space-y-1">
                {category.items?.map((item: any, itemIdx: number) => {
                  const selected = isItemSelected(category.name, item.material_name, item.sku);
                  
                  return (
                    <div
                      key={itemIdx}
                      className={`flex items-center gap-2 p-2 rounded text-xs ${
                        selected ? 'bg-blue-50 border border-blue-300' : 'border border-transparent'
                      }`}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleItem(category.name, item.material_name, item.sku)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{item.material_name}</p>
                        {item.sku && <p className="text-muted-foreground">SKU: {item.sku}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground">Qty: {item.quantity}</p>
                        <p className="font-semibold">${item.extended_price.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-4 right-4 bg-white border-2 border-blue-500 rounded-lg shadow-xl p-4">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-blue-900">
              {selectedItems.size} item(s) selected
            </span>
            <Button
              onClick={() => setShowMoveDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Move to Another Sheet
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedItems(new Set())}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedItems.size} Selected Item(s)</DialogTitle>
            <DialogDescription>
              Choose which sheet to move the selected material items to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Sheet</Label>
              <div className="p-2 bg-slate-100 rounded border mt-1">
                <p className="font-medium">{sheet.sheetName}</p>
              </div>
            </div>
            <div>
              <Label>Destination Sheet</Label>
              <Select value={targetSheetId} onValueChange={setTargetSheetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination..." />
                </SelectTrigger>
                <SelectContent>
                  {allSheets
                    .filter(s => s.id !== sheet.sheetId)
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sheet_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-xs text-blue-900">
                <strong>{selectedItems.size}</strong> item(s) will be moved. Their category assignments will be updated.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowMoveDialog(false);
                  setTargetSheetId('');
                }}
                disabled={moving}
              >
                Cancel
              </Button>
              <Button onClick={handleMove} disabled={moving || !targetSheetId}>
                {moving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Moving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Move Items
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
