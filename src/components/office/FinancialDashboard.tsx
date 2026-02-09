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
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { OverheadManagement } from './OverheadManagement';
import { JobBudgetManagement } from './JobBudgetManagement';
import { ProfitabilityReports } from './ProfitabilityReports';

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
  
  // Date range for financial overview (default: current month)
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  });

  useEffect(() => {
    loadFinancialData();
  }, [dateRange]);

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

  async function loadJobActuals() {
    // Calculate actual costs from time entries and materials
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id')
      .eq('status', 'active');

    if (jobsError) throw jobsError;

    const actuals: JobActuals[] = [];

    for (const job of jobs || []) {
      // Get actual labor hours and costs (from time_entries)
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', job.id);

      const actualLaborHours = timeEntries?.reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0) || 0;

      // Assume $30/hr average labor rate for actual cost calculation
      const actualLaborCost = actualLaborHours * 30;

      // Get actual materials costs
      const { data: materials } = await supabase
        .from('materials')
        .select('total_cost')
        .eq('job_id', job.id);

      const actualMaterialsCost = materials?.reduce((sum, m) => sum + (m.total_cost || 0), 0) || 0;

      // Get actual subcontractor costs (from subcontractor_schedules - would need cost field)
      const actualSubcontractorCost = 0; // Placeholder

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

  // Calculate financial metrics
  const totalOverhead = overheadExpenses.reduce((sum, exp) => {
    if (exp.frequency === 'monthly') {
      // Calculate how many months in the date range
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

  // Jobs with budget variance issues
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financial Management</h1>
        <p className="text-gray-600 mt-2">Track overhead, job budgets, and profitability</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="overhead">Overhead</TabsTrigger>
          <TabsTrigger value="budgets">Job Budgets</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics Cards */}
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

          {/* Budget Alerts */}
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

          {/* Quick Actions */}
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

        {/* Overhead Tab */}
        <TabsContent value="overhead">
          <OverheadManagement onUpdate={loadFinancialData} />
        </TabsContent>

        {/* Job Budgets Tab */}
        <TabsContent value="budgets">
          <JobBudgetManagement onUpdate={loadFinancialData} />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <ProfitabilityReports 
            jobBudgets={jobBudgets}
            jobActuals={jobActuals}
            overheadExpenses={overheadExpenses}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
