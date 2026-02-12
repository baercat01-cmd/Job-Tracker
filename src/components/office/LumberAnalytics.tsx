import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Activity,
  Package,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  Minus,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
}

interface Vendor {
  id: string;
  name: string;
  active: boolean;
}

interface PriceEntry {
  id: string;
  material_id: string;
  vendor_id: string;
  price_per_unit: number;
  truckload_quantity: number | null;
  effective_date: string;
  vendor?: Vendor;
  material?: Material;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1', '#A4DE6C', '#D0ED57'];

export function LumberAnalytics() {
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [category, setCategory] = useState<'lumber' | 'rebar'>('lumber');
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('90');
  const [selectedMaterialForDetail, setSelectedMaterialForDetail] = useState<Material | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const [materialsRes, vendorsRes, pricesRes] = await Promise.all([
        supabase
          .from('lumber_rebar_materials')
          .select('*')
          .eq('active', true)
          .order('order_index'),
        supabase
          .from('lumber_rebar_vendors')
          .select('*')
          .eq('active', true)
          .order('name'),
        supabase
          .from('lumber_rebar_prices')
          .select(`
            *,
            vendor:lumber_rebar_vendors(*),
            material:lumber_rebar_materials(*)
          `)
          .order('effective_date', { ascending: false }),
      ]);

      if (materialsRes.error) throw materialsRes.error;
      if (vendorsRes.error) throw vendorsRes.error;
      if (pricesRes.error) throw pricesRes.error;

      setMaterials(materialsRes.data || []);
      setVendors(vendorsRes.data || []);
      setPrices(pricesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter materials by category
  const categoryMaterials = useMemo(() => {
    return materials.filter(m => m.category === category);
  }, [materials, category]);

  // Filter prices by time range
  function getFilteredPrices(): PriceEntry[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
    return prices.filter(p => new Date(p.effective_date) >= cutoffDate);
  }

  // Get latest price for a material across all vendors
  function getLatestPrice(materialId: string): number | null {
    const materialPrices = prices
      .filter(p => p.material_id === materialId)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
    
    if (materialPrices.length === 0) return null;
    
    // Get the most recent prices and average them
    const recentPrices = materialPrices.slice(0, 3);
    return recentPrices.reduce((sum, p) => sum + p.price_per_unit, 0) / recentPrices.length;
  }

  // Get price trend for a material
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

  // Calculate price volatility
  function getPriceVolatility(materialId: string): number {
    const materialPrices = prices
      .filter(p => p.material_id === materialId)
      .slice(0, 10);

    if (materialPrices.length < 2) return 0;

    const priceValues = materialPrices.map(p => p.price_per_unit);
    const avg = priceValues.reduce((sum, p) => sum + p, 0) / priceValues.length;
    const variance = priceValues.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / priceValues.length;
    const stdDev = Math.sqrt(variance);

    return (stdDev / avg) * 100; // Coefficient of variation as percentage
  }

  // Get vendor comparison data
  function getVendorComparisonData(materialId: string) {
    const vendorPrices: Record<string, { total: number; count: number; name: string; latest: number; latestDate: string }> = {};

    prices
      .filter(p => p.material_id === materialId)
      .forEach(price => {
        if (!vendorPrices[price.vendor_id]) {
          vendorPrices[price.vendor_id] = {
            total: 0,
            count: 0,
            name: price.vendor?.name || 'Unknown',
            latest: price.price_per_unit,
            latestDate: price.effective_date,
          };
        }
        vendorPrices[price.vendor_id].total += price.price_per_unit;
        vendorPrices[price.vendor_id].count += 1;
        
        // Update latest if this is more recent
        if (new Date(price.effective_date) > new Date(vendorPrices[price.vendor_id].latestDate)) {
          vendorPrices[price.vendor_id].latest = price.price_per_unit;
          vendorPrices[price.vendor_id].latestDate = price.effective_date;
        }
      });

    return Object.entries(vendorPrices).map(([vendorId, data]) => ({
      vendor: data.name,
      avgPrice: data.total / data.count,
      latestPrice: data.latest,
      entries: data.count,
    }));
  }

  // Get price history for chart
  function getPriceHistoryChart(materialId: string) {
    const filteredPrices = getFilteredPrices().filter(p => p.material_id === materialId);

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

  // Get comprehensive overview data for all materials
  function getOverviewData() {
    return categoryMaterials.map(material => {
      const latestPrice = getLatestPrice(material.id);
      const trend = getPriceTrend(material.id);
      const volatility = getPriceVolatility(material.id);
      const vendorComparison = getVendorComparisonData(material.id);
      const bestVendor = vendorComparison.sort((a, b) => a.latestPrice - b.latestPrice)[0];

      return {
        material,
        latestPrice,
        trend,
        volatility,
        vendorCount: vendorComparison.length,
        bestVendor: bestVendor?.vendor || 'N/A',
        bestPrice: bestVendor?.latestPrice || null,
      };
    });
  }

  // Get best value vendors for a material
  function getBestValueVendors(materialId: string) {
    const comparison = getVendorComparisonData(materialId);
    return comparison.sort((a, b) => a.latestPrice - b.latestPrice).slice(0, 5);
  }

  const filteredPrices = getFilteredPrices();
  const overviewData = getOverviewData();
  const trendCounts = {
    up: categoryMaterials.filter(m => getPriceTrend(m.id) === 'up').length,
    down: categoryMaterials.filter(m => getPriceTrend(m.id) === 'down').length,
    stable: categoryMaterials.filter(m => getPriceTrend(m.id) === 'stable').length,
  };

  const avgVolatility = categoryMaterials.length > 0
    ? categoryMaterials.reduce((sum, m) => sum + getPriceVolatility(m.id), 0) / categoryMaterials.length
    : 0;

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            {category === 'lumber' ? 'Lumber' : 'Rebar'} Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete market overview with price trends and vendor insights
          </p>
        </div>

        {/* Category Toggle & Time Range */}
        <div className="flex flex-wrap gap-2">
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={category === 'lumber' ? 'default' : 'outline'}
              onClick={() => setCategory('lumber')}
              className="rounded-none"
            >
              Lumber
            </Button>
            <Button
              variant={category === 'rebar' ? 'default' : 'outline'}
              onClick={() => setCategory('rebar')}
              className="rounded-none"
            >
              Rebar
            </Button>
          </div>

          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="180">Last 6 Months</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              Total Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{categoryMaterials.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{category} items tracked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              Active Vendors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{vendors.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Supplier relationships</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-yellow-600" />
              Price Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {filteredPrices.filter(p => p.material?.category === category).length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">In selected period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-600" />
              Avg Volatility
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{avgVolatility.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Price fluctuation</p>
          </CardContent>
        </Card>
      </div>

      {/* Market Trends Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Market Trends Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <TrendingDown className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <p className="text-3xl font-bold text-green-900">{trendCounts.down}</p>
              <p className="text-sm text-green-700">Falling Prices</p>
              <p className="text-xs text-green-600 mt-1">
                {categoryMaterials.length > 0 ? ((trendCounts.down / categoryMaterials.length) * 100).toFixed(0) : 0}%
              </p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Minus className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <p className="text-3xl font-bold text-blue-900">{trendCounts.stable}</p>
              <p className="text-sm text-blue-700">Stable Prices</p>
              <p className="text-xs text-blue-600 mt-1">
                {categoryMaterials.length > 0 ? ((trendCounts.stable / categoryMaterials.length) * 100).toFixed(0) : 0}%
              </p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-red-600" />
              <p className="text-3xl font-bold text-red-900">{trendCounts.up}</p>
              <p className="text-sm text-red-700">Rising Prices</p>
              <p className="text-xs text-red-600 mt-1">
                {categoryMaterials.length > 0 ? ((trendCounts.up / categoryMaterials.length) * 100).toFixed(0) : 0}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comprehensive Materials Overview Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5" />
            All {category === 'lumber' ? 'Lumber' : 'Rebar'} Materials at a Glance
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Click any row to see detailed price history and vendor comparison
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-100 sticky top-0">
                <tr className="border-b-2">
                  <th className="text-left p-3 font-semibold">Material</th>
                  <th className="text-center p-3 font-semibold">Length</th>
                  <th className="text-right p-3 font-semibold">Latest Price</th>
                  <th className="text-center p-3 font-semibold">Trend</th>
                  <th className="text-right p-3 font-semibold">Volatility</th>
                  <th className="text-center p-3 font-semibold">Vendors</th>
                  <th className="text-left p-3 font-semibold">Best Vendor</th>
                  <th className="text-right p-3 font-semibold">Best Price</th>
                  <th className="text-center p-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {overviewData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No {category} materials found</p>
                    </td>
                  </tr>
                ) : (
                  overviewData.map((data, idx) => (
                    <tr
                      key={data.material.id}
                      className={`hover:bg-blue-50 cursor-pointer border-b ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                      }`}
                      onClick={() => setSelectedMaterialForDetail(data.material)}
                    >
                      <td className="p-3 font-semibold">{data.material.name}</td>
                      <td className="p-3 text-center font-semibold text-blue-700">
                        {data.material.standard_length}'
                      </td>
                      <td className="p-3 text-right font-mono text-lg font-bold">
                        {data.latestPrice ? `$${data.latestPrice.toFixed(2)}` : '-'}
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
                      <td className={`p-3 text-right font-semibold ${
                        data.volatility > 10 ? 'text-red-700' : data.volatility > 5 ? 'text-yellow-700' : 'text-green-700'
                      }`}>
                        {data.volatility.toFixed(1)}%
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline">{data.vendorCount}</Badge>
                      </td>
                      <td className="p-3">
                        <span className="text-sm font-medium text-green-700">{data.bestVendor}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-green-700">
                        {data.bestPrice ? `$${data.bestPrice.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="outline">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* High Volatility Alert */}
      {overviewData.filter(d => d.volatility > 10).length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-yellow-900">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              High Volatility Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overviewData
                .filter(d => d.volatility > 10)
                .sort((a, b) => b.volatility - a.volatility)
                .map(data => (
                  <div
                    key={data.material.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-yellow-200"
                  >
                    <div>
                      <p className="font-semibold text-yellow-900">{data.material.name}</p>
                      <p className="text-xs text-yellow-700">
                        Price fluctuating significantly - consider locking in rates
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-yellow-700">{data.volatility.toFixed(1)}%</p>
                      <p className="text-xs text-yellow-600">volatility</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Material Detail Dialog */}
      {selectedMaterialForDetail && (
        <Dialog open={!!selectedMaterialForDetail} onOpenChange={() => setSelectedMaterialForDetail(null)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {selectedMaterialForDetail.name} - Detailed Analysis
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Material Info Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-semibold">{selectedMaterialForDetail.category}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Standard Length</p>
                      <p className="font-semibold">{selectedMaterialForDetail.standard_length}'</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Unit</p>
                      <p className="font-semibold">{selectedMaterialForDetail.unit}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Price Trend</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getPriceTrend(selectedMaterialForDetail.id) === 'up' && (
                          <Badge className="bg-red-100 text-red-800 border-red-300">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Rising
                          </Badge>
                        )}
                        {getPriceTrend(selectedMaterialForDetail.id) === 'down' && (
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            <TrendingDown className="w-3 h-3 mr-1" />
                            Falling
                          </Badge>
                        )}
                        {getPriceTrend(selectedMaterialForDetail.id) === 'stable' && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                            <Minus className="w-3 h-3 mr-1" />
                            Stable
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Price History Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Price History ({timeRange} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={getPriceHistoryChart(selectedMaterialForDetail.id)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(value) => `$${value}`} />
                      <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                      <Legend />
                      {vendors.map((vendor, idx) => (
                        <Area
                          key={vendor.id}
                          type="monotone"
                          dataKey={vendor.name}
                          stroke={COLORS[idx % COLORS.length]}
                          fill={COLORS[idx % COLORS.length]}
                          fillOpacity={0.3}
                          strokeWidth={2}
                          connectNulls
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Vendor Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Vendor Price Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Bar Chart */}
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={getBestValueVendors(selectedMaterialForDetail.id)} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(value) => `$${value}`} />
                        <YAxis dataKey="vendor" type="category" width={120} />
                        <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                        <Bar dataKey="latestPrice" fill="#00C49F" name="Latest Price">
                          {getBestValueVendors(selectedMaterialForDetail.id).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Vendor Table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left p-3 font-semibold">Vendor</th>
                            <th className="text-right p-3 font-semibold">Latest Price</th>
                            <th className="text-right p-3 font-semibold">Avg Price</th>
                            <th className="text-center p-3 font-semibold">Entries</th>
                            <th className="text-center p-3 font-semibold">Rank</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getBestValueVendors(selectedMaterialForDetail.id).map((vendor, idx) => (
                            <tr key={idx} className={`hover:bg-slate-50 ${idx === 0 ? 'bg-green-50' : ''}`}>
                              <td className="p-3 font-medium">
                                {vendor.vendor}
                                {idx === 0 && (
                                  <Badge className="ml-2 bg-green-600">Best Value</Badge>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-lg">
                                ${vendor.latestPrice.toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono">
                                ${vendor.avgPrice.toFixed(2)}
                              </td>
                              <td className="p-3 text-center">{vendor.entries}</td>
                              <td className="p-3 text-center">
                                <Badge variant={idx === 0 ? 'default' : 'secondary'}>
                                  #{idx + 1}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
