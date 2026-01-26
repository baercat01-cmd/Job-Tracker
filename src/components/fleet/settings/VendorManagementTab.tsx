import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Vendor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contact_person: string | null;
}

export function VendorManagementTab() {
  const { profile } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    contact_person: '',
  });

  useEffect(() => {
    loadVendors();
  }, []);

  async function loadVendors() {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name');

      if (error) throw error;
      setVendors(data || []);
    } catch (error) {
      console.error('Error loading vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    try {
      const { error } = await supabase.from('vendors').insert({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        contact_person: formData.contact_person || null,
        created_by: profile?.username || 'unknown',
      });

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('Vendor name already exists');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Vendor added');
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        contact_person: '',
      });
      setShowForm(false);
      loadVendors();
    } catch (error: any) {
      console.error('Error adding vendor:', error);
      toast.error('Failed to add vendor');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete vendor "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Vendor deleted');
      loadVendors();
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-600">Loading vendors...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Vendors ({vendors.length})</h3>
        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className="bg-yellow-600 hover:bg-yellow-700 text-black"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancel' : 'Add Vendor'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                placeholder="Vendor Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <Input
                placeholder="Contact Person"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              />
              <Input
                placeholder="Address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="City"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
                <Input
                  placeholder="State"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  maxLength={2}
                />
              </div>
              <Button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 text-black">
                Add Vendor
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {vendors.map((vendor) => (
          <Card key={vendor.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <h4 className="font-bold truncate">{vendor.name}</h4>
                  </div>
                  {vendor.contact_person && (
                    <p className="text-sm text-slate-600">{vendor.contact_person}</p>
                  )}
                  {vendor.phone && (
                    <p className="text-sm text-slate-600">{vendor.phone}</p>
                  )}
                  {vendor.email && (
                    <p className="text-xs text-slate-500">{vendor.email}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(vendor.id, vendor.name)}
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
