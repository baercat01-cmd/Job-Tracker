import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Lock, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, FileSpreadsheet, DollarSign, Package } from 'lucide-react';
import { toast } from 'sonner';

interface MaterialItem {
  id: string;
  material_name: string;
  category: string;
  quantity: number;
  cost_per_unit: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
  length: string | null;
  color: string | null;
  sku: string | null;
}

interface SheetComparison {
  sheet_name: string;
  proposal_items: MaterialItem[];
  actual_items: MaterialItem[];
  proposal_total_cost: number;
  actual_total_cost: number;
  proposal_total_price: number;
  actual_total_price: number;
}

interface MaterialComparisonProps {
  jobId: string;
}

export function MaterialComparison({ jobId }: MaterialComparisonProps) {
  const [loading, setLoading] = useState(true);
  const [hasProposal, setHasProposal] = useState(false);
  const [proposalVersion, setProposalVersion] = useState<any>(null);
  const [workingVersion, setWorkingVersion] = useState<any>(null);
  const [sheetComparisons, setSheetComparisons] = useState<SheetComparison[]>([]);
  const [lockingProposal, setLockingProposal] = useState(false);

  useEffect(() => {
    loadComparison();
  }, [jobId]);

  async function loadComparison() {
    try {
      setLoading(true);

      // Get all workbooks for this job
      const { data: workbooks, error: workbooksError } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', jobId)
        .order('version_number', { ascending: false });

      if (workbooksError) throw workbooksError;

      const locked = workbooks?.filter(w => w.status === 'locked') || [];
      const working = workbooks?.find(w => w.status === 'working');

      if (locked.length > 0) {
        // Use first locked version as proposal (baseline)
        const proposal = locked[0];
        setProposalVersion(proposal);
        setHasProposal(true);

        if (working) {
          setWorkingVersion(working);
          await loadSheetComparisons(proposal.id, working.id);
        } else {
          // Only proposal exists, show it as baseline
          await loadProposalOnly(proposal.id);
        }
      } else if (working) {
        // Only working version exists (no locked proposal yet)
        setWorkingVersion(working);
        setHasProposal(false);
        setSheetComparisons([]);
      } else {
        // No workbooks at all
        setHasProposal(false);
        setSheetComparisons([]);
      }
    } catch (error: any) {
      console.error('Error loading comparison:', error);
      toast.error('Failed to load material comparison');
    } finally {
      setLoading(false);
    }
  }

  async function loadProposalOnly(proposalWorkbookId: string) {
    try {
      // Get proposal sheets
      const { data: proposalSheets, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', proposalWorkbookId)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      const comparisons: SheetComparison[] = [];

      for (const sheet of proposalSheets || []) {
        // Get proposal items
        const { data: proposalItems } = await supabase
          .from('material_items')
          .select('*')
          .eq('sheet_id', sheet.id)
          .order('order_index');

        const proposalCost = (proposalItems || []).reduce((sum, item) => sum + (item.extended_cost || 0), 0);
        const proposalPrice = (proposalItems || []).reduce((sum, item) => sum + (item.extended_price || 0), 0);

        comparisons.push({
          sheet_name: sheet.sheet_name,
          proposal_items: proposalItems || [],
          actual_items: [],
          proposal_total_cost: proposalCost,
          actual_total_cost: 0,
          proposal_total_price: proposalPrice,
          actual_total_price: 0,
        });
      }

      setSheetComparisons(comparisons);
    } catch (error: any) {
      console.error('Error loading proposal only:', error);
    }
  }

  async function loadSheetComparisons(proposalWorkbookId: string, workingWorkbookId: string) {
    try {
      // Get proposal sheets
      const { data: proposalSheets, error: proposalSheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', proposalWorkbookId)
        .order('order_index');

      if (proposalSheetsError) throw proposalSheetsError;

      // Get working sheets
      const { data: workingSheets, error: workingSheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workingWorkbookId)
        .order('order_index');

      if (workingSheetsError) throw workingSheetsError;

      const comparisons: SheetComparison[] = [];

      // Match sheets by name
      for (const proposalSheet of proposalSheets || []) {
        const matchingWorkingSheet = workingSheets?.find(ws => ws.sheet_name === proposalSheet.sheet_name);

        // Get proposal items
        const { data: proposalItems } = await supabase
          .from('material_items')
          .select('*')
          .eq('sheet_id', proposalSheet.id)
          .order('order_index');

        // Get working items if sheet exists
        let workingItems: MaterialItem[] = [];
        if (matchingWorkingSheet) {
          const { data } = await supabase
            .from('material_items')
            .select('*')
            .eq('sheet_id', matchingWorkingSheet.id)
            .order('order_index');
          workingItems = data || [];
        }

        const proposalCost = (proposalItems || []).reduce((sum, item) => sum + (item.extended_cost || 0), 0);
        const workingCost = workingItems.reduce((sum, item) => sum + (item.extended_cost || 0), 0);
        const proposalPrice = (proposalItems || []).reduce((sum, item) => sum + (item.extended_price || 0), 0);
        const workingPrice = workingItems.reduce((sum, item) => sum + (item.extended_price || 0), 0);

        comparisons.push({
          sheet_name: proposalSheet.sheet_name,
          proposal_items: proposalItems || [],
          actual_items: workingItems,
          proposal_total_cost: proposalCost,
          actual_total_cost: workingCost,
          proposal_total_price: proposalPrice,
          actual_total_price: workingPrice,
        });
      }

      setSheetComparisons(comparisons);
    } catch (error: any) {
      console.error('Error loading sheet comparisons:', error);
    }
  }

  async function lockProposalVersion() {
    if (!workingVersion) {
      toast.error('No working version to lock');
      return;
    }

    if (!confirm('Lock this workbook as the PROPOSAL baseline? This will:\n\n• Freeze this version as your quoted materials\n• Create a new working version for actual materials\n• Enable proposal vs actual comparison\n\nThis cannot be undone.')) {
      return;
    }

    setLockingProposal(true);

    try {
      // Lock the current working version
      const { error: lockError } = await supabase
        .from('material_workbooks')
        .update({
          status: 'locked',
          locked_at: new Date().toISOString(),
        })
        .eq('id', workingVersion.id);

      if (lockError) throw lockError;

      // Create new working version by copying the locked one
      const { data: newWorkbook, error: newWorkbookError } = await supabase
        .from('material_workbooks')
        .insert({
          job_id: jobId,
          version_number: workingVersion.version_number + 1,
          status: 'working',
        })
        .select()
        .single();

      if (newWorkbookError) throw newWorkbookError;

      // Copy all sheets and items from locked version to new working version
      const { data: lockedSheets } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workingVersion.id)
        .order('order_index');

      for (const oldSheet of lockedSheets || []) {
        // Create new sheet
        const { data: newSheet, error: sheetError } = await supabase
          .from('material_sheets')
          .insert({
            workbook_id: newWorkbook.id,
            sheet_name: oldSheet.sheet_name,
            order_index: oldSheet.order_index,
          })
          .select()
          .single();

        if (sheetError) throw sheetError;

        // Copy all items
        const { data: oldItems } = await supabase
          .from('material_items')
          .select('*')
          .eq('sheet_id', oldSheet.id);

        if (oldItems && oldItems.length > 0) {
          const newItems = oldItems.map(item => ({
            sheet_id: newSheet.id,
            category: item.category,
            usage: item.usage,
            sku: item.sku,
            material_name: item.material_name,
            quantity: item.quantity,
            length: item.length,
            color: item.color,
            cost_per_unit: item.cost_per_unit,
            markup_percent: item.markup_percent,
            price_per_unit: item.price_per_unit,
            extended_cost: item.extended_cost,
            extended_price: item.extended_price,
            taxable: item.taxable,
            notes: item.notes,
            order_index: item.order_index,
          }));

          const { error: itemsError } = await supabase
            .from('material_items')
            .insert(newItems);

          if (itemsError) throw itemsError;
        }

        // Copy labor if exists
        const { data: oldLabor } = await supabase
          .from('material_sheet_labor')
          .select('*')
          .eq('sheet_id', oldSheet.id)
          .maybeSingle();

        if (oldLabor) {
          const { error: laborError } = await supabase
            .from('material_sheet_labor')
            .insert({
              sheet_id: newSheet.id,
              description: oldLabor.description,
              estimated_hours: oldLabor.estimated_hours,
              hourly_rate: oldLabor.hourly_rate,
              notes: oldLabor.notes,
            });

          if (laborError) throw laborError;
        }
      }

      toast.success('Proposal locked! New working version created for actual materials.');
      await loadComparison();
    } catch (error: any) {
      console.error('Error locking proposal:', error);
      toast.error('Failed to lock proposal version');
    } finally {
      setLockingProposal(false);
    }
  }

  // Calculate totals
  const proposalTotalCost = sheetComparisons.reduce((sum, sc) => sum + sc.proposal_total_cost, 0);
  const actualTotalCost = sheetComparisons.reduce((sum, sc) => sum + sc.actual_total_cost, 0);
  const proposalTotalPrice = sheetComparisons.reduce((sum, sc) => sum + sc.proposal_total_price, 0);
  const actualTotalPrice = sheetComparisons.reduce((sum, sc) => sum + sc.actual_total_price, 0);

  const costVariance = actualTotalCost - proposalTotalCost;
  const priceVariance = actualTotalPrice - proposalTotalPrice;
  const costVariancePercent = proposalTotalCost > 0 ? (costVariance / proposalTotalCost) * 100 : 0;

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  // No proposal locked yet
  if (!hasProposal) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center max-w-2xl mx-auto">
            <Lock className="w-16 h-16 mx-auto mb-4 text-blue-600" />
            <h3 className="text-xl font-bold mb-3">Lock Proposal to Enable Comparison</h3>
            <p className="text-muted-foreground mb-6">
              To compare proposal vs actual materials, you need to:
            </p>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 text-left mb-6">
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <Badge className="mt-0.5 bg-blue-600">1</Badge>
                  <div>
                    <strong>Upload or create your proposal materials</strong>
                    <p className="text-muted-foreground mt-1">This becomes your quoted/figured baseline</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Badge className="mt-0.5 bg-blue-600">2</Badge>
                  <div>
                    <strong>Lock the proposal version</strong>
                    <p className="text-muted-foreground mt-1">Click the button below to freeze it</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Badge className="mt-0.5 bg-blue-600">3</Badge>
                  <div>
                    <strong>Work on actual materials</strong>
                    <p className="text-muted-foreground mt-1">System creates a new working version for actual job materials</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Badge className="mt-0.5 bg-blue-600">4</Badge>
                  <div>
                    <strong>Compare and track variance</strong>
                    <p className="text-muted-foreground mt-1">See proposal vs actual throughout the job</p>
                  </div>
                </li>
              </ol>
            </div>
            {workingVersion && (
              <Button
                onClick={lockProposalVersion}
                disabled={lockingProposal}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              >
                {lockingProposal ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Locking Proposal...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5 mr-2" />
                    Lock Current Version as Proposal
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <Card className="border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-blue-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileSpreadsheet className="w-6 h-6 text-purple-600" />
                Proposal vs Actual Materials
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Comparing locked proposal (v{proposalVersion.version_number}) 
                {workingVersion && ` with working actuals (v${workingVersion.version_number})`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-purple-100 text-purple-900 border-purple-300">
                <Lock className="w-3 h-3 mr-1" />
                Proposal Locked
              </Badge>
              {workingVersion && (
                <Badge variant="outline" className="bg-blue-100 text-blue-900 border-blue-300">
                  <Package className="w-3 h-3 mr-1" />
                  Actuals Tracking
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Totals Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Proposal Cost</p>
              <p className="text-3xl font-bold text-blue-700">${proposalTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Actual Cost</p>
              <p className="text-3xl font-bold text-green-700">${actualTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={costVariance > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Cost Variance</p>
              <div className="flex items-center justify-center gap-2">
                {costVariance > 0 ? (
                  <TrendingUp className="w-6 h-6 text-red-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-green-600" />
                )}
                <p className={`text-3xl font-bold ${costVariance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {costVariance >= 0 ? '+' : ''}${costVariance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {costVariancePercent >= 0 ? '+' : ''}{costVariancePercent.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              {Math.abs(costVariance) < (proposalTotalCost * 0.05) ? (
                <div className="flex flex-col items-center">
                  <CheckCircle className="w-10 h-10 text-green-600 mb-1" />
                  <p className="text-sm font-semibold text-green-700">On Track</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <AlertTriangle className="w-10 h-10 text-yellow-600 mb-1" />
                  <p className="text-sm font-semibold text-yellow-700">Watch</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Comparison by Sheet */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Comparison by Section</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={sheetComparisons[0]?.sheet_name || 'none'}>
            <TabsList>
              {sheetComparisons.map((sc) => (
                <TabsTrigger key={sc.sheet_name} value={sc.sheet_name}>
                  {sc.sheet_name}
                </TabsTrigger>
              ))}
            </TabsList>

            {sheetComparisons.map((sc) => {
              const sheetVariance = sc.actual_total_cost - sc.proposal_total_cost;
              const sheetVariancePercent = sc.proposal_total_cost > 0 
                ? (sheetVariance / sc.proposal_total_cost) * 100 
                : 0;

              return (
                <TabsContent key={sc.sheet_name} value={sc.sheet_name} className="space-y-4">
                  {/* Sheet Summary */}
                  <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Proposal</p>
                      <p className="text-xl font-bold text-blue-700">${sc.proposal_total_cost.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Actual</p>
                      <p className="text-xl font-bold text-green-700">${sc.actual_total_cost.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Variance</p>
                      <div className="flex items-center gap-2">
                        <p className={`text-xl font-bold ${sheetVariance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {sheetVariance >= 0 ? '+' : ''}${sheetVariance.toLocaleString()}
                        </p>
                        <Badge variant={sheetVariance > 0 ? 'destructive' : 'default'}>
                          {sheetVariancePercent >= 0 ? '+' : ''}{sheetVariancePercent.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Materials Comparison Table */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Proposal Column */}
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-blue-600" />
                        Proposal ({sc.proposal_items.length} items)
                      </h3>
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Material</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sc.proposal_items.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium text-sm">
                                  {item.material_name}
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {item.category}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">
                                  ${(item.extended_cost || 0).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Actual Column */}
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-green-600" />
                        Actual ({sc.actual_items.length} items)
                      </h3>
                      {sc.actual_items.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Cost</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sc.actual_items.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium text-sm">
                                    {item.material_name}
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      {item.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">{item.quantity}</TableCell>
                                  <TableCell className="text-right">
                                    ${(item.extended_cost || 0).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed rounded-lg p-8 text-center">
                          <Package className="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-50" />
                          <p className="text-sm text-muted-foreground">
                            No actual materials yet
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
