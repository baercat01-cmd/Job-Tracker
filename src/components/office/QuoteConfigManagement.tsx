import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, GripVertical, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface QuoteConfigOption {
  id: string;
  category: string;
  value: string;
  order_index: number;
  active: boolean;
}

const CATEGORIES = [
  { value: 'pitch', label: 'Roof Pitch' },
  { value: 'foundation_type', label: 'Foundation Type' },
  { value: 'floor_type', label: 'Floor Type' },
  { value: 'soffit_type', label: 'Soffit Type' },
  { value: 'roof_material', label: 'Roof Material' },
  { value: 'roof_color', label: 'Roof Color' },
  { value: 'trim_color', label: 'Trim Color' },
  { value: 'insulation_type', label: 'Insulation Type' },
  { value: 'building_use', label: 'Building Use' },
  { value: 'truss_type', label: 'Truss Type' },
];

export function QuoteConfigManagement() {
  const { profile } = useAuth();
  const [options, setOptions] = useState<QuoteConfigOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('pitch');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [deletingOption, setDeletingOption] = useState<QuoteConfigOption | null>(null);

  useEffect(() => {
    loadOptions();
  }, []);

  async function loadOptions() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('quote_config_options')
        .select('*')
        .order('category', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      setOptions(data || []);
    } catch (error: any) {
      console.error('Error loading options:', error);
      toast.error('Failed to load configuration options');
    } finally {
      setLoading(false);
    }
  }

  async function addOption() {
    if (!newOptionValue.trim()) {
      toast.error('Please enter a value');
      return;
    }

    try {
      // Get max order_index for this category
      const categoryOptions = options.filter(o => o.category === selectedCategory);
      const maxOrder = Math.max(0, ...categoryOptions.map(o => o.order_index));

      const { error } = await supabase
        .from('quote_config_options')
        .insert({
          category: selectedCategory,
          value: newOptionValue.trim(),
          order_index: maxOrder + 1,
          created_by: profile?.id,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('This option already exists');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Option added successfully');
      setNewOptionValue('');
      setShowAddDialog(false);
      loadOptions();
    } catch (error: any) {
      console.error('Error adding option:', error);
      toast.error('Failed to add option');
    }
  }

  async function deleteOption() {
    if (!deletingOption) return;

    try {
      const { error } = await supabase
        .from('quote_config_options')
        .delete()
        .eq('id', deletingOption.id);

      if (error) throw error;

      toast.success('Option deleted');
      setDeletingOption(null);
      loadOptions();
    } catch (error: any) {
      console.error('Error deleting option:', error);
      toast.error('Failed to delete option');
    }
  }

  async function toggleActive(option: QuoteConfigOption) {
    try {
      const { error } = await supabase
        .from('quote_config_options')
        .update({ active: !option.active })
        .eq('id', option.id);

      if (error) throw error;

      toast.success(option.active ? 'Option disabled' : 'Option enabled');
      loadOptions();
    } catch (error: any) {
      console.error('Error toggling option:', error);
      toast.error('Failed to update option');
    }
  }

  async function updateOrder(optionId: string, newIndex: number) {
    try {
      const { error } = await supabase
        .from('quote_config_options')
        .update({ order_index: newIndex })
        .eq('id', optionId);

      if (error) throw error;
      loadOptions();
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  }

  const categoryOptions = options.filter(o => o.category === selectedCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Quote Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Manage dropdown options for the quote intake form
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Category Selector */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CATEGORIES.map((cat) => {
              const count = options.filter(o => o.category === cat.value && o.active).length;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedCategory === cat.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{cat.label}</span>
                    <Badge variant="secondary" className="ml-2">
                      {count}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Options List */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {CATEGORIES.find(c => c.value === selectedCategory)?.label} Options
              </CardTitle>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Option
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {categoryOptions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-2">No options configured</p>
                <p className="text-sm">Add your first option to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categoryOptions.map((option, index) => (
                  <div
                    key={option.id}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      !option.active ? 'opacity-50 bg-muted/50' : 'bg-background'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-6 p-0"
                          onClick={() => index > 0 && updateOrder(option.id, index - 1)}
                          disabled={index === 0}
                        >
                          ▲
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-6 p-0"
                          onClick={() => index < categoryOptions.length - 1 && updateOrder(option.id, index + 1)}
                          disabled={index === categoryOptions.length - 1}
                        >
                          ▼
                        </Button>
                      </div>
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{option.value}</span>
                      {!option.active && (
                        <Badge variant="outline" className="text-xs">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(option)}
                      >
                        {option.active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingOption(option)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Option Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {CATEGORIES.find(c => c.value === selectedCategory)?.label} Option
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Option Value</Label>
              <Input
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                placeholder="Enter option value"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOption();
                  }
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setShowAddDialog(false);
                setNewOptionValue('');
              }}>
                Cancel
              </Button>
              <Button onClick={addOption}>
                Add Option
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingOption} onOpenChange={() => setDeletingOption(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Option</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingOption?.value}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteOption}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
