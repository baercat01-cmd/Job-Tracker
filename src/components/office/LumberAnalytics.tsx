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
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Package,
  Minus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

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

  const categoryMaterials = useMemo(() => {
    return materials.filter(m => m.category === category);
  }, [materials, category]);

  function getFilteredPrices(): PriceEntry[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));
    return prices.filter(p => new Date(p.effective_date) >= cutoffDate);
  }

  function getLatestPrice(materialId: string): number | null {
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

  function getOverviewData() {
    return categoryMaterials.map(material => {
      const latestPrice = getLatestPrice(material.id);
      const trend = getPriceTrend(material.id);
      const vendorComparison = getVendorComparisonData(material.id);
      const bestVendor = vendorComparison.sort((a, b) => a.latestPrice - b.latestPrice)[0];

      return {
        material,
        latestPrice,
        trend,
        bestVendor: bestVendor?.vendor || 'N/A',
        bestPrice: bestVendor?.latestPrice || null,
        allVendorPrices: vendorComparison,
      };
    });
  }

  function getBestValueVendors(materialId: string) {
    const comparison = getVendorComparisonData(materialId);
    return comparison.sort((a, b) => a.latestPrice - b.latestPrice).slice(0, 5);
  }

  const overviewData = getOverviewData();
  const trendCounts = {
    up: categoryMaterials.filter(m => getPriceTrend(m.id) === 'up').length,
    down: categoryMaterials.filter(m => getPriceTrend(m.id) === 'down').length,
    stable: categoryMaterials.filter(m => getPriceTrend(m.id) === 'stable').length,
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            {category === 'lumber' ? 'Lumber' : 'Rebar'} Analytics & Pricing
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Unified view of all materials with vendor pricing and market trends
          </p>
        </div>

        <div className="flex gap-2">
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
        </div>
      </div>

      {/* Market Trends Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingDown className="w-6 h-6 mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold text-green-900">{trendCounts.down}</p>
            <p className="text-xs text-green-700">Falling</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-3 text-center">
            <Minus className="w-6 h-6 mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold text-blue-900">{trendCounts.stable}</p>
            <p className="text-xs text-blue-700">Stable</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1 text-red-600" />
            <p className="text-2xl font-bold text-red-900">{trendCounts.up}</p>
            <p className="text-xs text-red-700">Rising</p>
          </CardContent>
        </Card>
      </div>

      {/* Unified Materials & Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5" />
            All {category === 'lumber' ? 'Lumber' : 'Rebar'} - Materials & Vendor Pricing
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Click any row for detailed price history and charts
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[calc(100vh-350px)] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10">
                <tr className="border-b-2">
                  <th className="text-left p-2 font-semibold w-48">Material</th>
                  <th className="text-center p-2 font-semibold w-16">Len</th>
                  <th className="text-center p-2 font-semibold w-20">Trend</th>
                  {vendors.map(vendor => (
                    <th key={vendor.id} className="text-right p-2 font-semibold w-24">
                      {vendor.name}
                    </th>
                  ))}
                  <th className="text-right p-2 font-semibold w-28 bg-green-100">Best Price</th>
                </tr>
              </thead>
              <tbody>
                {overviewData.length === 0 ? (
                  <tr>
                    <td colSpan={vendors.length + 4} className="text-center py-12 text-muted-foreground">
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
                      <td className="p-2 font-medium text-sm">{data.material.name}</td>
                      <td className="p-2 text-center font-semibold text-blue-700 text-sm">
                        {data.material.standard_length}'
                      </td>
                      <td className="p-2 text-center">
                        {data.trend === 'up' && (
                          <Badge className="bg-red-100 text-red-800 border-red-300 text-xs px-1 py-0">
                            <TrendingUp className="w-3 h-3" />
                          </Badge>
                        )}
                        {data.trend === 'down' && (
                          <Badge className="bg-green-100 text-green-800 border-green-300 text-xs px-1 py-0">
                            <TrendingDown className="w-3 h-3" />
                          </Badge>
                        )}
                        {data.trend === 'stable' && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs px-1 py-0">
                            <Minus className="w-3 h-3" />
                          </Badge>
                        )}
                      </td>
                      {vendors.map(vendor => {
                        const vendorPrice = data.allVendorPrices.find(v => v.vendor === vendor.name);
                        return (
                          <td key={vendor.id} className="p-2 text-right font-mono text-sm">
                            {vendorPrice ? (
                              <span className="font-semibold">${vendorPrice.latestPrice.toFixed(2)}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-right font-mono font-bold text-green-700 bg-green-50">
                        {data.bestPrice ? `$${data.bestPrice.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Material Detail Dialog */}
      {selectedMaterialForDetail && (
        <Dialog open={!!selectedMaterialForDetail} onOpenChange={() => setSelectedMaterialForDetail(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {selectedMaterialForDetail.name} - Detailed Analysis
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Material Info */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-semibold">{selectedMaterialForDetail.category}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Length</p>
                  <p className="font-semibold">{selectedMaterialForDetail.standard_length}'</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit</p>
                  <p className="font-semibold">{selectedMaterialForDetail.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trend</p>
                  <div className="mt-1">
                    {getPriceTrend(selectedMaterialForDetail.id) === 'up' && (
                      <Badge className="bg-red-100 text-red-800 border-red-300">Rising</Badge>
                    )}
                    {getPriceTrend(selectedMaterialForDetail.id) === 'down' && (
                      <Badge className="bg-green-100 text-green-800 border-green-300">Falling</Badge>
                    )}
                    {getPriceTrend(selectedMaterialForDetail.id) === 'stable' && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300">Stable</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Price History Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Price History ({timeRange} days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={getPriceHistoryChart(selectedMaterialForDetail.id)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                      <YAxis tickFormatter={(value) => `$${value}`} style={{ fontSize: '12px' }} />
                      <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                      <Legend />
                      {vendors.map((vendor, idx) => (
                        <Line
                          key={vendor.id}
                          type="monotone"
                          dataKey={vendor.name}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
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
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Vendor Price Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={getBestValueVendors(selectedMaterialForDetail.id)} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(value) => `$${value}`} style={{ fontSize: '12px' }} />
                        <YAxis dataKey="vendor" type="category" width={100} style={{ fontSize: '12px' }} />
                        <Tooltip formatter={(value: any) => `$${value.toFixed(2)}`} />
                        <Bar dataKey="latestPrice" fill="#00C49F" name="Latest Price">
                          {getBestValueVendors(selectedMaterialForDetail.id).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left p-2 font-semibold">Vendor</th>
                            <th className="text-right p-2 font-semibold">Latest</th>
                            <th className="text-right p-2 font-semibold">Avg</th>
                            <th className="text-center p-2 font-semibold">Rank</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getBestValueVendors(selectedMaterialForDetail.id).map((vendor, idx) => (
                            <tr key={idx} className={`hover:bg-slate-50 ${idx === 0 ? 'bg-green-50' : ''}`}>
                              <td className="p-2 font-medium">
                                {vendor.vendor}
                                {idx === 0 && (
                                  <Badge className="ml-2 bg-green-600 text-xs">Best</Badge>
                                )}
                              </td>
                              <td className="p-2 text-right font-mono font-bold">
                                ${vendor.latestPrice.toFixed(2)}
                              </td>
                              <td className="p-2 text-right font-mono">
                                ${vendor.avgPrice.toFixed(2)}
                              </td>
                              <td className="p-2 text-center">
                                <Badge variant={idx === 0 ? 'default' : 'secondary'} className="text-xs">
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
