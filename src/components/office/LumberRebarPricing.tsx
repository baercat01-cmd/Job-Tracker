import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Plus,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building2,
  Package,
  LineChart,
  Calendar,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
  active: boolean;
  order_index: number;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
}

interface PriceEntry {
  id: string;
  material_id: string;
  vendor_id: string;
  price_per_unit: number;
  truckload_quantity: number | null;
  effective_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  vendor?: Vendor;
  material?: Material;
}

interface LumberRebarPricingProps {
  category: 'lumber' | 'rebar';
}

export function LumberRebarPricing({ category }: LumberRebarPricingProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  
  // Dialogs
  const [showAddPriceDialog, setShowAddPriceDialog] = useState(false);
  const [showPriceHistoryDialog, setShowPriceHistoryDialog] = useState(false);
  const [showAddVendorDialog, setShowAddVendorDialog] = useState(false);
  const [showAddMaterialDialog, setShowAddMaterialDialog] = useState(false);
  
  // Selected items
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  
  // Form states
  const [vendorId, setVendorId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [truckloadQty, setTruckloadQty] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [priceNotes, setPriceNotes] = useState('');
  
  // Vendor form
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  
  // Material form
  const [materialName, setMaterialName] = useState('');
  const [materialUnit, setMaterialUnit] = useState('board foot');
  const [standardLength, setStandardLength] = useState('16');

  useEffect(() => {
    loadData();
    
    // Subscribe to table changes for auto-reload
    const materialsChannel = supabase
      .channel('lumber_rebar_materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_materials' },
        () => loadMaterials()
      )
      .subscribe();
    
    const vendorsChannel = supabase
      .channel('lumber_rebar_vendors_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_vendors' },
        () => loadVendors()
      )
      .subscribe();
    
    const pricesChannel = supabase
      .channel('lumber_rebar_prices_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_prices' },
        () => loadPrices()
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(materialsChannel);
      supabase.removeChannel(vendorsChannel);
      supabase.removeChannel(pricesChannel);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadMaterials(),
        loadVendors(),
        loadPrices(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials() {
    const { data, error } = await supabase
      .from('lumber_rebar_materials')
      .select('*')
      .eq('active', true)
      .order('order_index');

    if (error) throw error;
    setMaterials(data || []);
  }

  async function loadVendors() {
    const { data, error } = await supabase
      .from('lumber_rebar_vendors')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    setVendors(data || []);
  }

  async function loadPrices() {
    const { data, error } = await supabase
      .from('lumber_rebar_prices')
      .select(`
        *,
        vendor:lumber_rebar_vendors(*),
        material:lumber_rebar_materials(*)
      `)
      .order('effective_date', { ascending: false });

    if (error) throw error;
    setPrices(data || []);
  }

  function openAddPriceDialog(material?: Material) {
    if (material) {
      setMaterialId(material.id);
      setSelectedMaterial(material);
    }
    setShowAddPriceDialog(true);
  }

  function openPriceHistory(material: Material) {
    setSelectedMaterial(material);
    setShowPriceHistoryDialog(true);
  }

  async function savePrice() {
    if (!materialId || !vendorId || !pricePerUnit) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_prices')
        .insert([{
          material_id: materialId,
          vendor_id: vendorId,
          price_per_unit: parseFloat(pricePerUnit),
          truckload_quantity: truckloadQty ? parseInt(truckloadQty) : null,
          effective_date: effectiveDate,
          notes: priceNotes || null,
          created_by: profile?.id || null,
        }]);

      if (error) throw error;

      toast.success('Price added successfully');
      setShowAddPriceDialog(false);
      resetPriceForm();
      await loadPrices();
    } catch (error: any) {
      console.error('Error saving price:', error);
      toast.error('Failed to save price');
    }
  }

  async function saveVendor() {
    if (!vendorName) {
      toast.error('Vendor name is required');
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_vendors')
        .insert([{
          name: vendorName,
          contact_name: vendorContact || null,
          phone: vendorPhone || null,
          email: vendorEmail || null,
        }]);

      if (error) throw error;

      toast.success('Vendor added successfully');
      setShowAddVendorDialog(false);
      resetVendorForm();
      await loadVendors();
    } catch (error: any) {
      console.error('Error saving vendor:', error);
      toast.error('Failed to save vendor');
    }
  }

  async function saveMaterial() {
    if (!materialName) {
      toast.error('Material name is required');
      return;
    }

    try {
      console.log('Saving material:', {
        name: materialName,
        category: category,
        unit: materialUnit,
        standard_length: standardLength,
      });

      const maxOrder = materials
        .filter(m => m.category === category)
        .reduce((max, m) => Math.max(max, m.order_index), 0);

      const { data, error } = await supabase
        .from('lumber_rebar_materials')
        .insert([{
          name: materialName,
          category: category,
          unit: materialUnit,
          standard_length: parseFloat(standardLength),
          order_index: maxOrder + 1,
        }])
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Material saved successfully:', data);
      toast.success('Material added successfully');
      setShowAddMaterialDialog(false);
      resetMaterialForm();
      // Data will auto-reload via realtime subscription
    } catch (error: any) {
      console.error('Error saving material:', error);
      toast.error(`Failed to save material: ${error.message || 'Unknown error'}`);
    }
  }

  function resetPriceForm() {
    setMaterialId('');
    setVendorId('');
    setPricePerUnit('');
    setTruckloadQty('');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setPriceNotes('');
    setSelectedMaterial(null);
  }

  function resetVendorForm() {
    setVendorName('');
    setVendorContact('');
    setVendorPhone('');
    setVendorEmail('');
  }

  function resetMaterialForm() {
    setMaterialName('');
    setMaterialUnit('board foot');
    setStandardLength('16');
  }

  // Get latest price for a material from a specific vendor
  function getLatestPrice(materialId: string, vendorId: string): PriceEntry | null {
    const materialPrices = prices.filter(
      p => p.material_id === materialId && p.vendor_id === vendorId
    );
    return materialPrices.length > 0 ? materialPrices[0] : null;
  }

  // Get price history for a material
  function getMaterialPriceHistory(materialId: string): PriceEntry[] {
    return prices.filter(p => p.material_id === materialId);
  }

  // Prepare chart data for a material
  function getChartData(materialId: string) {
    const history = getMaterialPriceHistory(materialId);
    
    // Group by vendor and date
    const vendorData: Record<string, any[]> = {};
    
    history.forEach(entry => {
      const vendorName = entry.vendor?.name || 'Unknown';
      if (!vendorData[vendorName]) {
        vendorData[vendorName] = [];
      }
      vendorData[vendorName].push({
        date: entry.effective_date,
        price: entry.price_per_unit,
      });
    });

    // Create unified timeline
    const allDates = [...new Set(history.map(h => h.effective_date))].sort();
    
    return allDates.map(date => {
      const dataPoint: any = { date };
      Object.keys(vendorData).forEach(vendorName => {
        const entry = vendorData[vendorName].find(e => e.date === date);
        if (entry) {
          dataPoint[vendorName] = entry.price;
        }
      });
      return dataPoint;
    });
  }

  // Get price trend (up/down/stable)
  function getPriceTrend(materialId: string, vendorId: string): 'up' | 'down' | 'stable' | null {
    const history = prices
      .filter(p => p.material_id === materialId && p.vendor_id === vendorId)
      .slice(0, 2);
    
    if (history.length < 2) return null;
    
    const latest = history[0].price_per_unit;
    const previous = history[1].price_per_unit;
    
    if (latest > previous) return 'up';
    if (latest < previous) return 'down';
    return 'stable';
  }

  const filteredMaterials = materials.filter(m => m.category === category);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading pricing data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {category === 'lumber' ? <Package className="w-7 h-7 text-blue-600" /> : <Building2 className="w-7 h-7 text-blue-600" />}
            {category === 'lumber' ? 'Lumber Pricing' : 'Rebar Pricing'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track {category} prices across vendors with historical data
          </p>
        </div>
      </div>

      {/* Vendor Summary */}
      {vendors.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Active Vendors ({vendors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {vendors.map(vendor => (
                <Badge key={vendor.id} variant="outline" className="px-3 py-1">
                  {vendor.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Materials List */}
      {filteredMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No {category} materials yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add materials to start tracking prices
            </p>
            <Button onClick={() => setShowAddMaterialDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Material
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMaterials.map(material => {
            const materialHistory = getMaterialPriceHistory(material.id);
            const hasHistory = materialHistory.length > 0;

            return (
              <Card key={material.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{material.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Standard: {material.standard_length}' • Unit: {material.unit}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPriceHistory(material)}
                        disabled={!hasHistory}
                      >
                        <LineChart className="w-4 h-4 mr-2" />
                        History
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openAddPriceDialog(material)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Price
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {vendors.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="mb-2">No vendors added yet</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAddVendorDialog(true)}
                      >
                        Add Vendor
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {vendors.map(vendor => {
                        const latestPrice = getLatestPrice(material.id, vendor.id);
                        const trend = getPriceTrend(material.id, vendor.id);

                        return (
                          <div
                            key={vendor.id}
                            className={`border rounded-lg p-4 ${
                              latestPrice ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-semibold text-sm">{vendor.name}</h4>
                              {trend && (
                                <div className="flex items-center">
                                  {trend === 'up' && <TrendingUp className="w-4 h-4 text-red-600" />}
                                  {trend === 'down' && <TrendingDown className="w-4 h-4 text-green-600" />}
                                </div>
                              )}
                            </div>

                            {latestPrice ? (
                              <div>
                                <div className="flex items-baseline gap-2 mb-1">
                                  <span className="text-2xl font-bold text-blue-900">
                                    ${latestPrice.price_per_unit.toFixed(2)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    per {material.unit}
                                  </span>
                                </div>
                                {latestPrice.truckload_quantity && (
                                  <p className="text-xs text-muted-foreground mb-1">
                                    Truckload: {latestPrice.truckload_quantity} units
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(latestPrice.effective_date).toLocaleDateString()}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No pricing data</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Price Dialog */}
      <Dialog open={showAddPriceDialog} onOpenChange={setShowAddPriceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Price Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Material *</Label>
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select material..." />
                </SelectTrigger>
                <SelectContent>
                  {materials.filter(m => m.category === category).map(material => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map(vendor => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price per Unit ($) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Truckload Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={truckloadQty}
                  onChange={(e) => setTruckloadQty(e.target.value)}
                  placeholder="e.g., 9"
                />
              </div>
            </div>

            <div>
              <Label>Effective Date *</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={priceNotes}
                onChange={(e) => setPriceNotes(e.target.value)}
                placeholder="Optional notes about this price..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={savePrice} className="flex-1">
                <DollarSign className="w-4 h-4 mr-2" />
                Save Price
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddPriceDialog(false);
                  resetPriceForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      {selectedMaterial && (
        <Dialog open={showPriceHistoryDialog} onOpenChange={setShowPriceHistoryDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Price History: {selectedMaterial.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Chart */}
              <div className="bg-slate-50 p-4 rounded-lg border">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <LineChart className="w-4 h-4" />
                  Price Trend
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsLineChart data={getChartData(selectedMaterial.id)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      formatter={(value: any) => `$${value.toFixed(2)}`}
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    />
                    <Legend />
                    {vendors.map((vendor, idx) => (
                      <Line
                        key={vendor.id}
                        type="monotone"
                        dataKey={vendor.name}
                        stroke={`hsl(${(idx * 360) / vendors.length}, 70%, 50%)`}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>

              {/* History Table */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  All Price Entries
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold">Date</th>
                        <th className="text-left p-3 text-sm font-semibold">Vendor</th>
                        <th className="text-right p-3 text-sm font-semibold">Price</th>
                        <th className="text-center p-3 text-sm font-semibold">Truckload</th>
                        <th className="text-left p-3 text-sm font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {getMaterialPriceHistory(selectedMaterial.id).map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="p-3 text-sm">
                            {new Date(entry.effective_date).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-sm font-medium">
                            {entry.vendor?.name}
                          </td>
                          <td className="p-3 text-sm text-right font-semibold">
                            ${entry.price_per_unit.toFixed(2)}
                          </td>
                          <td className="p-3 text-sm text-center">
                            {entry.truckload_quantity || '-'}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {entry.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Vendor Dialog */}
      <Dialog open={showAddVendorDialog} onOpenChange={setShowAddVendorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor Name *</Label>
              <Input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g., ABC Lumber Supply"
              />
            </div>

            <div>
              <Label>Contact Name</Label>
              <Input
                value={vendorContact}
                onChange={(e) => setVendorContact(e.target.value)}
                placeholder="Primary contact person"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={vendorEmail}
                  onChange={(e) => setVendorEmail(e.target.value)}
                  placeholder="contact@vendor.com"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveVendor} className="flex-1">
                <Users className="w-4 h-4 mr-2" />
                Add Vendor
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddVendorDialog(false);
                  resetVendorForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Material Dialog */}
      <Dialog open={showAddMaterialDialog} onOpenChange={setShowAddMaterialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {category === 'lumber' ? 'Lumber' : 'Rebar'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Material Name *</Label>
              <Input
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder={category === 'lumber' ? 'e.g., 2x4 SPF' : 'e.g., #4 Rebar'}
              />
            </div>

            <div>
              <Label>Category</Label>
              <Input
                value={category === 'lumber' ? 'Lumber' : 'Rebar'}
                disabled
                className="bg-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit *</Label>
                <Select value={materialUnit} onValueChange={setMaterialUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="board foot">Board Foot</SelectItem>
                    <SelectItem value="linear foot">Linear Foot</SelectItem>
                    <SelectItem value="sheet">Sheet</SelectItem>
                    <SelectItem value="piece">Piece</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Standard Length (ft)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={standardLength}
                  onChange={(e) => setStandardLength(e.target.value)}
                  placeholder="16"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveMaterial} className="flex-1">
                <Package className="w-4 h-4 mr-2" />
                Add Material
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddMaterialDialog(false);
                  resetMaterialForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
