import { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash2, Briefcase, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Job {
  id: string;
  name: string;
  job_number: string | null;
  status: string;
}

interface JobBudget {
  id: string;
  job_id: string;
  estimated_labor_hours: number | null;
  labor_rate_per_hour: number | null;
  total_labor_budget: number | null;
  total_materials_budget: number | null;
  materials_breakdown: any[];
  total_subcontractor_budget: number | null;
  subcontractor_breakdown: any[];
  total_equipment_budget: number | null;
  equipment_breakdown: any[];
  other_costs: number | null;
  other_costs_notes: string | null;
  total_quoted_price: number;
  overhead_allocation: number | null;
  target_profit_margin: number | null;
  job: Job;
}

interface JobBudgetManagementProps {
  onUpdate: () => void;
}

export function JobBudgetManagement({ onUpdate }: JobBudgetManagementProps) {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<JobBudget[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingBudget, setEditingBudget] = useState<JobBudget | null>(null);
  const [selectedJobId, setSelectedJobId] = useState('');
  
  // Form state
  const [estimatedLaborHours, setEstimatedLaborHours] = useState('');
  const [laborRate, setLaborRate] = useState('30');
  const [totalMaterialsBudget, setTotalMaterialsBudget] = useState('');
  const [totalSubcontractorBudget, setTotalSubcontractorBudget] = useState('');
  const [totalEquipmentBudget, setTotalEquipmentBudget] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [otherCostsNotes, setOtherCostsNotes] = useState('');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [overheadAllocation, setOverheadAllocation] = useState('');
  const [targetMargin, setTargetMargin] = useState('15');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([loadBudgets(), loadJobs()]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadBudgets() {
    const { data, error } = await supabase
      .from('job_budgets')
      .select(`
        *,
        job:jobs(id, name, job_number, status)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setBudgets(data || []);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, name, job_number, status')
      .in('status', ['active', 'pending'])
      .order('name');

    if (error) throw error;
    setJobs(data || []);
  }

  function openDialog(budget?: JobBudget) {
    if (budget) {
      setEditingBudget(budget);
      setSelectedJobId(budget.job_id);
      setEstimatedLaborHours(budget.estimated_labor_hours?.toString() || '');
      setLaborRate(budget.labor_rate_per_hour?.toString() || '30');
      setTotalMaterialsBudget(budget.total_materials_budget?.toString() || '');
      setTotalSubcontractorBudget(budget.total_subcontractor_budget?.toString() || '');
      setTotalEquipmentBudget(budget.total_equipment_budget?.toString() || '');
      setOtherCosts(budget.other_costs?.toString() || '');
      setOtherCostsNotes(budget.other_costs_notes || '');
      setQuotedPrice(budget.total_quoted_price.toString());
      setOverheadAllocation(budget.overhead_allocation?.toString() || '');
      setTargetMargin(budget.target_profit_margin?.toString() || '15');
    } else {
      resetForm();
    }
    setShowDialog(true);
  }

  function resetForm() {
    setEditingBudget(null);
    setSelectedJobId('');
    setEstimatedLaborHours('');
    setLaborRate('30');
    setTotalMaterialsBudget('');
    setTotalSubcontractorBudget('');
    setTotalEquipmentBudget('');
    setOtherCosts('');
    setOtherCostsNotes('');
    setQuotedPrice('');
    setOverheadAllocation('');
    setTargetMargin('15');
  }

  async function saveBudget() {
    if (!selectedJobId || !quotedPrice) {
      toast.error('Please select a job and enter quoted price');
      return;
    }

    const quotedNum = parseFloat(quotedPrice);
    if (isNaN(quotedNum) || quotedNum <= 0) {
      toast.error('Please enter a valid quoted price');
      return;
    }

    // Calculate total labor budget
    const hours = parseFloat(estimatedLaborHours) || 0;
    const rate = parseFloat(laborRate) || 0;
    const laborBudget = hours * rate;

    try {
      const budgetData = {
        job_id: selectedJobId,
        estimated_labor_hours: hours || null,
        labor_rate_per_hour: rate || null,
        total_labor_budget: laborBudget || null,
        total_materials_budget: parseFloat(totalMaterialsBudget) || null,
        total_subcontractor_budget: parseFloat(totalSubcontractorBudget) || null,
        total_equipment_budget: parseFloat(totalEquipmentBudget) || null,
        other_costs: parseFloat(otherCosts) || null,
        other_costs_notes: otherCostsNotes || null,
        total_quoted_price: quotedNum,
        overhead_allocation: parseFloat(overheadAllocation) || null,
        target_profit_margin: parseFloat(targetMargin) || null,
        created_by: user?.id
      };

      if (editingBudget) {
        const { error } = await supabase
          .from('job_budgets')
          .update(budgetData)
          .eq('id', editingBudget.id);

        if (error) throw error;
        toast.success('Budget updated');
      } else {
        // Check if budget already exists for this job
        const { data: existing } = await supabase
          .from('job_budgets')
          .select('id')
          .eq('job_id', selectedJobId)
          .single();

        if (existing) {
          toast.error('Budget already exists for this job. Edit the existing budget instead.');
          return;
        }

        const { error } = await supabase
          .from('job_budgets')
          .insert([budgetData]);

        if (error) throw error;
        toast.success('Budget created');
      }

      setShowDialog(false);
      resetForm();
      await loadData();
      onUpdate();
    } catch (error) {
      console.error('Error saving budget:', error);
      toast.error('Failed to save budget');
    }
  }

  async function deleteBudget(id: string) {
    if (!confirm('Delete this budget?')) return;

    try {
      const { error } = await supabase
        .from('job_budgets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Budget deleted');
      await loadData();
      onUpdate();
    } catch (error) {
      console.error('Error deleting budget:', error);
      toast.error('Failed to delete budget');
    }
  }

  // Calculate total budgeted costs
  const calculateTotalCosts = () => {
    const hours = parseFloat(estimatedLaborHours) || 0;
    const rate = parseFloat(laborRate) || 0;
    const labor = hours * rate;
    const materials = parseFloat(totalMaterialsBudget) || 0;
    const subs = parseFloat(totalSubcontractorBudget) || 0;
    const equipment = parseFloat(totalEquipmentBudget) || 0;
    const other = parseFloat(otherCosts) || 0;
    return labor + materials + subs + equipment + other;
  };

  const calculateEstimatedProfit = () => {
    const quoted = parseFloat(quotedPrice) || 0;
    const costs = calculateTotalCosts();
    const overhead = parseFloat(overheadAllocation) || 0;
    return quoted - costs - overhead;
  };

  const calculateActualMargin = () => {
    const quoted = parseFloat(quotedPrice) || 0;
    if (quoted === 0) return 0;
    const profit = calculateEstimatedProfit();
    return (profit / quoted) * 100;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading job budgets...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Add Budget Button */}
        <div className="flex justify-end">
          <Button onClick={() => openDialog()} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Job Budget
          </Button>
        </div>

        {/* Budgets List */}
        <Card>
          <CardHeader>
            <CardTitle>Job Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No job budgets yet</p>
                <Button onClick={() => openDialog()} variant="outline" className="mt-4">
                  Create your first budget
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {budgets.map((budget) => {
                  const totalCosts = 
                    (budget.total_labor_budget || 0) +
                    (budget.total_materials_budget || 0) +
                    (budget.total_subcontractor_budget || 0) +
                    (budget.total_equipment_budget || 0) +
                    (budget.other_costs || 0);
                  const profit = budget.total_quoted_price - totalCosts - (budget.overhead_allocation || 0);
                  const margin = budget.total_quoted_price > 0 
                    ? (profit / budget.total_quoted_price) * 100 
                    : 0;

                  return (
                    <div
                      key={budget.id}
                      className="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="font-bold text-lg text-gray-900">
                            {budget.job.job_number ? `${budget.job.job_number} - ` : ''}{budget.job.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                              margin >= 15 ? 'bg-green-100 text-green-700' :
                              margin >= 10 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {margin.toFixed(1)}% margin
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => openDialog(budget)}
                            size="sm"
                            variant="outline"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => deleteBudget(budget.id)}
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-gray-600">Labor</div>
                          <div className="font-semibold text-gray-900">
                            ${(budget.total_labor_budget || 0).toFixed(2)}
                          </div>
                          {budget.estimated_labor_hours && (
                            <div className="text-xs text-gray-500">{budget.estimated_labor_hours} hrs</div>
                          )}
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Materials</div>
                          <div className="font-semibold text-gray-900">
                            ${(budget.total_materials_budget || 0).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Subcontractors</div>
                          <div className="font-semibold text-gray-900">
                            ${(budget.total_subcontractor_budget || 0).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Equipment</div>
                          <div className="font-semibold text-gray-900">
                            ${(budget.total_equipment_budget || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-4 grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-gray-600">Total Costs</div>
                          <div className="font-semibold text-gray-900">${totalCosts.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Quoted Price</div>
                          <div className="font-bold text-green-600">${budget.total_quoted_price.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Estimated Profit</div>
                          <div className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${profit.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBudget ? 'Edit Job Budget' : 'Create Job Budget'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Job Selection */}
            <div>
              <Label>Job *</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId} disabled={!!editingBudget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select job..." />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number ? `${job.job_number} - ` : ''}{job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Labor */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-3">Labor Budget</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Estimated Hours</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={estimatedLaborHours}
                    onChange={(e) => setEstimatedLaborHours(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Rate per Hour ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={laborRate}
                    onChange={(e) => setLaborRate(e.target.value)}
                    placeholder="30.00"
                  />
                </div>
              </div>
              {estimatedLaborHours && laborRate && (
                <div className="mt-2 text-sm text-gray-600">
                  Total Labor Budget: <span className="font-semibold">${(parseFloat(estimatedLaborHours) * parseFloat(laborRate)).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Other Costs */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Materials Budget ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalMaterialsBudget}
                  onChange={(e) => setTotalMaterialsBudget(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Subcontractors ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalSubcontractorBudget}
                  onChange={(e) => setTotalSubcontractorBudget(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Equipment/Rental ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalEquipmentBudget}
                  onChange={(e) => setTotalEquipmentBudget(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Other Costs */}
            <div>
              <Label>Other Costs ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={otherCosts}
                onChange={(e) => setOtherCosts(e.target.value)}
                placeholder="0.00"
              />
              <Textarea
                value={otherCostsNotes}
                onChange={(e) => setOtherCostsNotes(e.target.value)}
                placeholder="Notes about other costs..."
                className="mt-2"
                rows={2}
              />
            </div>

            {/* Pricing & Margin */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h3 className="font-semibold mb-3">Pricing & Profitability</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Quoted Price ($) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quotedPrice}
                    onChange={(e) => setQuotedPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Overhead Allocation ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overheadAllocation}
                    onChange={(e) => setOverheadAllocation(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Target Margin (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={targetMargin}
                    onChange={(e) => setTargetMargin(e.target.value)}
                    placeholder="15"
                  />
                </div>
              </div>

              {/* Profitability Summary */}
              {quotedPrice && (
                <div className="mt-4 pt-4 border-t border-green-300 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total Costs:</span>
                    <span className="font-semibold">${calculateTotalCosts().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Overhead:</span>
                    <span className="font-semibold">${(parseFloat(overheadAllocation) || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Estimated Profit:</span>
                    <span className={calculateEstimatedProfit() >= 0 ? 'text-green-600' : 'text-red-600'}>
                      ${calculateEstimatedProfit().toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Actual Margin:</span>
                    <span className={`font-semibold ${calculateActualMargin() >= 15 ? 'text-green-600' : calculateActualMargin() >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {calculateActualMargin().toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={saveBudget} className="flex-1">
                {editingBudget ? 'Update' : 'Create'} Budget
              </Button>
              <Button onClick={() => setShowDialog(false)} variant="outline">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
