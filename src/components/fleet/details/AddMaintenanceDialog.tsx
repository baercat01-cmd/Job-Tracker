import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AddMaintenanceDialogProps {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleType: string;
  onSuccess: () => void;
}

export function AddMaintenanceDialog({
  open,
  onClose,
  vehicleId,
  vehicleType,
  onSuccess,
}: AddMaintenanceDialogProps) {
  const { user } = useFleetAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: 'service',
    status: 'complete',
    title: '',
    date: new Date().toISOString().split('T')[0],
    mileage_hours: '',
    description: '',
    part_numbers: '',
    part_cost: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from('maintenance_logs').insert({
        vehicle_id: vehicleId,
        type: formData.type,
        status: formData.status,
        title: formData.title,
        date: formData.date,
        mileage_hours: formData.mileage_hours ? parseFloat(formData.mileage_hours) : null,
        description: formData.description || null,
        part_numbers: formData.part_numbers || null,
        part_cost: formData.part_cost ? parseFloat(formData.part_cost) : null,
        created_by: user?.username || 'unknown',
      });

      if (error) throw error;

      toast.success('Maintenance log added');
      onSuccess();
    } catch (error: any) {
      console.error('Error adding log:', error);
      toast.error('Failed to add log');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Maintenance Log</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="e.g., Oil Change, Brake Repair"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{vehicleType === 'heavy_equipment' ? 'Hours' : 'Mileage'}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                value={formData.mileage_hours}
                onChange={(e) => setFormData({ ...formData, mileage_hours: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Details about the work performed..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Part Numbers</Label>
              <Input
                placeholder="P123, P456"
                value={formData.part_numbers}
                onChange={(e) => setFormData({ ...formData, part_numbers: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Part Cost</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.part_cost}
                onChange={(e) => setFormData({ ...formData, part_cost: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-black"
            >
              {loading ? 'Adding...' : 'Add Log'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
