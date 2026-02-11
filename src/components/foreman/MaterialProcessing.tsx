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
import { Calendar, User, Clock, AlertTriangle, Package, CheckCircle, Palette } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface MaterialItem {
  id: string;
  sheet_id?: string;
  category: string;
  material_name: string;
  quantity: number;
  status: 'not_ordered' | 'needed' | 'ordered' | 'at_shop' | 'ready_to_pull' | 'at_job' | 'installed' | 'missing';
  color: string | null;
  date_needed_by: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requested_by: string | null;
  order_requested_at: string | null;
  created_at: string;
  updated_at: string;
  source?: 'workbook' | 'legacy';
  sheets?: {
    sheet_name: string;
  };
  user_profiles?: {
    username: string;
  };
  categories?: {
    name: string;
  };
}

interface MaterialProcessingProps {
  job: Job;
  userId: string;
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300', icon: '○' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '◐' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: '◉' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-300', icon: '⬤' },
};

const STATUS_CONFIG = {
  needed: { label: 'Needed', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: Package },
  not_ordered: { label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Package },
  ordered: { label: 'Ordered', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Clock },
  at_shop: { label: 'At Shop', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Package },
  ready_to_pull: { label: 'Pull from Shop', color: 'bg-purple-100 text-purple-800 border-purple-300', icon: Package },
  at_job: { label: 'At Job', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
  installed: { label: 'Installed', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: CheckCircle },
  missing: { label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300', icon: AlertTriangle },
};

export function MaterialProcessing({ job, userId }: MaterialProcessingProps) {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  // Edit form state
  const [editColor, setEditColor] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [editDateNeededBy, setEditDateNeededBy] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMaterials();

    // Subscribe to real-time changes for both tables
    const itemsChannel = supabase
      .channel('material_processing_items')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_items' },
        () => {
          loadMaterials();
        }
      )
      .subscribe();

    const legacyChannel = supabase
      .channel('material_processing_legacy')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `job_id=eq.${job.id}` },
        () => {
          loadMaterials();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(legacyChannel);
    };
  }, [job.id]);

  async function loadMaterials() {
    try {
      setLoading(true);

      const allMaterials: MaterialItem[] = [];

      // Load from new workbook system (material_items)
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .maybeSingle();

      if (workbookData) {
        const { data: sheetsData } = await supabase
          .from('material_sheets')
          .select('id')
          .eq('workbook_id', workbookData.id);

        if (sheetsData && sheetsData.length > 0) {
          const sheetIds = sheetsData.map(s => s.id);

          const { data: itemsData } = await supabase
            .from('material_items')
            .select(`
              *,
              sheets:material_sheets(sheet_name),
              user_profiles:requested_by(username)
            `)
            .in('sheet_id', sheetIds);

          if (itemsData) {
            allMaterials.push(...(itemsData as any).map((item: any) => ({
              ...item,
              material_name: item.material_name || item.name,
              source: 'workbook' as const,
            })));
          }
        }
      }

      // Load from deprecated materials table (crew-ordered materials)
      const { data: legacyData } = await supabase
        .from('materials')
        .select(`
          *,
          categories:materials_categories(name),
          user_profiles:ordered_by(username)
        `)
        .eq('job_id', job.id);

      if (legacyData) {
        allMaterials.push(...legacyData.map((mat: any) => ({
          id: mat.id,
          category: mat.categories?.name || 'Materials',
          material_name: mat.name,
          quantity: mat.quantity,
          status: mat.status,
          color: mat.color,
          date_needed_by: mat.date_needed_by,
          priority: mat.priority || 'medium',
          requested_by: mat.ordered_by,
          order_requested_at: mat.order_requested_at,
          created_at: mat.created_at,
          updated_at: mat.updated_at,
          source: 'legacy' as const,
          user_profiles: mat.user_profiles ? { username: mat.user_profiles.username } : undefined,
        })));
      }

      // Sort by most recent first
      allMaterials.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setMaterials(allMaterials);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function openEditDialog(material: MaterialItem) {
    setSelectedMaterial(material);
    setEditColor(material.color || '');
    setEditPriority(material.priority || 'medium');
    setEditDateNeededBy(material.date_needed_by || '');
    setShowEditDialog(true);
  }

  async function saveMaterialDetails() {
    if (!selectedMaterial) return;

    setSaving(true);

    try {
      const updateData: any = {
        color: editColor || null,
        priority: editPriority,
        date_needed_by: editDateNeededBy || null,
        updated_at: new Date().toISOString(),
      };

      // If changing to ordered, set request tracking
      if (!selectedMaterial.requested_by) {
        if (selectedMaterial.source === 'legacy') {
          updateData.ordered_by = userId;
        } else {
          updateData.requested_by = userId;
        }
        updateData.order_requested_at = new Date().toISOString();
      }

      const table = selectedMaterial.source === 'legacy' ? 'materials' : 'material_items';
      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      toast.success('Material details updated');
      setShowEditDialog(false);
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material');
    } finally {
      setSaving(false);
    }
  }

  // Group materials by status
  const groupedMaterials = {
    needed: materials.filter(m => m.status === 'needed'),
    not_ordered: materials.filter(m => m.status === 'not_ordered'),
    ordered: materials.filter(m => m.status === 'ordered'),
    at_shop: materials.filter(m => m.status === 'at_shop'),
    ready_to_pull: materials.filter(m => m.status === 'ready_to_pull'),
    at_job: materials.filter(m => m.status === 'at_job'),
    installed: materials.filter(m => m.status === 'installed'),
    missing: materials.filter(m => m.status === 'missing'),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No materials to process for this job</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Sections */}
      {(Object.entries(groupedMaterials) as [keyof typeof groupedMaterials, MaterialItem[]][]).map(([status, items]) => {
        if (items.length === 0) return null;

        const config = STATUS_CONFIG[status];
        const StatusIcon = config.icon;

        return (
          <Card key={status} className={`border-2 ${config.color}`}>
            <CardHeader className={`${config.color}`}>
              <CardTitle className="flex items-center gap-2">
                <StatusIcon className="w-5 h-5" />
                {config.label}
                <Badge variant="secondary" className="ml-2">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {items.map(material => (
                <div
                  key={material.id}
                  className="border-2 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
                  onClick={() => openEditDialog(material)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-base">{material.material_name}</h4>
                      <p className="text-sm text-muted-foreground">{material.category}</p>
                      {material.sheets && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Sheet: {material.sheets.sheet_name}
                        </p>
                      )}
                      {material.source === 'legacy' && (
                        <Badge variant="outline" className="mt-1 text-xs">Field Request</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{material.quantity} qty</Badge>
                      {material.color && (
                        <div className="flex items-center gap-1">
                          <Palette className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-medium">{material.color}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Priority */}
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                      <Badge className={PRIORITY_CONFIG[material.priority].color}>
                        {PRIORITY_CONFIG[material.priority].icon} {PRIORITY_CONFIG[material.priority].label}
                      </Badge>
                    </div>

                    {/* Date Needed By */}
                    {material.date_needed_by && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(material.date_needed_by).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Requested By */}
                    {material.user_profiles && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{material.user_profiles.username}</span>
                      </div>
                    )}

                    {/* Order Requested At */}
                    {material.order_requested_at && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(material.order_requested_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Material Details</DialogTitle>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">{selectedMaterial.material_name}</h4>
                <p className="text-sm text-muted-foreground">{selectedMaterial.category}</p>
              </div>

              <div>
                <Label>Color</Label>
                <Input
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  placeholder="e.g., Blue, Red, Custom Color..."
                />
              </div>

              <div>
                <Label>Priority</Label>
                <Select
                  value={editPriority}
                  onValueChange={(value) => setEditPriority(value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <span className="flex items-center gap-2">
                        {PRIORITY_CONFIG.low.icon} Low
                      </span>
                    </SelectItem>
                    <SelectItem value="medium">
                      <span className="flex items-center gap-2">
                        {PRIORITY_CONFIG.medium.icon} Medium
                      </span>
                    </SelectItem>
                    <SelectItem value="high">
                      <span className="flex items-center gap-2">
                        {PRIORITY_CONFIG.high.icon} High
                      </span>
                    </SelectItem>
                    <SelectItem value="urgent">
                      <span className="flex items-center gap-2">
                        {PRIORITY_CONFIG.urgent.icon} Urgent
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date Needed By</Label>
                <Input
                  type="date"
                  value={editDateNeededBy}
                  onChange={(e) => setEditDateNeededBy(e.target.value)}
                />
              </div>

              {/* Info Display */}
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Requested By:</span>
                  <span className="font-medium">
                    {selectedMaterial.user_profiles?.username || 'Not set'}
                  </span>
                </div>
                {selectedMaterial.order_requested_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Requested At:</span>
                    <span className="font-medium">
                      {new Date(selectedMaterial.order_requested_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={saveMaterialDetails}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? 'Saving...' : 'Save Details'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
