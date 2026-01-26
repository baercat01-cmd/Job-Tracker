import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Wrench, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface ChecklistItem {
  id: string;
  name: string;
  part_info: string | null;
  category: string | null;
}

export function ChecklistManagementTab() {
  const { profile } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState({ name: '', part_info: '', category: '' });

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from('service_checklist_items')
        .select('*')
        .order('name');

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
      toast.error('Failed to load checklist items');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();

    if (!newItem.name.trim()) {
      toast.error('Item name is required');
      return;
    }

    try {
      const { error } = await supabase.from('service_checklist_items').insert({
        name: newItem.name,
        part_info: newItem.part_info || null,
        category: newItem.category || null,
        created_by: profile?.username || 'unknown',
      });

      if (error) throw error;

      toast.success('Item added');
      setNewItem({ name: '', part_info: '', category: '' });
      loadItems();
    } catch (error: any) {
      console.error('Error adding item:', error);
      toast.error('Failed to add item');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('service_checklist_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Item deleted');
      loadItems();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-600">Loading checklist items...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleAdd} className="space-y-3">
            <h3 className="font-bold">Add Checklist Item</h3>
            <Input
              placeholder="Item Name *"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              required
            />
            <Input
              placeholder="Part Info (optional)"
              value={newItem.part_info}
              onChange={(e) => setNewItem({ ...newItem, part_info: e.target.value })}
            />
            <Input
              placeholder="Category (optional)"
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
            />
            <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 text-black">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium">{item.name}</h4>
                  {item.part_info && (
                    <p className="text-sm text-slate-600">{item.part_info}</p>
                  )}
                  {item.category && (
                    <p className="text-xs text-slate-500">{item.category}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(item.id, item.name)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
