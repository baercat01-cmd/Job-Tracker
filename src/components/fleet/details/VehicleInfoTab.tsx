import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
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
import { Save, Upload, Image as ImageIcon } from 'lucide-react';

interface VehicleInfoTabProps {
  vehicle: any;
  onVehicleUpdated: () => void;
}

export function VehicleInfoTab({ vehicle, onVehicleUpdated }: VehicleInfoTabProps) {
  const { user } = useFleetAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_name: vehicle.vehicle_name || '',
    year: vehicle.year || '',
    make: vehicle.make || '',
    model: vehicle.model || '',
    vin: vehicle.vin || '',
    serial_number: vehicle.serial_number || '',
    license_plate: vehicle.license_plate || '',
    current_mileage: vehicle.current_mileage || '',
    engine_hours: vehicle.engine_hours || '',
    purchase_date: vehicle.purchase_date || '',
    purchase_price: vehicle.purchase_price || '',
    vendor_name: vehicle.vendor_name || '',
  });

  async function handleSave() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({
          vehicle_name: formData.vehicle_name,
          year: formData.year ? parseInt(formData.year) : null,
          make: formData.make || null,
          model: formData.model || null,
          vin: formData.vin || null,
          serial_number: formData.serial_number || null,
          license_plate: formData.license_plate || null,
          current_mileage: formData.current_mileage ? parseFloat(formData.current_mileage) : null,
          engine_hours: formData.engine_hours ? parseFloat(formData.engine_hours) : null,
          purchase_date: formData.purchase_date || null,
          purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
          vendor_name: formData.vendor_name || null,
        })
        .eq('id', vehicle.id);

      if (error) throw error;

      toast.success('Vehicle updated successfully');
      setEditing(false);
      onVehicleUpdated();
    } catch (error: any) {
      console.error('Error updating vehicle:', error);
      toast.error('Failed to update vehicle');
    } finally {
      setLoading(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${vehicle.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('vehicle-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-images')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ image_url: publicUrl })
        .eq('id', vehicle.id);

      if (updateError) throw updateError;

      toast.success('Image uploaded successfully');
      onVehicleUpdated();
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Vehicle Image */}
      <div className="space-y-2">
        <Label>Vehicle Image</Label>
        {vehicle.image_url ? (
          <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-100 border-2">
            <img src={vehicle.image_url} alt={vehicle.vehicle_name} className="w-full h-full object-cover" />
            <label className="absolute bottom-2 right-2 cursor-pointer">
              <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-black" asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  Change
                </span>
              </Button>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
        ) : (
          <label className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-yellow-600 transition-colors">
            <ImageIcon className="w-12 h-12 text-slate-400 mb-2" />
            <p className="text-sm text-slate-600 font-medium">Click to upload image</p>
            <p className="text-xs text-slate-500">PNG, JPG up to 5MB</p>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vehicle Name *</Label>
            <Input
              value={formData.vehicle_name}
              onChange={(e) => setFormData({ ...formData, vehicle_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Year</Label>
              <Input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Make</Label>
              <Input
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>VIN</Label>
            <Input
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Serial Number</Label>
              <Input
                value={formData.serial_number}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>License Plate</Label>
              <Input
                value={formData.license_plate}
                onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{vehicle.type === 'heavy_equipment' ? 'Engine Hours' : 'Current Mileage'}</Label>
              <Input
                type="number"
                step="0.01"
                value={vehicle.type === 'heavy_equipment' ? formData.engine_hours : formData.current_mileage}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    [vehicle.type === 'heavy_equipment' ? 'engine_hours' : 'current_mileage']: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Purchase Date</Label>
              <Input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Purchase Price</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.purchase_price}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={formData.vendor_name}
                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-black"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Year</p>
              <p className="font-medium">{vehicle.year || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Make</p>
              <p className="font-medium">{vehicle.make || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Model</p>
              <p className="font-medium">{vehicle.model || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Status</p>
              <p className="font-medium">{vehicle.status}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">VIN</p>
              <p className="font-medium font-mono text-xs">{vehicle.vin || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Serial Number</p>
              <p className="font-medium font-mono text-xs">{vehicle.serial_number || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">License Plate</p>
              <p className="font-medium">{vehicle.license_plate || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">
                {vehicle.type === 'heavy_equipment' ? 'Engine Hours' : 'Current Mileage'}
              </p>
              <p className="font-medium">
                {(vehicle.type === 'heavy_equipment' ? vehicle.engine_hours : vehicle.current_mileage)?.toLocaleString() || '0'}
                {vehicle.type === 'heavy_equipment' ? ' hrs' : ' mi'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Purchase Date</p>
              <p className="font-medium">{vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString() : 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Purchase Price</p>
              <p className="font-medium">{vehicle.purchase_price ? `$${parseFloat(vehicle.purchase_price).toLocaleString()}` : 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Vendor</p>
              <p className="font-medium">{vehicle.vendor_name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Type</p>
              <p className="font-medium capitalize">{vehicle.type.replace('_', ' ')}</p>
            </div>
          </div>

          <Button
            onClick={() => setEditing(true)}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-black"
          >
            Edit Information
          </Button>
        </div>
      )}
    </div>
  );
}
