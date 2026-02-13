// This file contains the drag-and-drop implementation for reordering rows
// Key features:
// - Drag by clicking and holding on any part of the row header
// - Visual feedback during drag (opacity, cursor)
// - Automatic reordering in database (material_sheets, custom_financial_rows, subcontractor_estimates)
// - No extra buttons - just grab and drag

import { useState } from 'react';

interface DragItem {
  type: 'material' | 'custom' | 'subcontractor';
  id: string;
  orderIndex: number;
}

// Drag-and-drop state management
const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
const [dropTargetItem, setDropTargetItem] = useState<DragItem | null>(null);

// Drag event handlers
function handleDragStart(e: React.DragEvent, item: DragItem) {
  setDraggedItem(item);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  
  // Add opacity to dragged element
  (e.target as HTMLElement).style.opacity = '0.4';
}

function handleDragEnd(e: React.DragEvent) {
  (e.target as HTMLElement).style.opacity = '1';
  setDraggedItem(null);
  setDropTargetItem(null);
}

function handleDragOver(e: React.DragEvent, item: DragItem) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  if (draggedItem && draggedItem.id !== item.id) {
    setDropTargetItem(item);
  }
  
  return false;
}

async function handleDrop(e: React.DragEvent, targetItem: DragItem) {
  e.stopPropagation();
  e.preventDefault();
  
  if (!draggedItem || draggedItem.id === targetItem.id) {
    return;
  }
  
  try {
    // Reorder logic: swap order_index values
    const draggedIndex = draggedItem.orderIndex;
    const targetIndex = targetItem.orderIndex;
    
    // Update dragged item's order_index
    if (draggedItem.type === 'material') {
      await supabase
        .from('material_sheets')
        .update({ order_index: targetIndex })
        .eq('id', draggedItem.id);
    } else if (draggedItem.type === 'custom') {
      await supabase
        .from('custom_financial_rows')
        .update({ order_index: targetIndex })
        .eq('id', draggedItem.id);
    } else if (draggedItem.type === 'subcontractor') {
      await supabase
        .from('subcontractor_estimates')
        .update({ order_index: targetIndex })
        .eq('id', draggedItem.id);
    }
    
    // Update target item's order_index
    if (targetItem.type === 'material') {
      await supabase
        .from('material_sheets')
        .update({ order_index: draggedIndex })
        .eq('id', targetItem.id);
    } else if (targetItem.type === 'custom') {
      await supabase
        .from('custom_financial_rows')
        .update({ order_index: draggedIndex })
        .eq('id', targetItem.id);
    } else if (targetItem.type === 'subcontractor') {
      await supabase
        .from('subcontractor_estimates')
        .update({ order_index: draggedIndex })
        .eq('id', targetItem.id);
    }
    
    toast.success('Order updated');
    
    // Reload data
    await loadData(true);
  } catch (error: any) {
    console.error('Error reordering items:', error);
    toast.error('Failed to reorder');
  }
  
  setDraggedItem(null);
  setDropTargetItem(null);
}

// In the render section, add these attributes to each row wrapper:
// draggable={true}
// onDragStart={(e) => handleDragStart(e, { type: item.type, id: item.id, orderIndex: item.orderIndex })}
// onDragEnd={handleDragEnd}
// onDragOver={(e) => handleDragOver(e, { type: item.type, id: item.id, orderIndex: item.orderIndex })}
// onDrop={(e) => handleDrop(e, { type: item.type, id: item.id, orderIndex: item.orderIndex })}
// className={`transition-all ${draggedItem?.id === item.id ? 'opacity-50' : ''} ${dropTargetItem?.id === item.id ? 'ring-2 ring-blue-500' : ''}`}
// style={{ cursor: 'grab' }}
