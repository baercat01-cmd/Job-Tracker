import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, Truck, ListChecks, AlertCircle, Calendar as CalendarIcon, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface CalendarEvent {
  id: string;
  type: 'material_order' | 'material_delivery' | 'material_pull' | 'task_deadline' | 'task_completed';
  date: string;
  jobId: string;
  jobName: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  materialId?: string;
}

interface EventDetailsDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function EventDetailsDialog({ event, open, onClose, onUpdate }: EventDetailsDialogProps) {
  const [materialData, setMaterialData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedStatus, setEditedStatus] = useState('');
  const [editedOrderBy, setEditedOrderBy] = useState('');
  const [editedDelivery, setEditedDelivery] = useState('');
  const [editedPullBy, setEditedPullBy] = useState('');
  const [editedActualDelivery, setEditedActualDelivery] = useState('');

  useEffect(() => {
    if (event && open) {
      loadMaterialDetails();
    }
  }, [event, open]);

  async function loadMaterialDetails() {
    if (!event) return;

    // Extract material ID from event ID (format: "order-{id}", "delivery-{id}", etc.)
    const materialId = event.id.split('-')[1];
    if (!materialId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (error) throw error;

      setMaterialData(data);
      setEditedStatus(data.status || '');
      setEditedOrderBy(data.order_by_date || '');
      setEditedDelivery(data.delivery_date || '');
      setEditedPullBy(data.pull_by_date || '');
      setEditedActualDelivery(data.actual_delivery_date || '');
    } catch (error: any) {
      console.error('Error loading material details:', error);
      toast.error('Failed to load material details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!materialData) return;

    try {
      setSaving(true);

      const updates: any = {
        status: editedStatus,
        order_by_date: editedOrderBy || null,
        delivery_date: editedDelivery || null,
        pull_by_date: editedPullBy || null,
        actual_delivery_date: editedActualDelivery || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('materials')
        .update(updates)
        .eq('id', materialData.id);

      if (error) throw error;

      toast.success('Material updated successfully');
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material');
    } finally {
      setSaving(false);
    }
  }

  if (!event) return null;

  const EVENT_TYPE_CONFIG = {
    material_order: { icon: Package, label: 'Order Deadline', color: 'bg-yellow-500' },
    material_delivery: { icon: Truck, label: 'Delivery', color: 'bg-blue-500' },
    material_pull: { icon: Package, label: 'Pull from Shop', color: 'bg-purple-500' },
    task_completed: { icon: ListChecks, label: 'Task Completed', color: 'bg-green-500' },
    task_deadline: { icon: AlertCircle, label: 'Task Deadline', color: 'bg-red-500' },
  };

  const config = EVENT_TYPE_CONFIG[event.type];
  const Icon = config.icon;

  const isMaterialEvent = event.type.startsWith('material_');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color} text-white`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg">{event.title}</p>
              <p className="text-sm font-normal text-muted-foreground">{event.jobName}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="animate-pulse">Loading details...</div>
          </div>
        ) : isMaterialEvent && materialData ? (
          <div className="space-y-6">
            {/* Event Details */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Event Date:</span>
                <Badge variant="outline">
                  <CalendarIcon className="w-3 h-3 mr-1" />
                  {new Date(event.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Material:</span>
                <span className="font-semibold">{materialData.name}</span>
              </div>
              {materialData.quantity && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quantity:</span>
                  <span className="font-semibold">{materialData.quantity} {materialData.length || ''}</span>
                </div>
              )}
            </div>

            {/* Edit Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={editedStatus} onValueChange={setEditedStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_ordered">Not Ordered</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="at_shop">At Shop</SelectItem>
                  <SelectItem value="at_job">At Job</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Edit Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderBy">Order By Date</Label>
                <Input
                  id="orderBy"
                  type="date"
                  value={editedOrderBy}
                  onChange={(e) => setEditedOrderBy(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery">Expected Delivery</Label>
                <Input
                  id="delivery"
                  type="date"
                  value={editedDelivery}
                  onChange={(e) => setEditedDelivery(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pullBy">Pull By Date</Label>
                <Input
                  id="pullBy"
                  type="date"
                  value={editedPullBy}
                  onChange={(e) => setEditedPullBy(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="actualDelivery">Actual Delivery</Label>
                <Input
                  id="actualDelivery"
                  type="date"
                  value={editedActualDelivery}
                  onChange={(e) => setEditedActualDelivery(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            {materialData.notes && (
              <div className="space-y-2">
                <Label>Notes</Label>
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  {materialData.notes}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        ) : (
          /* Task Event (Read-only for now) */
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed Date:</span>
                <Badge variant="outline">
                  <CalendarIcon className="w-3 h-3 mr-1" />
                  {new Date(event.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Description:</span>
                <span className="font-semibold">{event.description}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
