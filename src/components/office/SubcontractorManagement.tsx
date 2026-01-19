import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Phone, Mail, Building2, Calendar, User, X } from 'lucide-react';
import { toast } from 'sonner';

interface Subcontractor {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  trades: string[];
  notes: string | null;
  active: boolean;
  created_at: string;
}

interface SubcontractorFormData {
  name: string;
  company_name: string;
  phone: string;
  email: string;
  trades: string[];
  notes: string;
  active: boolean;
}

const COMMON_TRADES = [
  'Electrical',
  'Plumbing',
  'HVAC',
  'Concrete',
  'Excavation',
  'Roofing',
  'Siding',
  'Insulation',
  'Drywall',
  'Painting',
  'Flooring',
  'Framing',
  'Other',
];

// Phone number formatting utility
function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const numbers = value.replace(/\D/g, '');
  
  // Format based on length
  if (numbers.length <= 3) {
    return numbers;
  } else if (numbers.length <= 6) {
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
  } else {
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  }
}

export function SubcontractorManagement() {
  const { profile } = useAuth();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<Subcontractor | null>(null);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [newTrade, setNewTrade] = useState('');
  const [formData, setFormData] = useState<SubcontractorFormData>({
    name: '',
    company_name: '',
    phone: '',
    email: '',
    trades: [],
    notes: '',
    active: true,
  });

  useEffect(() => {
    loadSubcontractors();
  }, []);

  async function loadSubcontractors() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subcontractors')
        .select('*')
        .order('name');

      if (error) throw error;
      setSubcontractors(data || []);
    } catch (error: any) {
      console.error('Error loading subcontractors:', error);
      toast.error('Failed to load subcontractors');
    } finally {
      setLoading(false);
    }
  }

  function handleAddTrade() {
    const trade = newTrade.trim();
    if (!trade) {
      toast.error('Please enter a trade name');
      return;
    }
    
    if (formData.trades.includes(trade)) {
      toast.error('This trade is already added');
      return;
    }
    
    setFormData({
      ...formData,
      trades: [...formData.trades, trade]
    });
    setNewTrade('');
  }

  function handleRemoveTrade(tradeToRemove: string) {
    setFormData({
      ...formData,
      trades: formData.trades.filter(t => t !== tradeToRemove)
    });
  }

  function handlePhoneChange(value: string) {
    const formatted = formatPhoneNumber(value);
    setFormData({ ...formData, phone: formatted });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      // Remove formatting from phone number before saving (store digits only)
      const phoneDigits = formData.phone.replace(/\D/g, '');
      
      if (editingId) {
        const { error } = await supabase
          .from('subcontractors')
          .update({
            name: formData.name.trim(),
            company_name: formData.company_name.trim() || null,
            phone: phoneDigits || null,
            email: formData.email.trim() || null,
            trades: formData.trades.length > 0 ? formData.trades : [],
            notes: formData.notes.trim() || null,
            active: formData.active,
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Subcontractor updated successfully');
      } else {
        const { error } = await supabase
          .from('subcontractors')
          .insert({
            name: formData.name.trim(),
            company_name: formData.company_name.trim() || null,
            phone: phoneDigits || null,
            email: formData.email.trim() || null,
            trades: formData.trades.length > 0 ? formData.trades : [],
            notes: formData.notes.trim() || null,
            active: formData.active,
            created_by: profile?.id,
          });

        if (error) throw error;
        toast.success('Subcontractor added successfully');
      }

      setShowDialog(false);
      resetForm();
      loadSubcontractors();
    } catch (error: any) {
      console.error('Error saving subcontractor:', error);
      toast.error('Failed to save subcontractor');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this subcontractor? This will also delete all their scheduled work.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('subcontractors')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Subcontractor deleted successfully');
      loadSubcontractors();
    } catch (error: any) {
      console.error('Error deleting subcontractor:', error);
      toast.error('Failed to delete subcontractor');
    }
  }

  function openEditDialog(subcontractor: Subcontractor) {
    setEditingId(subcontractor.id);
    // Format phone number when editing
    const formattedPhone = subcontractor.phone ? formatPhoneNumber(subcontractor.phone) : '';
    setFormData({
      name: subcontractor.name,
      company_name: subcontractor.company_name || '',
      phone: formattedPhone,
      email: subcontractor.email || '',
      trades: subcontractor.trades || [],
      notes: subcontractor.notes || '',
      active: subcontractor.active,
    });
    setShowDialog(true);
  }

  function resetForm() {
    setEditingId(null);
    setNewTrade('');
    setFormData({
      name: '',
      company_name: '',
      phone: '',
      email: '',
      trades: [],
      notes: '',
      active: true,
    });
  }

  const filteredSubcontractors = subcontractors.filter(sub => {
    // Filter by active status
    if (filterActive === 'active' && !sub.active) return false;
    if (filterActive === 'inactive' && sub.active) return false;

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        sub.name.toLowerCase().includes(search) ||
        sub.company_name?.toLowerCase().includes(search) ||
        sub.trades?.some(t => t.toLowerCase().includes(search)) ||
        sub.phone?.includes(search) ||
        sub.email?.toLowerCase().includes(search)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Subcontractor Management</h2>
          <p className="text-yellow-400">Manage subcontractors and schedule their work</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400">
          <Plus className="w-4 h-4 mr-2" />
          Add Subcontractor
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search by name, company, trades, phone, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterActive} onValueChange={(value: any) => setFilterActive(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Subcontractors List */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading subcontractors...
          </CardContent>
        </Card>
      ) : filteredSubcontractors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No subcontractors found</p>
            <Button onClick={() => setShowDialog(true)} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Subcontractor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSubcontractors.map((sub) => (
            <Card key={sub.id} className={!sub.active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{sub.name}</CardTitle>
                    {sub.company_name && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Building2 className="w-3 h-3" />
                        {sub.company_name}
                      </p>
                    )}
                  </div>
                  <Badge variant={sub.active ? 'default' : 'secondary'}>
                    {sub.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sub.trades && sub.trades.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Trades</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {sub.trades.map((trade, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {trade}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {sub.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <a href={`tel:${sub.phone}`} className="hover:underline">
                        {formatPhoneNumber(sub.phone)}
                      </a>
                    </div>
                  )}

                  {sub.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <a href={`mailto:${sub.email}`} className="hover:underline truncate">
                        {sub.email}
                      </a>
                    </div>
                  )}

                  {sub.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{sub.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-800 hover:to-green-900 text-white border-2 border-green-600 font-semibold"
                      onClick={() => {
                        setSelectedSubcontractor(sub);
                        setShowScheduleDialog(true);
                      }}
                    >
                      <Calendar className="w-4 h-4 mr-1" />
                      Schedule
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(sub)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(sub.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Subcontractor' : 'Add New Subcontractor'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="ABC Contracting"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="(555) 123-4567"
                  maxLength={14}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="trades">Trades/Specialties</Label>
                
                {/* Selected Trades Display */}
                <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[42px] bg-background">
                  {formData.trades.map((trade, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors gap-1" 
                      onClick={() => handleRemoveTrade(trade)}
                    >
                      {trade}
                      <X className="w-3 h-3" />
                    </Badge>
                  ))}
                  {formData.trades.length === 0 && (
                    <span className="text-sm text-muted-foreground">Add trades using the input below</span>
                  )}
                </div>

                {/* Manual Trade Input */}
                <div className="flex gap-2">
                  <Input
                    id="new-trade"
                    placeholder="Type trade name (e.g., Electrical, Plumbing)"
                    value={newTrade}
                    onChange={(e) => setNewTrade(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTrade();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTrade}
                    disabled={!newTrade.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Quick Add Common Trades */}
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Quick add:</span>
                  {COMMON_TRADES.filter(t => !formData.trades.includes(t)).slice(0, 6).map((trade) => (
                    <Button
                      key={trade}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          trades: [...formData.trades, trade]
                        });
                      }}
                    >
                      + {trade}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="active">Status</Label>
                <Select
                  value={formData.active ? 'active' : 'inactive'}
                  onValueChange={(value) => setFormData({ ...formData, active: value === 'active' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or special instructions..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingId ? 'Update' : 'Add'} Subcontractor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog - Will be implemented in SubcontractorScheduling component */}
      {showScheduleDialog && selectedSubcontractor && (
        <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule {selectedSubcontractor.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will be integrated with the scheduling component
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
