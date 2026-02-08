import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, TrendingDown, DollarSign, Clock, AlertTriangle } from 'lucide-react';

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

interface OverheadExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  frequency: string;
}

interface ProfitabilityReportsProps {
  jobBudgets: JobBudget[];
  jobActuals: JobActuals[];
  overheadExpenses: OverheadExpense[];
}

export function ProfitabilityReports({ jobBudgets, jobActuals, overheadExpenses }: ProfitabilityReportsProps) {
  const [selectedJobId, setSelectedJobId] = useState<string>('all');

  // Calculate metrics for a specific job
  const calculateJobMetrics = (budget: JobBudget) => {
    const actual = jobActuals.find(a => a.job_id === budget.job_id);
    
    const budgetedCosts = 
      (budget.total_labor_budget || 0) +
      (budget.total_materials_budget || 0) +
      (budget.total_subcontractor_budget || 0) +
      (budget.total_equipment_budget || 0) +
      (budget.other_costs || 0);

    const actualCosts = actual
      ? actual.actual_labor_cost + actual.actual_materials_cost + actual.actual_subcontractor_cost
      : 0;

    const budgetVariance = actualCosts - budgetedCosts;
    const budgetVariancePercent = budgetedCosts > 0 ? (budgetVariance / budgetedCosts) * 100 : 0;

    const estimatedProfit = budget.total_quoted_price - budgetedCosts - (budget.overhead_allocation || 0);
    const actualProfit = budget.total_quoted_price - actualCosts - (budget.overhead_allocation || 0);
    const profitVariance = actualProfit - estimatedProfit;

    const estimatedMargin = budget.total_quoted_price > 0 ? (estimatedProfit / budget.total_quoted_price) * 100 : 0;
    const actualMargin = budget.total_quoted_price > 0 ? (actualProfit / budget.total_quoted_price) * 100 : 0;

    const laborEfficiency = budget.estimated_labor_hours && actual?.actual_labor_hours
      ? ((budget.estimated_labor_hours - actual.actual_labor_hours) / budget.estimated_labor_hours) * 100
      : 0;

    return {
      budgetedCosts,
      actualCosts,
      budgetVariance,
      budgetVariancePercent,
      estimatedProfit,
      actualProfit,
      profitVariance,
      estimatedMargin,
      actualMargin,
      laborEfficiency,
      hasActuals: !!actual
    };
  };

  // Overall business metrics
  const totalRevenue = jobBudgets.reduce((sum, b) => sum + b.total_quoted_price, 0);
  const totalBudgetedCosts = jobBudgets.reduce((sum, b) => 
    sum + (b.total_labor_budget || 0) + (b.total_materials_budget || 0) + 
    (b.total_subcontractor_budget || 0) + (b.total_equipment_budget || 0) + (b.other_costs || 0), 0);
  const totalActualCosts = jobActuals.reduce((sum, a) => 
    sum + a.actual_labor_cost + a.actual_materials_cost + a.actual_subcontractor_cost, 0);
  const totalOverhead = overheadExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalActualCosts - totalOverhead;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const filteredBudgets = selectedJobId === 'all' 
    ? jobBudgets 
    : jobBudgets.filter(b => b.job_id === selectedJobId);

  return (
    <div className="space-y-6">
      {/* Overall Business Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Costs (Actual)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              ${totalActualCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Overhead</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ${totalOverhead.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {netProfit >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netMargin.toFixed(1)}% margin
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Filter */}
      <div className="flex items-center gap-4">
        <Label className="font-semibold">Filter by Job:</Label>
        <Select value={selectedJobId} onValueChange={setSelectedJobId}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {jobBudgets.map((budget) => (
              <SelectItem key={budget.job_id} value={budget.job_id}>
                {budget.job.job_number ? `${budget.job.job_number} - ` : ''}{budget.job.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Job Profitability Cards */}
      <div className="space-y-4">
        {filteredBudgets.map((budget) => {
          const metrics = calculateJobMetrics(budget);

          return (
            <Card key={budget.id} className={`border-2 ${
              metrics.actualMargin < 10 ? 'border-red-200 bg-red-50' :
              metrics.actualMargin < 15 ? 'border-yellow-200 bg-yellow-50' :
              'border-green-200 bg-green-50'
            }`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{budget.job.job_number ? `${budget.job.job_number} - ` : ''}{budget.job.name}</span>
                  <span className={`text-xl ${metrics.actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${metrics.actualProfit.toFixed(2)} profit
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Revenue & Costs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Quoted Price</div>
                    <div className="text-lg font-bold text-green-600">${budget.total_quoted_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Budgeted Costs</div>
                    <div className="text-lg font-semibold text-gray-900">${metrics.budgetedCosts.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Actual Costs</div>
                    <div className={`text-lg font-semibold ${metrics.hasActuals ? 'text-gray-900' : 'text-gray-400'}`}>
                      ${metrics.actualCosts.toFixed(2)}
                      {!metrics.hasActuals && <span className="text-xs ml-1">(pending)</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Budget Variance</div>
                    <div className={`text-lg font-semibold ${
                      metrics.budgetVariance > 0 ? 'text-red-600' : 
                      metrics.budgetVariance < 0 ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {metrics.budgetVariance > 0 ? '+' : ''}${metrics.budgetVariance.toFixed(2)}
                      {metrics.hasActuals && (
                        <span className="text-xs ml-1">({metrics.budgetVariancePercent.toFixed(1)}%)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profitability Metrics */}
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Estimated Profit</div>
                      <div className="text-lg font-semibold text-gray-900">${metrics.estimatedProfit.toFixed(2)}</div>
                      <div className="text-xs text-gray-500">{metrics.estimatedMargin.toFixed(1)}% margin</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Actual Profit</div>
                      <div className={`text-lg font-bold ${metrics.actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${metrics.actualProfit.toFixed(2)}
                      </div>
                      <div className={`text-xs ${metrics.actualMargin >= 15 ? 'text-green-600' : metrics.actualMargin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {metrics.actualMargin.toFixed(1)}% margin
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Profit Variance</div>
                      <div className={`text-lg font-semibold ${
                        metrics.profitVariance >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metrics.profitVariance >= 0 ? '+' : ''}${metrics.profitVariance.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Labor Efficiency</div>
                      <div className={`text-lg font-semibold ${
                        metrics.laborEfficiency > 0 ? 'text-green-600' :
                        metrics.laborEfficiency < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {metrics.laborEfficiency > 0 ? '+' : ''}{metrics.laborEfficiency.toFixed(1)}%
                      </div>
                      {budget.estimated_labor_hours && (
                        <div className="text-xs text-gray-500">Est: {budget.estimated_labor_hours} hrs</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Alerts */}
                {(metrics.budgetVariance > 0 || metrics.actualMargin < 10) && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-100 border border-yellow-300 rounded">
                    <AlertTriangle className="w-5 h-5 text-yellow-700 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      {metrics.budgetVariance > 0 && (
                        <div>• Job is over budget by ${metrics.budgetVariance.toFixed(2)} ({metrics.budgetVariancePercent.toFixed(1)}%)</div>
                      )}
                      {metrics.actualMargin < 10 && (
                        <div>• Profit margin is below target ({metrics.actualMargin.toFixed(1)}% vs {budget.target_profit_margin || 15}% target)</div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Label({ className, ...props }: React.HTMLAttributes<HTMLLabelElement>) {
  return <label className={className} {...props} />;
}
