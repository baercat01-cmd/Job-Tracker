import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Plus,
  Calendar,
  Building2,
  Briefcase,
  AlertCircle,
  BookOpen,
  Package,
  ShoppingCart,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { OverheadManagement } from './OverheadManagement';
import { JobBudgetManagement } from './JobBudgetManagement';
import { ProfitabilityReports } from './ProfitabilityReports';
import { ZohoDataManagement } from './ZohoDataManagement';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OverheadExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  frequency: string;
  notes: string | null;
}

interface JobBudget {
  id: string;
  job_id: string;
  estimated_labor_hours: number | null;
  labor_rate_per_hour: number | null;
  total_labor_budget: number | null;
  total_materials_budget: number | null;
  total_subcontractor_budget: number | null;
  total_equipment_budget: number | null;
  other_costs: number | null;
  total_quoted_price: number;
  overhead_allocation: number | null;
  target_profit_margin: number | null;
  job: {
    name: string;
    job_number: string | null;
    status: string;
  };
}

interface JobActuals {
  job_id: string;
  actual_labor_hours: number;
  actual_labor_cost: number;
  actual_materials_cost: number;
  actual_subcontractor_cost: number;
}

export function FinancialDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [overheadExpenses, setOverheadExpenses] = useState<OverheadExpense[]>([]);
  const [jobBudgets, setJobBudgets] = useState<JobBudget[]>([]);
  const [jobActuals, setJobActuals] = useState<JobActuals[]>([]);
  const [showBooksDialog, setShowBooksDialog] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobForOrders, setSelectedJobForOrders] = useState<string | null>(null);
  const [jobOrders, setJobOrders] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  
  // Date range for financial overview (default: current month)
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  });

  useEffect(() => {
    loadFinancialData();
    loadJobs();
    loadAllOrders();
  }, [dateRange]);

  useEffect(() => {
    if (selectedJobForOrders) {
      loadJobOrders(selectedJobForOrders);
    }
  }, [selectedJobForOrders]);

  async function loadFinancialData() {
    setLoading(true);
    try {
      await Promise.all([
        loadOverheadExpenses(),
        loadJobBudgets(),
        loadJobActuals()
      ]);
    } catch (error) {
      console.error('Error loading financial data:', error);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }

  async function loadOverheadExpenses() {
    const { data, error } = await supabase
      .from('overhead_expenses')
      .select('*')
      .gte('expense_date', dateRange.start.toISOString().split('T')[0])
      .lte('expense_date', dateRange.end.toISOString().split('T')[0])
      .order('expense_date', { ascending: false });

    if (error) throw error;
    setOverheadExpenses(data || []);
  }

  async function loadJobBudgets() {
    const { data, error } = await supabase
      .from('job_budgets')
      .select(`
        *,
        job:jobs(name, job_number, status)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setJobBudgets(data || []);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .in('status', ['active', 'prepping', 'quoting'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    setJobs(data || []);
  }

  async function loadJobOrders(jobId: string) {
    try {
      const { data, error } = await supabase
        .from('material_items')
        .select(`
          *,
          sheet:material_sheets!inner(
            id,
            sheet_name,
            workbook:material_workbooks!inner(
              job_id
            )
          )
        `)
        .eq('sheet.workbook.job_id', jobId)
        .or('zoho_sales_order_id.not.is.null,zoho_purchase_order_id.not.is.null')
        .order('ordered_at', { ascending: false });

      if (error) throw error;

      const ordersMap = new Map();

      data?.forEach(item => {
        if (item.zoho_sales_order_id && item.zoho_sales_order_number) {
          const key = `SO-${item.zoho_sales_order_number}`;
          if (!ordersMap.has(key)) {
            ordersMap.set(key, {
              type: 'Sales Order',
              number: item.zoho_sales_order_number,
              id: item.zoho_sales_order_id,
              items: [],
              total: 0
            });
          }
          const order = ordersMap.get(key);
          order.items.push(item);
          order.total += item.extended_price || 0;
        }

        if (item.zoho_purchase_order_id && item.zoho_purchase_order_number) {
          const key = `PO-${item.zoho_purchase_order_number}`;
          if (!ordersMap.has(key)) {
            ordersMap.set(key, {
              type: 'Purchase Order',
              number: item.zoho_purchase_order_number,
              id: item.zoho_purchase_order_id,
              items: [],
              total: 0
            });
          }
          const order = ordersMap.get(key);
          order.items.push(item);
          order.total += item.extended_cost || 0;
        }
      });

      setJobOrders(Array.from(ordersMap.values()));
    } catch (error: any) {
      console.error('Error loading job orders:', error);
      toast.error('Failed to load job orders');
    }
  }

  async function loadAllOrders() {
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from('material_items')
        .select(`
          *,
          sheet:material_sheets!inner(
            id,
            sheet_name,
            workbook:material_workbooks!inner(
              job_id,
              job:jobs!inner(
                id,
                name,
                job_number,
                client_name
              )
            )
          )
        `)
        .or('zoho_sales_order_id.not.is.null,zoho_purchase_order_id.not.is.null')
        .order('ordered_at', { ascending: false });

      if (error) throw error;

      const ordersMap = new Map();

      data?.forEach(item => {
        const job = item.sheet.workbook.job;
        
        if (item.zoho_sales_order_id && item.zoho_sales_order_number) {
          const key = `SO-${item.zoho_sales_order_number}`;
          if (!ordersMap.has(key)) {
            ordersMap.set(key, {
              type: 'Sales Order',
              number: item.zoho_sales_order_number,
              id: item.zoho_sales_order_id,
              job: job,
              items: [],
              total: 0,
              orderedAt: item.ordered_at
            });
          }
          const order = ordersMap.get(key);
          order.items.push(item);
          order.total += item.extended_price || 0;
        }

        if (item.zoho_purchase_order_id && item.zoho_purchase_order_number) {
          const key = `PO-${item.zoho_purchase_order_number}`;
          if (!ordersMap.has(key)) {
            ordersMap.set(key, {
              type: 'Purchase Order',
              number: item.zoho_purchase_order_number,
              id: item.zoho_purchase_order_id,
              job: job,
              items: [],
              total: 0,
              orderedAt: item.ordered_at
            });
          }
          const order = ordersMap.get(key);
          order.items.push(item);
          order.total += item.extended_cost || 0;
        }
      });

      setAllOrders(Array.from(ordersMap.values()));
    } catch (error: any) {
      console.error('Error loading all orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadJobActuals() {
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id')
      .eq('status', 'active');

    if (jobsError) throw jobsError;

    const actuals: JobActuals[] = [];

    for (const job of jobs || []) {
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', job.id);

      const actualLaborHours = timeEntries?.reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0) || 0;

      const actualLaborCost = actualLaborHours * 30;

      const { data: materials } = await supabase
        .from('materials')
        .select('total_cost')
        .eq('job_id', job.id);

      const actualMaterialsCost = materials?.reduce((sum, m) => sum + (m.total_cost || 0), 0) || 0;
      const actualSubcontractorCost = 0;

      actuals.push({
        job_id: job.id,
        actual_labor_hours: actualLaborHours,
        actual_labor_cost: actualLaborCost,
        actual_materials_cost: actualMaterialsCost,
        actual_subcontractor_cost: actualSubcontractorCost
      });
    }

    setJobActuals(actuals);
  }

  const totalOverhead = overheadExpenses.reduce((sum, exp) => {
    if (exp.frequency === 'monthly') {
      const months = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24 * 30));
      return sum + (exp.amount * months);
    } else if (exp.frequency === 'annual') {
      const years = (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24 * 365);
      return sum + (exp.amount * years);
    }
    return sum + exp.amount;
  }, 0);

  const totalQuotedRevenue = jobBudgets.reduce((sum, budget) => 
    sum + budget.total_quoted_price, 0);

  const totalBudgetedCosts = jobBudgets.reduce((sum, budget) => 
    sum + (budget.total_labor_budget || 0) + 
          (budget.total_materials_budget || 0) + 
          (budget.total_subcontractor_budget || 0) + 
          (budget.total_equipment_budget || 0) + 
          (budget.other_costs || 0), 0);

  const totalActualCosts = jobActuals.reduce((sum, actual) => 
    sum + actual.actual_labor_cost + 
          actual.actual_materials_cost + 
          actual.actual_subcontractor_cost, 0);

  const estimatedProfit = totalQuotedRevenue - totalBudgetedCosts - totalOverhead;
  const actualProfit = totalQuotedRevenue - totalActualCosts - totalOverhead;
  const profitMargin = totalQuotedRevenue > 0 
    ? ((estimatedProfit / totalQuotedRevenue) * 100) 
    : 0;

  const jobsOverBudget = jobBudgets.filter(budget => {
    const actual = jobActuals.find(a => a.job_id === budget.job_id);
    if (!actual) return false;
    
    const totalActual = actual.actual_labor_cost + actual.actual_materials_cost + actual.actual_subcontractor_cost;
    const totalBudget = (budget.total_labor_budget || 0) + 
                        (budget.total_materials_budget || 0) + 
                        (budget.total_subcontractor_budget || 0) + 
                        (budget.total_equipment_budget || 0);
    
    return totalActual > totalBudget;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-mb-success border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financial Management</h1>
        <p className="text-gray-600 mt-2">Track overhead, job budgets, and profitability</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowBooksDialog(true)} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
          <BookOpen className="w-4 h-4 mr-2" />
          Books
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">All Orders</TabsTrigger>
          <TabsTrigger value="overhead">Overhead</TabsTrigger>
          <TabsTrigger value="budgets">Job Budgets</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Revenue (Quoted)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-mb-success">
                  ${totalQuotedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-gray-500 mt-1">{jobBudgets.length} jobs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Overhead</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-mb-warning">
                  ${totalOverhead.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-gray-500 mt-1">{overheadExpenses.length} expenses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Estimated Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${estimatedProfit >= 0 ? 'text-mb-success' : 'text-mb-error'}`}>
                  ${estimatedProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {profitMargin >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-mb-success" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-mb-error" />
                  )}
                  <span className={`text-xs ${profitMargin >= 0 ? 'text-mb-success' : 'text-mb-error'}`}>
                    {profitMargin.toFixed(1)}% margin
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Budget Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-mb-error">
                  {jobsOverBudget.length}
                </div>
                <p className="text-xs text-gray-500 mt-1">Jobs over budget</p>
              </CardContent>
            </Card>
          </div>

          {jobsOverBudget.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-mb-error">
                  <AlertCircle className="w-5 h-5" />
                  Jobs Over Budget
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {jobsOverBudget.map(budget => {
                    const actual = jobActuals.find(a => a.job_id === budget.job_id);
                    const totalActual = actual 
                      ? actual.actual_labor_cost + actual.actual_materials_cost + actual.actual_subcontractor_cost 
                      : 0;
                    const totalBudget = (budget.total_labor_budget || 0) + 
                                      (budget.total_materials_budget || 0) + 
                                      (budget.total_subcontractor_budget || 0) + 
                                      (budget.total_equipment_budget || 0);
                    const variance = totalActual - totalBudget;
                    const variancePercent = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;

                    return (
                      <div key={budget.id} className="flex items-center justify-between p-3 bg-white rounded border border-red-200">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {budget.job.job_number ? `${budget.job.job_number} - ` : ''}{budget.job.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            Budget: ${totalBudget.toFixed(2)} | Actual: ${totalActual.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-mb-error">
                            +${variance.toFixed(2)}
                          </div>
                          <div className="text-xs text-mb-error">
                            {variancePercent.toFixed(1)}% over
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('overhead')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-mb-warning" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Manage Overhead</div>
                    <div className="text-sm text-gray-600">Track business expenses</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('budgets')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-mb-blue" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Job Budgets</div>
                    <div className="text-sm text-gray-600">Set and track budgets</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('reports')}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-mb-success" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">View Reports</div>
                    <div className="text-sm text-gray-600">Profitability analysis</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 font-medium">Total Sales Orders</p>
                    <p className="text-2xl font-bold text-green-800">
                      ${allOrders.filter(o => o.type === 'Sales Order').reduce((sum, o) => sum + o.total, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {allOrders.filter(o => o.type === 'Sales Order').length} orders
                    </p>
                  </div>
                  <ShoppingCart className="w-8 h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700 font-medium">Total Purchase Orders</p>
                    <p className="text-2xl font-bold text-blue-800">
                      ${allOrders.filter(o => o.type === 'Purchase Order').reduce((sum, o) => sum + o.total, 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {allOrders.filter(o => o.type === 'Purchase Order').length} orders
                    </p>
                  </div>
                  <Package className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-700 font-medium">Total Orders</p>
                    <p className="text-2xl font-bold text-purple-800">
                      {allOrders.length}
                    </p>
                    <p className="text-xs text-purple-600 mt-1">
                      Across all jobs
                    </p>
                  </div>
                  <Briefcase className="w-8 h-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-700 font-medium">Net Difference</p>
                    <p className="text-2xl font-bold text-orange-800">
                      ${(
                        allOrders.filter(o => o.type === 'Sales Order').reduce((sum, o) => sum + o.total, 0) -
                        allOrders.filter(o => o.type === 'Purchase Order').reduce((sum, o) => sum + o.total, 0)
                      ).toLocaleString()}
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      SO - PO
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  All Sales Orders & Purchase Orders
                </CardTitle>
                <Badge variant="secondary">
                  {allOrders.length} Total Orders
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {ordersLoading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading orders...</p>
                </div>
              ) : allOrders.length > 0 ? (
                <div className="space-y-4">
                  {allOrders.map((order, idx) => (
                    <Card key={idx} className={order.type === 'Sales Order' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={order.type === 'Sales Order' ? 'bg-green-600' : 'bg-blue-600'}>
                                {order.type}
                              </Badge>
                              <a
                                href={`https://books.zoho.com/app/60007115224#/${order.type === 'Sales Order' ? 'salesorders' : 'purchaseorders'}/${order.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-lg font-bold text-blue-600 hover:text-blue-800 flex items-center gap-2"
                              >
                                {order.number}
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Briefcase className="w-4 h-4" />
                              <span className="font-medium">
                                {order.job.job_number ? `#${order.job.job_number} - ` : ''}
                                {order.job.name}
                              </span>
                              <span>({order.job.client_name})</span>
                            </div>
                            {order.orderedAt && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <Calendar className="w-3 h-3" />
                                Ordered: {new Date(order.orderedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Total</div>
                            <div className="text-xl font-bold text-gray-900">
                              ${order.total.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {order.items.length} items
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <details className="cursor-pointer">
                          <summary className="text-sm font-medium text-blue-600 hover:text-blue-800">
                            View Material Details ({order.items.length} items)
                          </summary>
                          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                            {order.items.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border">
                                <div className="flex-1">
                                  <div className="font-medium">{item.material_name}</div>
                                  {item.sku && <div className="text-muted-foreground">SKU: {item.sku}</div>}
                                </div>
                                <div className="text-right">
                                  <div className="font-semibold">Qty: {item.quantity}</div>
                                  <div className="text-muted-foreground">
                                    ${(order.type === 'Sales Order' ? item.extended_price : item.extended_cost)?.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">No orders found</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Orders will appear here once materials are synced with Zoho Books
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overhead">
          <OverheadManagement onUpdate={loadFinancialData} />
        </TabsContent>

        <TabsContent value="budgets">
          <JobBudgetManagement onUpdate={loadFinancialData} />
        </TabsContent>

        <TabsContent value="reports">
          <ProfitabilityReports 
            jobBudgets={jobBudgets}
            jobActuals={jobActuals}
            overheadExpenses={overheadExpenses}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={showBooksDialog} onOpenChange={setShowBooksDialog}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-600" />
              Zoho Books Integration
            </DialogTitle>
          </DialogHeader>
          <ZohoDataManagement />
        </DialogContent>
      </Dialog>
    </div>
  );
}
