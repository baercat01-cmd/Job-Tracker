import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  Download,
  Trash2,
  CheckCircle2,
  Calculator,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  status: string;
  color: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface CatalogItem {
  sku: string;
  material_name: string;
  part_length: string;
  unit_price: number | null;
  purchase_cost: number | null;
}

interface JobCostData {
  job: Job;
  totalEstimated: number;
  totalActual: number;
  variance: number;
  variancePercent: number;
  matchedCount: number;
  unmatchedCount: number;
  categoryBreakdown: CategoryCost[];
  wasteMetrics: WasteMetrics;
}

interface CategoryCost {
  category: string;
  estimatedCost: number;
  actualCost: number;
  materialCount: number;
}

interface WasteMetrics {
  ordered: number;
  atShop: number;
  atJob: number;
  installed: number;
  missing: number;
  wasteRate: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658', '#ff7c7c'];

export function MaterialsCostAnalytics() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [costData, setCostData] = useState<JobCostData[]>([]);
  const [catalog, setCatalog] = useState<Map<string, CatalogItem>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (jobs.length > 0 && catalog.size > 0) {
      analyzeCosts();
    }
  }, [jobs, catalog, selectedJobId]);

  async function loadData() {
    try {
      setLoading(true);

      // Load all active jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (jobsError) throw jobsError;

      // Load materials catalog
      const { data: catalogData, error: catalogError } = await supabase
        .from('materials_catalog')
        .select('*');

      if (catalogError) throw catalogError;

      // Build catalog lookup map
      const catalogMap = new Map<string, CatalogItem>();
      catalogData?.forEach(item => {
        const key = `${item.material_name}|${item.part_length || ''}`.toLowerCase();
        catalogMap.set(key, item);
      });

      setJobs(jobsData || []);
      setCatalog(catalogMap);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load cost data');
    } finally {
      setLoading(false);
    }
  }

  async function analyzeCosts() {
    try {
      const jobsToAnalyze = selectedJobId === 'all' 
        ? jobs 
        : jobs.filter(j => j.id === selectedJobId);

      const analysisResults: JobCostData[] = [];

      for (const job of jobsToAnalyze) {
        // Load materials for this job
        const { data: materials, error: materialsError } = await supabase
          .from('materials')
          .select('*')
          .eq('job_id', job.id);

        if (materialsError) throw materialsError;

        // Load categories
        const { data: categories, error: categoriesError } = await supabase
          .from('materials_categories')
          .select('*')
          .eq('job_id', job.id);

        if (categoriesError) throw categoriesError;

        const categoryMap = new Map<string, string>();
        categories?.forEach(cat => categoryMap.set(cat.id, cat.name));

        // Calculate costs
        let totalEstimated = 0;
        let totalActual = 0;
        let matchedCount = 0;
        let unmatchedCount = 0;
        const categoryBreakdown = new Map<string, CategoryCost>();
        const wasteMetrics: WasteMetrics = {
          ordered: 0,
          atShop: 0,
          atJob: 0,
          installed: 0,
          missing: 0,
          wasteRate: 0,
        };

        materials?.forEach(material => {
          const key = `${material.name}|${material.length || ''}`.toLowerCase();
          const catalogItem = catalog.get(key);
          const price = catalogItem?.purchase_cost || catalogItem?.unit_price || 0;
          const extendedCost = price * material.quantity;

          if (catalogItem) {
            matchedCount++;
            totalEstimated += extendedCost;
            
            // Only count as actual if ordered or further along
            if (['ordered', 'at_shop', 'ready_to_pull', 'at_job', 'installed'].includes(material.status)) {
              totalActual += extendedCost;
            }
          } else {
            unmatchedCount++;
          }

          // Category breakdown
          const categoryName = categoryMap.get(material.category_id) || 'Uncategorized';
          if (!categoryBreakdown.has(categoryName)) {
            categoryBreakdown.set(categoryName, {
              category: categoryName,
              estimatedCost: 0,
              actualCost: 0,
              materialCount: 0,
            });
          }
          
          const catData = categoryBreakdown.get(categoryName)!;
          catData.estimatedCost += extendedCost;
          if (['ordered', 'at_shop', 'ready_to_pull', 'at_job', 'installed'].includes(material.status)) {
            catData.actualCost += extendedCost;
          }
          catData.materialCount++;

          // Waste metrics
          switch (material.status) {
            case 'ordered':
              wasteMetrics.ordered++;
              break;
            case 'at_shop':
            case 'ready_to_pull':
              wasteMetrics.atShop++;
              break;
            case 'at_job':
              wasteMetrics.atJob++;
              break;
            case 'installed':
              wasteMetrics.installed++;
              break;
            case 'missing':
              wasteMetrics.missing++;
              break;
          }
        });

        // Calculate waste rate (materials not installed vs total materials)
        const totalMaterials = materials?.length || 0;
        wasteMetrics.wasteRate = totalMaterials > 0 
          ? ((totalMaterials - wasteMetrics.installed) / totalMaterials) * 100 
          : 0;

        const variance = totalActual - totalEstimated;
        const variancePercent = totalEstimated > 0 
          ? (variance / totalEstimated) * 100 
          : 0;

        analysisResults.push({
          job,
          totalEstimated,
          totalActual,
          variance,
          variancePercent,
          matchedCount,
          unmatchedCount,
          categoryBreakdown: Array.from(categoryBreakdown.values()).sort(
            (a, b) => b.estimatedCost - a.estimatedCost
          ),
          wasteMetrics,
        });
      }

      setCostData(analysisResults);
    } catch (error) {
      console.error('Error analyzing costs:', error);
      toast.error('Failed to analyze costs');
    }
  }

  function exportCostReport() {
    try {
      let csv = 'Job,Total Estimated,Total Actual,Variance,Variance %,Matched Items,Unmatched Items,Waste Rate %\n';
      
      costData.forEach(data => {
        csv += [
          data.job.name,
          `$${data.totalEstimated.toFixed(2)}`,
          `$${data.totalActual.toFixed(2)}`,
          `$${data.variance.toFixed(2)}`,
          `${data.variancePercent.toFixed(1)}%`,
          data.matchedCount,
          data.unmatchedCount,
          `${data.wasteMetrics.wasteRate.toFixed(1)}%`,
        ].join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Material_Cost_Analysis_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Cost report exported');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  }

  // Aggregate data for overview
  const aggregateData = costData.reduce(
    (acc, data) => ({
      totalEstimated: acc.totalEstimated + data.totalEstimated,
      totalActual: acc.totalActual + data.totalActual,
      variance: acc.variance + data.variance,
      matchedCount: acc.matchedCount + data.matchedCount,
      unmatchedCount: acc.unmatchedCount + data.unmatchedCount,
      avgWasteRate: acc.avgWasteRate + data.wasteMetrics.wasteRate,
    }),
    { totalEstimated: 0, totalActual: 0, variance: 0, matchedCount: 0, unmatchedCount: 0, avgWasteRate: 0 }
  );

  if (costData.length > 0) {
    aggregateData.avgWasteRate = aggregateData.avgWasteRate / costData.length;
  }

  const aggregateVariancePercent = aggregateData.totalEstimated > 0
    ? (aggregateData.variance / aggregateData.totalEstimated) * 100
    : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
          <p className="text-muted-foreground">Analyzing material costs...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Material Cost Analytics</h2>
          <p className="text-muted-foreground">
            Budget vs actual spending, cost breakdown, and waste tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedJobId} onValueChange={setSelectedJobId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {jobs.map(job => (
                <SelectItem key={job.id} value={job.id}>
                  {job.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={exportCostReport} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Estimated</p>
                <p className="text-2xl font-bold text-blue-600">
                  ${aggregateData.totalEstimated.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Actual</p>
                <p className="text-2xl font-bold text-green-600">
                  ${aggregateData.totalActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Variance</p>
                <p className={`text-2xl font-bold ${aggregateData.variance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {aggregateData.variance >= 0 ? '+' : ''}
                  ${aggregateData.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {aggregateVariancePercent >= 0 ? '+' : ''}{aggregateVariancePercent.toFixed(1)}%
                </p>
              </div>
              {aggregateData.variance >= 0 ? (
                <TrendingUp className="w-8 h-8 text-red-600 opacity-50" />
              ) : (
                <TrendingDown className="w-8 h-8 text-green-600 opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Waste Rate</p>
                <p className={`text-2xl font-bold ${aggregateData.avgWasteRate > 20 ? 'text-red-600' : 'text-green-600'}`}>
                  {aggregateData.avgWasteRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {aggregateData.unmatchedCount} unmatched
                </p>
              </div>
              <Trash2 className={`w-8 h-8 opacity-50 ${aggregateData.avgWasteRate > 20 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Budget vs Actual Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Budget vs Actual by Job</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costData.map(d => ({
                name: d.job.name.length > 20 ? d.job.name.substring(0, 20) + '...' : d.job.name,
                Estimated: d.totalEstimated,
                Actual: d.totalActual,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip formatter={(value) => `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                <Legend />
                <Bar dataKey="Estimated" fill="#3b82f6" />
                <Bar dataKey="Actual" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Breakdown Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {costData.length === 1 && costData[0].categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={costData[0].categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.category}: $${entry.estimatedCost.toFixed(0)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="estimatedCost"
                  >
                    {costData[0].categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Select a single job to view category breakdown
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Details Table */}
      <Card>
        <CardHeader>
          <CardTitle>Job Cost Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3">Job</th>
                  <th className="text-right p-3">Estimated</th>
                  <th className="text-right p-3">Actual</th>
                  <th className="text-right p-3">Variance</th>
                  <th className="text-center p-3">Matched</th>
                  <th className="text-center p-3">Waste Rate</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {costData.map(data => (
                  <tr key={data.job.id} className="border-t hover:bg-muted/50">
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{data.job.name}</p>
                        <p className="text-xs text-muted-foreground">{data.job.client_name}</p>
                      </div>
                    </td>
                    <td className="text-right p-3 font-semibold text-blue-600">
                      ${data.totalEstimated.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right p-3 font-semibold text-green-600">
                      ${data.totalActual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`text-right p-3 font-semibold ${data.variance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {data.variance >= 0 ? '+' : ''}${data.variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      <br />
                      <span className="text-xs">
                        ({data.variancePercent >= 0 ? '+' : ''}{data.variancePercent.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="text-center p-3">
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          {data.matchedCount} matched
                        </Badge>
                        {data.unmatchedCount > 0 && (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700">
                            {data.unmatchedCount} unmatched
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-center p-3">
                      <div className={`font-semibold ${data.wasteMetrics.wasteRate > 20 ? 'text-red-600' : 'text-green-600'}`}>
                        {data.wasteMetrics.wasteRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {data.wasteMetrics.installed} / {data.matchedCount + data.unmatchedCount} installed
                      </div>
                    </td>
                    <td className="text-center p-3">
                      <div className="flex flex-col gap-1">
                        {data.wasteMetrics.missing > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {data.wasteMetrics.missing} missing
                          </Badge>
                        )}
                        {data.wasteMetrics.atShop > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {data.wasteMetrics.atShop} at shop
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Insights & Recommendations */}
      <Card className="border-blue-500 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <AlertTriangle className="w-5 h-5" />
            Cost Insights & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-900">
          <ul className="space-y-2 text-sm">
            {aggregateData.unmatchedCount > 0 && (
              <li>• <strong>{aggregateData.unmatchedCount} materials</strong> are not matched to catalog pricing - consider updating the materials catalog for accurate cost tracking</li>
            )}
            {aggregateData.avgWasteRate > 20 && (
              <li>• <strong>High waste rate detected ({aggregateData.avgWasteRate.toFixed(1)}%)</strong> - review material ordering and installation processes</li>
            )}
            {aggregateData.variance > 0 && (
              <li>• <strong>Spending over budget by ${aggregateData.variance.toLocaleString()}</strong> - review material costs and purchasing strategies</li>
            )}
            {costData.some(d => d.wasteMetrics.missing > 0) && (
              <li>• <strong>Missing materials detected</strong> - investigate lost or damaged materials to reduce waste</li>
            )}
            {aggregateData.variance < 0 && (
              <li>• <strong>Under budget by ${Math.abs(aggregateData.variance).toLocaleString()}</strong> - good cost management!</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
