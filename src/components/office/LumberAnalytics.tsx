import { useState, useEffect } from 'react';
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1'];

export function LumberAnalytics() {
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('90');
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'comparison' | 'insights'>('overview');

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

      // Set default selections
      if (materialsRes.data && materialsRes.data.length > 0) {
        setSelectedMaterial(materialsRes.data[0].id);
      }
      if (vendorsRes.data && vendorsRes.data.length > 0) {
        setSelectedVendor(vendorsRes.data[0].id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter prices by time range
  function getFilteredPrices(): PriceEntry[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
    return prices.filter(p => new Date(p.effective_date) >= cutoffDate);
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
    if (!materialId) return [];

    const vendorPrices: Record<string, { total: number; count: number; name: string }> = {};

    prices
      .filter(p => p.material_id === materialId)
      .forEach(price => {
        if (!vendorPrices[price.vendor_id]) {
          vendorPrices[price.vendor_id] = {
            total: 0,
            count: 0,
            name: price.vendor?.name || 'Unknown',
          };
        }
        vendorPrices[price.vendor_id].total += price.price_per_unit;
        vendorPrices[price.vendor_id].count += 1;
      });

    return Object.entries(vendorPrices).map(([vendorId, data]) => ({
      vendor: data.name,
      avgPrice: data.total / data.count,
      entries: data.count,
    }));
  }

  // Get price history for chart
  function getPriceHistoryChart(materialId: string) {
    if (!materialId) return [];

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

  // Get category distribution
  function getCategoryDistribution() {
    const categoryCount: Record<string, number> = {};
    materials.forEach(m => {
      categoryCount[m.category] = (categoryCount[m.category] || 0) + 1;
    });

    return Object.entries(categoryCount).map(([category, count]) => ({
      name: category,
      value: count,
    }));
  }

  // Get price variance analysis
  function getPriceVarianceData() {
    return materials.slice(0, 10).map(material => {
      const volatility = getPriceVolatility(material.id);
      return {
        material: material.name.substring(0, 20),
        volatility: volatility.toFixed(2),
      };
    });
  }

  // Get best value vendors
  function getBestValueVendors(materialId: string) {
    const comparison = getVendorComparisonData(materialId);
    return comparison.sort((a, b) => a.avgPrice - b.avgPrice).slice(0, 5);
  }

  const filteredPrices = getFilteredPrices();
  const selectedMaterialData = materials.find(m => m.id === selectedMaterial);
  const priceHistory = getPriceHistoryChart(selectedMaterial);
  const categoryDist = getCategoryDistribution();
  const priceVariance = getPriceVarianceData();
  const bestVendors = getBestValueVendors(selectedMaterial);

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
            Lumber & Rebar Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Price trends, vendor comparisons, and market insights
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select material..." />
            </SelectTrigger>
            <SelectContent>
              {materials.map(material => (
                <SelectItem key={material.id} value={material.id}>
                  {material.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
            <p className="text-3xl font-bold">{materials.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Active inventory items</p>
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
            <p className="text-3xl font-bold">{filteredPrices.length}</p>
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
            <p className="text-3xl font-bold">
              {(
                materials
                  .slice(0, 10)
                  .reduce((sum, m) => sum + getPriceVolatility(m.id), 0) / Math.min(10, materials.length)
              ).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">Price fluctuation</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="trends">
            <TrendingUp className="w-4 h-4 mr-2" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="comparison">
            <Users className="w-4 h-4 mr-2" />
            Comparison
          </TabsTrigger>
          <TabsTrigger value="insights">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Insights
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Material Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryDist}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryDist.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Price Volatility */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Price Volatility by Material
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={priceVariance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="material" angle={-45} textAnchor="end" height={100} />
                    <YAxis label={{ value: 'Volatility %', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Bar dataKey="volatility" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          {selectedMaterialData && (
            <>
              {/* Material Info */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-blue-900">{selectedMaterialData.name}</h3>
                      <p className="text-sm text-blue-700">
                        {selectedMaterialData.category} • {selectedMaterialData.standard_length}' • {selectedMaterialData.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getPriceTrend(selectedMaterial) === 'up' && (
                        <Badge className="bg-red-100 text-red-800 border-red-300">
                          <TrendingUp className="w-4 h-4 mr-1" />
                          Rising
                        </Badge>
                      )}
                      {getPriceTrend(selectedMaterial) === 'down' && (
                        <Badge className="bg-green-100 text-green-800 border-green-300">
                          <TrendingDown className="w-4 h-4 mr-1" />
                          Falling
                        </Badge>
                      )}
                      {getPriceTrend(selectedMaterial) === 'stable' && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Stable
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Price History Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Price History - {selectedMaterialData.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={priceHistory}>
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
                          connectNulls
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="space-y-4">
          {selectedMaterialData && (
            <>
              {/* Best Value Vendors */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Best Value Vendors - {selectedMaterialData.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bestVendors} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(value) => `$${value}`} />
                      <YAxis dataKey="vendor" type="category" width={120} />
                      <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                      <Bar dataKey="avgPrice" fill="#00C49F">
                        {bestVendors.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Vendor Details Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Vendor Comparison Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="text-left p-3 font-semibold border">Vendor</th>
                          <th className="text-right p-3 font-semibold border">Avg Price</th>
                          <th className="text-center p-3 font-semibold border">Price Entries</th>
                          <th className="text-center p-3 font-semibold border">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bestVendors.map((vendor, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 border font-medium">{vendor.vendor}</td>
                            <td className="p-3 border text-right font-mono">
                              ${vendor.avgPrice.toFixed(2)}
                            </td>
                            <td className="p-3 border text-center">{vendor.entries}</td>
                            <td className="p-3 border text-center">
                              <Badge variant={idx === 0 ? 'default' : 'secondary'}>
                                #{idx + 1}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          {/* High Volatility Materials */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                High Volatility Materials
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {materials
                  .map(m => ({ ...m, volatility: getPriceVolatility(m.id) }))
                  .sort((a, b) => b.volatility - a.volatility)
                  .slice(0, 10)
                  .map(material => (
                    <div
                      key={material.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                    >
                      <div>
                        <p className="font-semibold">{material.name}</p>
                        <p className="text-xs text-muted-foreground">{material.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-yellow-700">
                          {material.volatility.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">volatility</p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Price Trend Summary */}
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
                  <p className="text-3xl font-bold text-green-900">
                    {materials.filter(m => getPriceTrend(m.id) === 'down').length}
                  </p>
                  <p className="text-sm text-green-700">Falling Prices</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                  <p className="text-3xl font-bold text-blue-900">
                    {materials.filter(m => getPriceTrend(m.id) === 'stable').length}
                  </p>
                  <p className="text-sm text-blue-700">Stable Prices</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 text-red-600" />
                  <p className="text-3xl font-bold text-red-900">
                    {materials.filter(m => getPriceTrend(m.id) === 'up').length}
                  </p>
                  <p className="text-sm text-red-700">Rising Prices</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
