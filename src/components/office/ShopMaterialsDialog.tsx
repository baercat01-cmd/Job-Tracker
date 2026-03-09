import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, ArrowRight, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  material_name: string;
  quantity: number;
  length: string | null;
  usage: string | null;
  status: string;
  cost_per_unit: number | null;
  sheets: {
    sheet_name: string;
  };
}

interface BundleItem {
  id: string;
  bundle_id: string;
  material_item_id: string;
  material_items: MaterialItem;
}

interface MaterialBundle {
  id: string;
  job_id: string;
  name: string;
  description: string | null;
  status: string;
  bundle_items: BundleItem[];
  jobs: {
    id: string;
    name: string;
    client_name: string;
  };
}

interface ShopMaterialsDialogProps {
  open: boolean;
  onClose: () => void;
  onJobSelect?: (jobId: string) => void;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'not_ordered':
      return 'bg-slate-100 text-slate-800 border-slate-300';
    case 'ordered':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'received':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'pull_from_shop':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'ready_for_job':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'at_job':
      return 'bg-teal-100 text-teal-800 border-teal-300';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
}

export function ShopMaterialsDialog({ open, onClose, onJobSelect }: ShopMaterialsDialogProps) {
  const [packages, setPackages] = useState<MaterialBundle[]>([]);
  const [sheetGroups, setSheetGroups] = useState<MaterialBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      loadMaterials();
    }
  }, [open]);

  async function loadMaterials() {
    try {
      setLoading(true);
      console.log('Loading shop materials from packages...');

      // Load all packages that contain materials with pull_from_shop or ready_for_job status
      const { data, error } = await supabase
        .from('material_bundles')
        .select(`
          id,
          job_id,
          name,
          description,
          status,
          jobs!inner(
            id,
            name,
            client_name
          ),
          bundle_items:material_bundle_items(
            id,
            bundle_id,
            material_item_id,
            material_items!inner(
              id,
              sheet_id,
              category,
              material_name,
              quantity,
              length,
              usage,
              status,
              cost_per_unit,
              sheets:material_sheets(sheet_name)
            )
          )
        `)
        .order('name');

      if (error) {
        console.error('Error loading packages:', error);
        throw error;
      }

      console.log(`Found ${data?.length || 0} total packages`);
      
      // Transform Supabase response to match our interface
      const transformedPackages: MaterialBundle[] = (data || []).map((pkg: any) => ({
        ...pkg,
        jobs: pkg.jobs,
        bundle_items: pkg.bundle_items.map((item: any) => ({
          ...item,
          material_items: {
            ...item.material_items,
            sheets: item.material_items.sheets,
          },
        })),
      }));
      
      // Filter to only include packages that have materials with pull_from_shop or ready_for_job status
      const packagesWithShopMaterials = transformedPackages.filter(pkg => 
        pkg.bundle_items.some(item => 
          item.material_items.status === 'pull_from_shop' || 
          item.material_items.status === 'ready_for_job'
        )
      );
      
      console.log(`Found ${packagesWithShopMaterials.length} packages with shop materials`);
      setPackages(packagesWithShopMaterials);

      // Unbundled materials (pull_from_shop / ready_for_job) — drive by materials so all such items appear regardless of workbook status
      const { data: bundledIds } = await supabase.from('material_bundle_items').select('material_item_id');
      const bundledSet = new Set((bundledIds || []).map((r: any) => r.material_item_id));

      const { data: unbundledRows } = await supabase
        .from('material_items')
        .select('id, sheet_id, category, material_name, quantity, length, usage, status, cost_per_unit')
        .in('status', ['pull_from_shop', 'ready_for_job']);
      const unbundled = (unbundledRows || []).filter((r: any) => !bundledSet.has(r.id));
      if (unbundled.length === 0) {
        setSheetGroups([]);
        return;
      }

      const sheetIdsFromItems = [...new Set(unbundled.map((i: any) => i.sheet_id))];
      const { data: sheetsData } = await supabase.from('material_sheets').select('id, sheet_name, workbook_id').in('id', sheetIdsFromItems);
      const sheetMap = new Map((sheetsData || []).map((s: any) => [s.id, s]));

      const wbIdsFromSheets = [...new Set((sheetsData || []).map((s: any) => s.workbook_id))];
      const { data: wbJobs } = await supabase.from('material_workbooks').select('id, job_id').in('id', wbIdsFromSheets);
      const wbToJob = new Map((wbJobs || []).map((w: any) => [w.id, w.job_id]));
      const { data: jobsData } = await supabase.from('jobs').select('id, name, client_name').in('id', [...new Set(unbundled.map((i: any) => {
        const s = sheetMap.get(i.sheet_id);
        return s ? wbToJob.get(s.workbook_id) : null;
      }).filter(Boolean))]);
      const jobMap = new Map((jobsData || []).map((j: any) => [j.id, j]));

      const byKey = new Map<string, any[]>();
      for (const item of unbundled) {
        const sheet = sheetMap.get(item.sheet_id);
        const jobId = sheet ? wbToJob.get(sheet.workbook_id) : null;
        if (!jobId || !sheet) continue;
        const key = `${jobId}|${item.sheet_id}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push({ ...item, sheets: { sheet_name: sheet.sheet_name } });
      }

      const built: MaterialBundle[] = [];
      for (const [key, items] of byKey) {
        const [jobId, sheetId] = key.split('|');
        const job = jobMap.get(jobId) || { id: jobId, name: 'Unknown', client_name: '' };
        const sheet = sheetMap.get(sheetId);
        built.push({
          id: `unbundled-${jobId}-${sheetId}`,
          job_id: jobId,
          name: sheet?.sheet_name || 'Unknown Sheet',
          description: null,
          status: 'pull_from_shop',
          jobs: job,
          bundle_items: items.map((m: any) => ({
            id: m.id,
            bundle_id: `unbundled-${jobId}-${sheetId}`,
            material_item_id: m.id,
            material_items: m,
          })),
        });
      }
      setSheetGroups(built);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error(`Failed to load materials: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function updateMaterialStatus(materialId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('material_items')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);

      if (error) throw error;

      toast.success('Material status updated');
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  }

  function togglePackageExpanded(packageId: string) {
    const newSet = new Set(expandedPackages);
    if (newSet.has(packageId)) {
      newSet.delete(packageId);
    } else {
      newSet.add(packageId);
    }
    setExpandedPackages(newSet);
  }

  const hasPull = (pkg: MaterialBundle) => pkg.bundle_items.some(item => item.material_items.status === 'pull_from_shop');
  const hasReady = (pkg: MaterialBundle) => pkg.bundle_items.some(item => item.material_items.status === 'ready_for_job');
  const pullFromShopPackages = [...packages.filter(hasPull), ...sheetGroups.filter(hasPull)];
  const readyForJobPackages = [...packages.filter(hasReady), ...sheetGroups.filter(hasReady)];

  const totalReadyToPull = pullFromShopPackages.reduce((sum, pkg) =>
    sum + pkg.bundle_items.filter(item => item.material_items.status === 'pull_from_shop').length, 0
  );
  const totalAtShop = readyForJobPackages.reduce((sum, pkg) =>
    sum + pkg.bundle_items.filter(item => item.material_items.status === 'ready_for_job').length, 0
  );

  const isSheetGroup = (pkg: MaterialBundle) => pkg.id.startsWith('unbundled-');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Shop Materials Overview
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading materials...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column: Need to Pull */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-purple-100 to-purple-50 border-2 border-purple-700 rounded-lg p-3">
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-purple-700" />
                    Need to Pull ({totalReadyToPull})
                  </h3>
                </div>
                
                {totalReadyToPull === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No materials need to be pulled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pullFromShopPackages.map((pkg) => {
                      const pullItems = pkg.bundle_items.filter(item => 
                        item.material_items.status === 'pull_from_shop'
                      );
                      const isExpanded = expandedPackages.has(pkg.id);
                      
                      return (
                      <Collapsible key={pkg.id} open={isExpanded} onOpenChange={() => togglePackageExpanded(pkg.id)}>
                        {/* Package Header */}
                        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-purple-500 rounded-lg shadow-md overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <div className="p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  {isExpanded ? (
                                    <ChevronDown className="w-5 h-5 text-purple-300 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5 text-purple-300 flex-shrink-0" />
                                  )}
                                  <div>
                                    <p className="font-bold text-base text-white flex items-center gap-2">
                                      {isSheetGroup(pkg) ? (
                                        <><FileSpreadsheet className="w-4 h-4" />Sheet: {pkg.name}</>
                                      ) : (
                                        <><Package className="w-4 h-4" />{pkg.name}</>
                                      )}
                                    </p>
                                    <p className="text-xs text-purple-100">{pkg.jobs.name} - {pkg.jobs.client_name}</p>
                                    {!isSheetGroup(pkg) && pkg.description && (
                                      <p className="text-xs text-purple-200 mt-1">{pkg.description}</p>
                                    )}
                                    {isSheetGroup(pkg) && (
                                      <p className="text-xs text-purple-200 mt-1">Individual materials</p>
                                    )}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-xs bg-purple-500 text-slate-900 font-semibold">
                                  {pullItems.length} item{pullItems.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                        </div>
                        
                        <CollapsibleContent>
                          <div className="space-y-2 mt-2 pl-2">
                            {pullItems.map((item) => (
                              <Card key={item.id} className="border-l-4 border-l-purple-600 bg-white hover:shadow-md transition-shadow">
                                <CardContent className="py-3 px-3">
                                  <div className="flex items-center gap-3">
                                    {/* Left side: Sheet and Category */}
                                    <div className="flex flex-col gap-1 flex-shrink-0">
                                      <Badge variant="outline" className="text-xs border-blue-300 bg-blue-50 whitespace-nowrap">
                                        {item.material_items.sheets.sheet_name}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs border-slate-300 whitespace-nowrap">
                                        {item.material_items.category}
                                      </Badge>
                                    </div>
                                    
                                    {/* Middle: Material info */}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-sm text-slate-900 mb-1">{item.material_items.material_name}</p>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span className="font-semibold">Qty: {item.material_items.quantity}</span>
                                        {item.material_items.length && <span>Length: {item.material_items.length}</span>}
                                        {item.material_items.usage && <span>Usage: {item.material_items.usage}</span>}
                                      </div>
                                    </div>
                                    
                                    {/* Right side: Status selector */}
                                    <div className="flex-shrink-0 w-36">
                                      <Select
                                        value={item.material_items.status}
                                        onValueChange={(value) => updateMaterialStatus(item.material_items.id, value)}
                                      >
                                        <SelectTrigger className={`h-8 font-medium border text-xs ${getStatusColor(item.material_items.status)}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="not_ordered">Not Ordered</SelectItem>
                                          <SelectItem value="ordered">Ordered</SelectItem>
                                          <SelectItem value="received">Received</SelectItem>
                                          <SelectItem value="pull_from_shop">Pull from Shop</SelectItem>
                                          <SelectItem value="ready_for_job">Ready for Job</SelectItem>
                                          <SelectItem value="at_job">At Job</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Ready for Job */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-blue-100 to-blue-50 border-2 border-blue-700 rounded-lg p-3">
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-700" />
                    Ready for Job ({totalAtShop})
                  </h3>
                </div>
                
                {totalAtShop === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No materials ready for job</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {readyForJobPackages.map((pkg) => {
                      const readyItems = pkg.bundle_items.filter(item => 
                        item.material_items.status === 'ready_for_job'
                      );
                      const isExpanded = expandedPackages.has(pkg.id);
                      
                      return (
                      <Collapsible key={pkg.id} open={isExpanded} onOpenChange={() => togglePackageExpanded(pkg.id)}>
                        {/* Package Header */}
                        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-blue-500 rounded-lg shadow-md overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <div className="p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  {isExpanded ? (
                                    <ChevronDown className="w-5 h-5 text-blue-300 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5 text-blue-300 flex-shrink-0" />
                                  )}
                                  <div>
                                    <p className="font-bold text-base text-white flex items-center gap-2">
                                      {isSheetGroup(pkg) ? (
                                        <><FileSpreadsheet className="w-4 h-4" />Sheet: {pkg.name}</>
                                      ) : (
                                        <><Package className="w-4 h-4" />{pkg.name}</>
                                      )}
                                    </p>
                                    <p className="text-xs text-blue-100">{pkg.jobs.name} - {pkg.jobs.client_name}</p>
                                    {!isSheetGroup(pkg) && pkg.description && (
                                      <p className="text-xs text-blue-200 mt-1">{pkg.description}</p>
                                    )}
                                    {isSheetGroup(pkg) && (
                                      <p className="text-xs text-blue-200 mt-1">Individual materials</p>
                                    )}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-xs bg-blue-500 text-slate-900 font-semibold">
                                  {readyItems.length} item{readyItems.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                        </div>
                        
                        <CollapsibleContent>
                          <div className="space-y-2 mt-2 pl-2">
                            {readyItems.map((item) => (
                              <Card key={item.id} className="border-l-4 border-l-blue-600 bg-white hover:shadow-md transition-shadow">
                                <CardContent className="py-3 px-3">
                                  <div className="flex items-center gap-3">
                                    {/* Left side: Sheet and Category */}
                                    <div className="flex flex-col gap-1 flex-shrink-0">
                                      <Badge variant="outline" className="text-xs border-blue-300 bg-blue-50 whitespace-nowrap">
                                        {item.material_items.sheets.sheet_name}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs border-slate-300 whitespace-nowrap">
                                        {item.material_items.category}
                                      </Badge>
                                    </div>
                                    
                                    {/* Middle: Material info */}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-sm text-slate-900 mb-1">{item.material_items.material_name}</p>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span className="font-semibold">Qty: {item.material_items.quantity}</span>
                                        {item.material_items.length && <span>Length: {item.material_items.length}</span>}
                                        {item.material_items.usage && <span>Usage: {item.material_items.usage}</span>}
                                      </div>
                                    </div>
                                    
                                    {/* Right side: Status selector */}
                                    <div className="flex-shrink-0 w-36">
                                      <Select
                                        value={item.material_items.status}
                                        onValueChange={(value) => updateMaterialStatus(item.material_items.id, value)}
                                      >
                                        <SelectTrigger className={`h-8 font-medium border text-xs ${getStatusColor(item.material_items.status)}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="not_ordered">Not Ordered</SelectItem>
                                          <SelectItem value="ordered">Ordered</SelectItem>
                                          <SelectItem value="received">Received</SelectItem>
                                          <SelectItem value="pull_from_shop">Pull from Shop</SelectItem>
                                          <SelectItem value="ready_for_job">Ready for Job</SelectItem>
                                          <SelectItem value="at_job">At Job</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Empty State */}
            {totalAtShop === 0 && totalReadyToPull === 0 && (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-semibold mb-2">No Materials Found</p>
                <p className="text-sm text-muted-foreground">
                  There are currently no materials at the shop or ready to pull
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
