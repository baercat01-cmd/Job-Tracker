import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  LineChart as LineChartIcon,
  Calendar,
  Users,
  Share2,
  Copy,
  ExternalLink,
  BarChart3,
  Minus,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

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
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'pricing' | 'analytics'>('pricing');
  
  // Dialogs
  const [showVendorPricingDialog, setShowVendorPricingDialog] = useState(false);
  const [showPriceHistoryDialog, setShowPriceHistoryDialog] = useState(false);
  const [showMaterialDetailDialog, setShowMaterialDetailDialog] = useState(false);
  
  // Selected items
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  
  // Form states
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Bulk pricing for vendor
  const [bulkPrices, setBulkPrices] = useState<Record<string, { mbf: string; perUnit: string; truckload: string; notes: string }>>({});
  
  // Share link dialog
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareVendor, setShareVendor] = useState<Vendor | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [shareExpireDays, setShareExpireDays] = useState('30');
  const [generatingLink, setGeneratingLink] = useState(false);
  
  // Analytics filters
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('90');

  useEffect(() => {
    loadData();
    
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

  function calculateBoardFeet(materialName: string, length: number): number {
    const match = materialName.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return 1;
    
    const thickness = parseInt(match[1]);
    const width = parseInt(match[2]);
    
    const boardFeet = (thickness * width * length) / 12;
    return boardFeet;
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

  function getLatestPrice(materialId: string, vendorId: string): PriceEntry | null {
    const materialPrices = prices.filter(
      p => p.material_id === materialId && p.vendor_id === vendorId
    );
    return materialPrices.length > 0 ? materialPrices[0] : null;
  }

  function getMaterialPriceHistory(materialId: string): PriceEntry[] {
    return prices.filter(p => p.material_id === materialId);
  }

  function getChartData(materialId: string) {
    const history = getMaterialPriceHistory(materialId);
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

  function getAveragePrice(materialId: string): number | null {
    const materialPrices = prices
      .filter(p => p.material_id === materialId)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
    
    if (materialPrices.length === 0) return null;
    const recentPrices = materialPrices.slice(0, 3);
    return recentPrices.reduce((sum, p) => sum + p.price_per_unit, 0) / recentPrices.length;
  }

  function getPriceTrend(materialId: string): 'up' | 'down' | 'stable' {
    const materialPrices = prices
      .filter(p => p.material_id === materialId)
      .slice(0, 10);

    if (materialPrices.length < 2) return 'stable';

    const recent = materialPrices.slice(0, 5);
    const older = materialPrices.slice(5, 10);

    const recentAvg = recent.reduce((sum, p) => sum + p.price_per_unit, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.price_per_unit, 0) / older.length || recentAvg;

    if (recentAvg > olderAvg * 1.05) return 'up';
    if (recentAvg < olderAvg * 0.95) return 'down';
    return 'stable';
  }

  function getVendorCount(materialId: string): number {
    const uniqueVendors = new Set(prices.filter(p => p.material_id === materialId).map(p => p.vendor_id));
    return uniqueVendors.size;
  }

  function getBestPrice(materialId: string): { vendor: string; price: number } | null {
    const materialPrices = prices
      .filter(p => p.material_id === materialId)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());

    const latestByVendor = new Map<string, PriceEntry>();
    materialPrices.forEach(price => {
      if (!latestByVendor.has(price.vendor_id)) {
        latestByVendor.set(price.vendor_id, price);
      }
    });

    const best = Array.from(latestByVendor.values()).sort((a, b) => a.price_per_unit - b.price_per_unit)[0];
    return best ? { vendor: best.vendor?.name || 'Unknown', price: best.price_per_unit } : null;
  }

  function getVendorComparisonData(materialId: string) {
    const vendorPrices: Record<string, { name: string; latest: number; latestDate: string }> = {};

    prices
      .filter(p => p.material_id === materialId)
      .forEach(price => {
        if (!vendorPrices[price.vendor_id]) {
          vendorPrices[price.vendor_id] = {
            name: price.vendor?.name || 'Unknown',
            latest: price.price_per_unit,
            latestDate: price.effective_date,
          };
        }
        
        if (new Date(price.effective_date) > new Date(vendorPrices[price.vendor_id].latestDate)) {
          vendorPrices[price.vendor_id].latest = price.price_per_unit;
          vendorPrices[price.vendor_id].latestDate = price.effective_date;
        }
      });

    return Object.values(vendorPrices)
      .map(data => ({
        vendor: data.name,
        price: data.latest,
        date: data.latestDate,
      }))
      .sort((a, b) => a.price - b.price);
  }

  function getPriceHistoryChartData(materialId: string) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
    
    const filteredPrices = prices
      .filter(p => p.material_id === materialId && new Date(p.effective_date) >= cutoffDate)
      .sort((a, b) => new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime());
    
    const vendorData: Record<string, any[]> = {};

    filteredPrices.forEach(entry => {
      const vendorName = entry.vendor?.name || 'Unknown';
      if (!vendorData[vendorName]) {
        vendorData[vendorName] = [];
      }
      vendorData[vendorName].push({
        date: entry.effective_date,
        price: entry.price_per_unit,
      });
    });

    const allDates = [...new Set(filteredPrices.map(p => p.effective_date))].sort();

    return allDates.map(date => {
      const dataPoint: any = {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date,
      };

      Object.keys(vendorData).forEach(vendorName => {
        const entry = vendorData[vendorName].find(e => e.date === date);
        if (entry) {
          dataPoint[vendorName] = entry.price;
        }
      });

      return dataPoint;
    });
  }

  const analyticsData = useMemo(() => {
    return filteredMaterials.map(material => {
      const avgPrice = getAveragePrice(material.id);
      const trend = getPriceTrend(material.id);
      const vendorCount = getVendorCount(material.id);
      const bestPrice = getBestPrice(material.id);

      return {
        material,
        avgPrice,
        trend,
        vendorCount,
        bestPrice,
      };
    });
  }, [filteredMaterials, prices, timeRange]);

  const trendCounts = useMemo(() => ({
    up: analyticsData.filter(d => d.trend === 'up').length,
    down: analyticsData.filter(d => d.trend === 'down').length,
    stable: analyticsData.filter(d => d.trend === 'stable').length,
  }), [analyticsData]);

  async function generateShareLink(vendor: Vendor) {
    setShareVendor(vendor);
    setShareLink('');
    setGeneratingLink(true);
    setShowShareDialog(true);

    try {
      if (!vendor || !vendor.id) {
        throw new Error('Invalid vendor selected');
      }

      if (!profile?.id) {
        throw new Error('User profile not found. Please refresh and try again.');
      }

      const token = crypto.randomUUID();
      
      const expiresAt = shareExpireDays ? (() => {
        const days = parseInt(shareExpireDays);
        if (isNaN(days) || days <= 0) {
          return null;
        }
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
      })() : null;

      const insertData = {
        vendor_id: vendor.id,
        category,
        token,
        expires_at: expiresAt,
        created_by: profile.id,
        notes: `Generated for ${vendor.name}`,
        is_active: true,
      };

      const { data, error } = await supabase
        .from('lumber_rebar_vendor_links')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      const baseUrl = window.location.origin;
      const link = `${baseUrl}/vendor-pricing/${token}`;
      setShareLink(link);
      
      toast.success('Shareable link created!');
    } catch (error: any) {
      console.error('Error generating share link:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      toast.error(`Failed to generate link: ${errorMessage}`);
      setShowShareDialog(false);
    } finally {
      setGeneratingLink(false);
    }
  }

  function copyToClipboard() {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      toast.success('Link copied to clipboard!');
    }
  }

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
            {category === 'lumber' ? 'Lumber Pricing & Analytics' : 'Rebar Pricing & Analytics'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === 'pricing' ? 'Manage vendor pricing and share links' : 'Analyze price trends and vendor comparisons'}
          </p>
        </div>
        {activeTab === 'analytics' && (
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="180">Last 6 Months</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pricing" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Pricing
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pricing" className="space-y-6 mt-6">
          {/* Vendor Cards */}
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
                        <div className="pt-2 space-y-2">
                          <Button className="w-full" size="sm">
                            <DollarSign className="w-4 h-4 mr-2" />
                            Add Prices
                          </Button>
                          <Button
                            className="w-full bg-purple-600 hover:bg-purple-700"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              generateShareLink(vendor);
                            }}
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Share Link
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

          {/* Materials Reference List */}
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
                              <LineChartIcon className="w-4 h-4 mr-2" />
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
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6 mt-6">
          {/* Market Trends Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6 pb-4 text-center">
                <TrendingDown className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <p className="text-3xl font-bold text-green-900">{trendCounts.down}</p>
                <p className="text-sm text-green-700 mt-1">Prices Falling</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6 pb-4 text-center">
                <Minus className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                <p className="text-3xl font-bold text-blue-900">{trendCounts.stable}</p>
                <p className="text-sm text-blue-700 mt-1">Stable Prices</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6 pb-4 text-center">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-red-600" />
                <p className="text-3xl font-bold text-red-900">{trendCounts.up}</p>
                <p className="text-sm text-red-700 mt-1">Prices Rising</p>
              </CardContent>
            </Card>
          </div>

          {/* Materials Analytics Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Material Price Analysis
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Click any material for detailed vendor comparison and price history
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-100 border-b-2">
                    <tr>
                      <th className="text-left p-3 font-semibold">Material</th>
                      <th className="text-center p-3 font-semibold">Length</th>
                      <th className="text-right p-3 font-semibold">Avg Price</th>
                      <th className="text-center p-3 font-semibold">Trend</th>
                      <th className="text-right p-3 font-semibold">Best Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {analyticsData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          <p>No {category} materials found</p>
                        </td>
                      </tr>
                    ) : (
                      analyticsData.map((data, idx) => (
                        <tr
                          key={data.material.id}
                          className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                          }`}
                          onClick={() => {
                            setSelectedMaterial(data.material);
                            setShowMaterialDetailDialog(true);
                          }}
                        >
                          <td className="p-3">
                            <div className="font-medium">{data.material.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {data.material.unit}
                            </div>
                          </td>
                          <td className="p-3 text-center font-semibold text-blue-700">
                            {data.material.standard_length}'
                          </td>
                          <td className="p-3 text-right font-mono font-semibold">
                            {data.avgPrice ? `$${data.avgPrice.toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {data.trend === 'up' && (
                              <Badge className="bg-red-100 text-red-800 border-red-300">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                Rising
                              </Badge>
                            )}
                            {data.trend === 'down' && (
                              <Badge className="bg-green-100 text-green-800 border-green-300">
                                <TrendingDown className="w-3 h-3 mr-1" />
                                Falling
                              </Badge>
                            )}
                            {data.trend === 'stable' && (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                <Minus className="w-3 h-3 mr-1" />
                                Stable
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {data.bestPrice ? (
                              <div>
                                <div className="font-mono font-bold text-green-700">
                                  ${data.bestPrice.price.toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {data.bestPrice.vendor}
                                </div>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      {/* Share Link Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-purple-600" />
              Share Pricing Link - {shareVendor?.name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Send this link to {shareVendor?.name} so they can submit their prices directly
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {generatingLink ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 mx-auto mb-4 text-purple-600 animate-spin" />
                <p className="text-muted-foreground">Generating secure link...</p>
              </div>
            ) : (
              <>
                {/* Generated Link */}
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <Label className="text-sm font-semibold mb-2 block">Shareable Link:</Label>
                  <div className="flex gap-2">
                    <Input
                      value={shareLink}
                      readOnly
                      className="font-mono text-sm bg-white"
                    />
                    <Button onClick={copyToClipboard} variant="outline" size="icon">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => window.open(shareLink, '_blank')}
                      variant="outline"
                      size="icon"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="font-semibold mb-2 text-sm">How to use:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Copy the link above</li>
                    <li>Send it to {shareVendor?.name} via email or text</li>
                    <li>They can click the link and enter prices - no login required</li>
                    <li>You'll be notified when they submit their prices</li>
                    <li>Prices will automatically appear in your system</li>
                  </ol>
                </div>

                {/* Link Details */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border">
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="font-semibold">{category === 'lumber' ? 'Lumber' : 'Rebar'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expires</p>
                    <p className="font-semibold">
                      {shareExpireDays ? `${shareExpireDays} days` : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Materials</p>
                    <p className="font-semibold">{filteredMaterials.length} items</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-semibold">{shareVendor?.name}</p>
                  </div>
                </div>

                {/* Security Note */}
                <div className="text-xs text-muted-foreground bg-slate-50 p-3 rounded border">
                  🔒 This is a secure, one-time use link. The vendor can only submit prices for the materials in this category.
                </div>
              </>
            )}
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
                  <LineChartIcon className="w-4 h-4" />
                  Price Trend
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getChartData(selectedMaterial.id)}>
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
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
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

      {/* Material Detail Dialog (for Analytics) */}
      {selectedMaterial && (
        <Dialog open={showMaterialDetailDialog} onOpenChange={setShowMaterialDetailDialog}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {selectedMaterial.name} - Price Analysis
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Last {timeRange} days • {selectedMaterial.standard_length}' • {selectedMaterial.unit}
              </p>
            </DialogHeader>

            <div className="space-y-6">
              {/* Price Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LineChartIcon className="w-5 h-5" />
                    Price Trend Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getPriceHistoryChartData(selectedMaterial.id)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(value) => `$${value}`} />
                      <Tooltip
                        formatter={(value: any) => `$${value.toFixed(2)}`}
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0]) {
                            return new Date(payload[0].payload.fullDate).toLocaleDateString();
                          }
                          return label;
                        }}
                      />
                      <Legend />
                      {vendors.map((vendor, idx) => (
                        <Line
                          key={vendor.id}
                          type="monotone"
                          dataKey={vendor.name}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Vendor Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Vendor Price Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getVendorComparisonData(selectedMaterial.id)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="vendor" />
                      <YAxis tickFormatter={(value) => `$${value}`} />
                      <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                      <Bar dataKey="price" name="Latest Price">
                        {getVendorComparisonData(selectedMaterial.id).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Vendor Details Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Current Vendor Pricing</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="text-left p-3 font-semibold">Vendor</th>
                        <th className="text-right p-3 font-semibold">Latest Price</th>
                        <th className="text-left p-3 font-semibold">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {getVendorComparisonData(selectedMaterial.id).map((row, idx) => (
                        <tr key={idx} className={idx === 0 ? 'bg-green-50' : 'hover:bg-slate-50'}>
                          <td className="p-3 font-medium">
                            {row.vendor}
                            {idx === 0 && (
                              <Badge className="ml-2 bg-green-600 text-white">Best Price</Badge>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-semibold">
                            ${row.price.toFixed(2)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
