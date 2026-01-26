import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface AddVehicleDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  defaultType: string;
  onSuccess: () => void;
}

export function AddVehicleDialog({
  open,
  onClose,
  companyId,
  defaultType,
  onSuccess,
}: AddVehicleDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_name: '',
    year: '',
    make: '',
    model: '',
    type: defaultType,
    serial_number: '',
    vin: '',
    license_plate: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.vehicle_name.trim()) {
      toast.error('Vehicle name is required');
      return;
    }

    setLoading(true);

    try {
      // Get the username to use for created_by
      const createdBy = profile?.username || profile?.email || 'unknown';
      console.log('Creating vehicle with created_by:', createdBy, 'Profile:', profile);

      const vehicleData = {
        company_id: companyId,
        vehicle_name: formData.vehicle_name,
        year: formData.year ? parseInt(formData.year) : null,
        make: formData.make || null,
        model: formData.model || null,
        type: formData.type,
        serial_number: formData.serial_number || null,
        vin: formData.vin || null,
        license_plate: formData.license_plate || null,
        status: 'Active',
        archived: false,
        created_by: createdBy,
      };

      console.log('Inserting vehicle data:', vehicleData);

      const { data, error } = await supabase.from('vehicles').insert(vehicleData).select();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Vehicle created successfully:', data);
      toast.success(`Vehicle added by ${createdBy}`);
      onSuccess();
    } catch (error: any) {
      console.error('Error adding vehicle:', error);
      toast.error(error.message || 'Failed to add vehicle');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicle_name">
              Vehicle Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="vehicle_name"
              placeholder="e.g., Truck #1, Bobcat 450"
              value={formData.vehicle_name}
              onChange={(e) => setFormData({ ...formData, vehicle_name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="truck">Truck</SelectItem>
                <SelectItem value="heavy_equipment">Heavy Equipment</SelectItem>
                <SelectItem value="small_engine">Small Engine</SelectItem>
                <SelectItem value="trailer">Trailer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                placeholder="2024"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                min="1900"
                max={new Date().getFullYear() + 1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                placeholder="Ford"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="F-150"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vin">VIN</Label>
            <Input
              id="vin"
              placeholder="Vehicle Identification Number"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial_number">Serial Number</Label>
            <Input
              id="serial_number"
              placeholder="Equipment Serial Number"
              value={formData.serial_number}
              onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="license_plate">License Plate</Label>
            <Input
              id="license_plate"
              placeholder="ABC-1234"
              value={formData.license_plate}
              onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
            />
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
              {loading ? 'Adding...' : 'Add Vehicle'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
