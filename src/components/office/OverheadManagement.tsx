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
import { Plus, Pencil, Trash2, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface OverheadExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  frequency: string;
  notes: string | null;
  created_at: string;
}

interface OverheadManagementProps {
  onUpdate: () => void;
}

const CATEGORIES = [
  'Salaries/Admin',
  'Insurance',
  'Equipment/Tools',
  'Rent/Facility',
  'Utilities',
  'Marketing',
  'Software/Subscriptions',
  'Vehicles',
  'Other'
];

const FREQUENCIES = [
  { value: 'one-time', label: 'One-time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' }
];

export function OverheadManagement({ onUpdate }: OverheadManagementProps) {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<OverheadExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OverheadExpense | null>(null);
  
  // Form state
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [frequency, setFrequency] = useState('one-time');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('overhead_expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error loading overhead expenses:', error);
      toast.error('Failed to load overhead expenses');
    } finally {
      setLoading(false);
    }
  }

  function openDialog(expense?: OverheadExpense) {
    if (expense) {
      setEditingExpense(expense);
      setCategory(expense.category);
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setExpenseDate(expense.expense_date);
      setFrequency(expense.frequency);
      setNotes(expense.notes || '');
    } else {
      resetForm();
    }
    setShowDialog(true);
  }

  function resetForm() {
    setEditingExpense(null);
    setCategory('');
    setDescription('');
    setAmount('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setFrequency('one-time');
    setNotes('');
  }

  async function saveExpense() {
    if (!category || !description || !amount || !expenseDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const expenseData = {
        category,
        description,
        amount: amountNum,
        expense_date: expenseDate,
        frequency,
        notes: notes || null,
        created_by: profile?.id
      };

      if (editingExpense) {
        const { error } = await supabase
          .from('overhead_expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);

        if (error) throw error;
        toast.success('Expense updated');
      } else {
        const { error } = await supabase
          .from('overhead_expenses')
          .insert([expenseData]);

        if (error) throw error;
        toast.success('Expense added');
      }

      setShowDialog(false);
      resetForm();
      await loadExpenses();
      onUpdate();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Failed to save expense');
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;

    try {
      const { error } = await supabase
        .from('overhead_expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Expense deleted');
      await loadExpenses();
      onUpdate();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    }
  }

  // Calculate totals by category
  const totals = expenses.reduce((acc, exp) => {
    if (!acc[exp.category]) acc[exp.category] = 0;
    acc[exp.category] += exp.amount;
    return acc;
  }, {} as Record<string, number>);

  const grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading overhead expenses...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Overhead</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-gray-500 mt-1">{expenses.length} expenses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Monthly Recurring</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                ${expenses
                  .filter(e => e.frequency === 'monthly')
                  .reduce((sum, e) => sum + e.amount, 0)
                  .toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-gray-500 mt-1">per month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Top Category</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(totals).length > 0 ? (
                <>
                  <div className="text-lg font-bold text-gray-900">
                    {Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0]}
                  </div>
                  <p className="text-sm text-gray-600">
                    ${Object.entries(totals).sort((a, b) => b[1] - a[1])[0][1].toFixed(2)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">No expenses yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Expense Button */}
        <div className="flex justify-end">
          <Button onClick={() => openDialog()} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
        </div>

        {/* Expenses List */}
        <Card>
          <CardHeader>
            <CardTitle>Overhead Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No overhead expenses yet</p>
                <Button onClick={() => openDialog()} variant="outline" className="mt-4">
                  Add your first expense
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
                          {expense.category}
                        </span>
                        {expense.frequency !== 'one-time' && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                            {expense.frequency}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-gray-900 mt-2">{expense.description}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {new Date(expense.expense_date).toLocaleDateString()}
                      </div>
                      {expense.notes && (
                        <div className="text-sm text-gray-500 mt-1 italic">{expense.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xl font-bold text-gray-900">
                          ${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => openDialog(expense)}
                          size="sm"
                          variant="outline"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => deleteExpense(expense.id)}
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingExpense ? 'Edit Expense' : 'Add Overhead Expense'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description *</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Office Manager Salary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Frequency *</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details..."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={saveExpense} className="flex-1">
                {editingExpense ? 'Update' : 'Add'} Expense
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
