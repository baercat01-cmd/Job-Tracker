import { useState, useEffect, useMemo } from 'react';
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
  Calculator,
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
  const [showVendorPricingDialog, setShowVendorPricingDialog] = useState(false);
  const [showPriceHistoryDialog, setShowPriceHistoryDialog] = useState(false);
  
  // Selected items
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  
  // Form states
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Bulk pricing for vendor
  const [bulkPrices, setBulkPrices] = useState<Record<string, { mbf: string; perUnit: string; truckload: string; notes: string }>>({});

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

  // Calculate board feet for a piece of lumber
  function calculateBoardFeet(materialName: string, length: number): number {
    // Parse dimensions from material name (e.g., "2x4 SPF" -> 2, 4)
    const match = materialName.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return 1; // Default to 1 if we can't parse
    
    const thickness = parseInt(match[1]);
    const width = parseInt(match[2]);
    
    // Board Feet = (Thickness × Width × Length) / 12
    return (thickness * width * length) / 12;
  }

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

  function openVendorPricing(vendor: Vendor) {
    setSelectedVendor(vendor);
    setBulkPrices({});
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setShowVendorPricingDialog(true);
  }

  function openPriceHistory(material: Material) {
    setSelectedMaterial(material);
    setShowPriceHistoryDialog(true);
  }

  async function saveBulkPrices() {
    if (!selectedVendor) return;

    const pricesToSave = Object.entries(bulkPrices)
      .filter(([_, price]) => price.perUnit && parseFloat(price.perUnit) > 0)
      .map(([materialId, price]) => ({
        material_id: materialId,
        vendor_id: selectedVendor.id,
        price_per_unit: parseFloat(price.perUnit),
        truckload_quantity: price.truckload ? parseInt(price.truckload) : null,
        effective_date: effectiveDate,
        notes: price.notes || null,
        created_by: profile?.id || null,
      }));

    if (pricesToSave.length === 0) {
      toast.error('Please enter at least one price');
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_prices')
        .insert(pricesToSave);

      if (error) throw error;

      toast.success(`Added ${pricesToSave.length} prices for ${selectedVendor.name}`);
      setShowVendorPricingDialog(false);
      setBulkPrices({});
      setSelectedVendor(null);
      await loadPrices();
    } catch (error: any) {
      console.error('Error saving bulk prices:', error);
      toast.error('Failed to save prices');
    }
  }

  function updateBulkPrice(materialId: string, field: 'mbf' | 'perUnit' | 'truckload' | 'notes', value: string) {
    setBulkPrices(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [field]: value,
      }
    }));

    // Auto-calculate price per unit when MBF changes
    if (field === 'mbf' && value) {
      const material = materials.find(m => m.id === materialId);
      if (material && material.unit === 'board foot') {
        const boardFeet = calculateBoardFeet(material.name, material.standard_length);
        const pricePerBF = parseFloat(value) / 1000;
        const pricePerPiece = pricePerBF * boardFeet;
        
        setBulkPrices(prev => ({
          ...prev,
          [materialId]: {
            ...prev[materialId],
            perUnit: pricePerPiece.toFixed(2),
          }
        }));
      }
    }
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
            Click on a vendor to add prices for all materials
          </p>
        </div>
      </div>

      {/* Vendor Cards - Primary View */}
      {vendors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map(vendor => {
            const vendorPrices = prices.filter(p => p.vendor_id === vendor.id && materials.find(m => m.id === p.material_id && m.category === category));
            const materialsWithPrices = new Set(vendorPrices.map(p => p.material_id));
            const totalMaterials = filteredMaterials.length;
            const pricesCount = materialsWithPrices.size;
            const latestPrice = vendorPrices[0];

            return (
              <Card 
                key={vendor.id}
                className="cursor-pointer hover:shadow-lg transition-all border-2 hover:border-blue-400"
                onClick={() => openVendorPricing(vendor)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" />
                        {vendor.name}
                      </CardTitle>
                      {vendor.contact_name && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {vendor.contact_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {pricesCount}/{totalMaterials}
                      </div>
                      <p className="text-xs text-muted-foreground">priced</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {vendor.phone && (
                      <p className="text-sm text-muted-foreground">📞 {vendor.phone}</p>
                    )}
                    {vendor.email && (
                      <p className="text-sm text-muted-foreground">✉️ {vendor.email}</p>
                    )}
                    {latestPrice && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Last updated: {new Date(latestPrice.effective_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    <div className="pt-2">
                      <Button className="w-full" size="sm">
                        <DollarSign className="w-4 h-4 mr-2" />
                        Add Prices
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No vendors yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add vendors in Settings to start tracking prices
            </p>
          </CardContent>
        </Card>
      )}

      {/* Materials Reference List (collapsed by default) */}
      <details className="mt-6">
        <summary className="cursor-pointer font-semibold text-sm text-slate-700 hover:text-slate-900 mb-4 flex items-center gap-2">
          <Package className="w-4 h-4" />
          View All Materials ({filteredMaterials.length})
        </summary>
        {filteredMaterials.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No {category} materials yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add materials to start tracking prices
              </p>
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
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {vendors.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="mb-2">No vendors added yet</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {vendors.map(vendor => {
                          const latestPrice = getLatestPrice(material.id, vendor.id);

                          return (
                            <div
                              key={vendor.id}
                              className={`border rounded-lg p-4 ${
                                latestPrice ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-semibold text-sm">{vendor.name}</h4>
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
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Plus className="w-4 h-4" />
                                  No pricing yet
                                </div>
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
      </details>

      {/* Vendor Bulk Pricing Dialog */}
      {selectedVendor && (
        <Dialog open={showVendorPricingDialog} onOpenChange={setShowVendorPricingDialog}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Add Prices for {selectedVendor.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Enter MBF pricing for each material - prices per piece will be calculated automatically
              </p>
            </DialogHeader>

            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Effective Date */}
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border">
                <Label className="font-semibold">Effective Date:</Label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-48"
                />
                <div className="ml-auto text-sm text-muted-foreground">
                  {Object.values(bulkPrices).filter(p => p.perUnit && parseFloat(p.perUnit) > 0).length} of {filteredMaterials.length} materials priced
                </div>
              </div>

              {/* Materials Grid */}
              <div className="flex-1 overflow-y-auto border rounded-lg">
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b-2">
                      <th className="text-left p-3 font-semibold">Material</th>
                      <th className="text-left p-3 font-semibold">Length</th>
                      <th className="text-left p-3 font-semibold">Board Feet</th>
                      <th className="text-left p-3 font-semibold w-32">Price/MBF ($)</th>
                      <th className="text-left p-3 font-semibold w-32">Price/Piece ($)</th>
                      <th className="text-left p-3 font-semibold w-24">Truckload</th>
                      <th className="text-left p-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredMaterials.map(material => {
                      const boardFeet = material.unit === 'board foot' 
                        ? calculateBoardFeet(material.name, material.standard_length)
                        : null;
                      const currentPrice = bulkPrices[material.id] || { mbf: '', perUnit: '', truckload: '', notes: '' };
                      const latestExisting = getLatestPrice(material.id, selectedVendor.id);

                      return (
                        <tr key={material.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-medium">{material.name}</div>
                            {latestExisting && (
                              <div className="text-xs text-muted-foreground">
                                Current: ${latestExisting.price_per_unit.toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-sm font-semibold text-blue-700">
                            {material.standard_length}'
                          </td>
                          <td className="p-3 text-sm font-semibold">
                            {boardFeet ? `${boardFeet.toFixed(2)} BF` : '-'}
                          </td>
                          <td className="p-3">
                            {boardFeet ? (
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={currentPrice.mbf}
                                onChange={(e) => updateBulkPrice(material.id, 'mbf', e.target.value)}
                                placeholder="715"
                                className="w-full"
                              />
                            ) : (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={currentPrice.perUnit}
                                onChange={(e) => updateBulkPrice(material.id, 'perUnit', e.target.value)}
                                placeholder="0.00"
                                className="w-full"
                              />
                            )}
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={currentPrice.perUnit}
                              onChange={(e) => updateBulkPrice(material.id, 'perUnit', e.target.value)}
                              placeholder="0.00"
                              className={`w-full ${boardFeet && currentPrice.mbf ? 'bg-green-50 font-bold' : ''}`}
                              readOnly={!!(boardFeet && currentPrice.mbf)}
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              type="number"
                              min="0"
                              value={currentPrice.truckload}
                              onChange={(e) => updateBulkPrice(material.id, 'truckload', e.target.value)}
                              placeholder="9"
                              className="w-full"
                            />
                          </td>
                          <td className="p-3">
                            <Input
                              value={currentPrice.notes}
                              onChange={(e) => updateBulkPrice(material.id, 'notes', e.target.value)}
                              placeholder="Optional..."
                              className="w-full"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button onClick={saveBulkPrices} className="flex-1">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Save All Prices
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowVendorPricingDialog(false);
                    setBulkPrices({});
                    setSelectedVendor(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
    </div>
  );
}
