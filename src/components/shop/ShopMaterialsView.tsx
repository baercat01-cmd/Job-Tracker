import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Search, X, CheckCircle2, Package, ChevronDown, ChevronRight, Truck, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
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
    name: string;
    client_name: string;
  };
}

// Supabase query response type (with arrays from joins)
interface SupabaseBundleResponse {
  id: string;
  job_id: string;
  name: string;
  description: string | null;
  status: string;
  jobs: Array<{
    name: string;
    client_name: string;
  }>;
  bundle_items: Array<{
    id: string;
    bundle_id: string;
    material_item_id: string;
    material_items: Array<{
      id: string;
      sheet_id: string;
      category: string;
      material_name: string;
      quantity: number;
      length: string | null;
      usage: string | null;
      status: string;
      cost_per_unit: number | null;
      sheets: Array<{
        sheet_name: string;
      }>;
    }>;
  }>;
}

interface JobGroup {
  jobId: string;
  jobName: string;
  clientName: string;
  packages: MaterialBundle[];
}

interface ShopMaterialsViewProps {
  userId: string;
}

export function ShopMaterialsView({ userId }: ShopMaterialsViewProps) {
  const [packages, setPackages] = useState<MaterialBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterJob, setFilterJob] = useState('all');
  const [jobs, setJobs] = useState<any[]>([]);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set()); // Collapsed by default
  const [processingMaterials, setProcessingMaterials] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPackages();
    loadJobs();
    // No realtime subscriptions — checkmark uses optimistic UI to avoid refetch/scroll jump
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name, status')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadPackages() {
    try {
      setLoading(true);
      
      console.log('🔍 SHOP VIEW: Loading packages with materials that need to be pulled from shop...');
      
      // Simplified approach: Just load all bundles with their materials and filter in memory
      const { data: allBundles, error: bundlesError } = await supabase
        .from('material_bundles')
        .select(`
          id,
          job_id,
          name,
          description,
          status,
          jobs!inner (
            id,
            name,
            client_name
          ),
          bundle_items:material_bundle_items (
            id,
            bundle_id,
            material_item_id,
            material_items!inner (
              id,
              sheet_id,
              category,
              material_name,
              quantity,
              length,
              color,
              usage,
              status,
              cost_per_unit,
              sheets:material_sheets(sheet_name)
            )
          )
        `)
        .order('name');
      
      if (bundlesError) {
        console.error('❌ Error loading bundles:', bundlesError);
        toast.error('Failed to load packages: ' + bundlesError.message);
        throw bundlesError;
      }
      
      console.log(`📦 SHOP VIEW: Loaded ${allBundles?.length || 0} total bundles from database`);
      console.log('📦 SHOP VIEW: Looking for materials with status: pull_from_shop OR ready_for_job');
      
      if (!allBundles || allBundles.length === 0) {
        console.log('❌ SHOP VIEW: No bundles found in database');
        setPackages([]);
        setLoading(false);
        return;
      }
      
      console.log('📦 SHOP VIEW: Sample bundle structure:', JSON.stringify(allBundles[0], null, 2));
      console.log('📦 SHOP VIEW: All bundles:', allBundles.map(b => ({ id: b.id, name: b.name, itemCount: b.bundle_items?.length || 0 })));
      
      // Transform Supabase response to match our interface with better error handling
      const transformedPackages: MaterialBundle[] = (allBundles || []).map((pkg: any) => {
        console.log(`🔧 Processing bundle "${pkg.name}":`, {
          bundleId: pkg.id,
          jobsType: typeof pkg.jobs,
          jobsIsArray: Array.isArray(pkg.jobs),
          jobsValue: pkg.jobs,
          bundleItemsCount: pkg.bundle_items?.length || 0
        });
        
        // Safely access nested data - Supabase returns objects not arrays for single relations
        const job = pkg.jobs || { name: 'Unknown Job', client_name: '' };
        
        const bundleItems = (pkg.bundle_items || []).map(item => {
          const materialItem = item.material_items;
          
          if (!materialItem) {
            console.warn('⚠️ Bundle item missing material_items:', item);
            return null;
          }
          
          const sheet = materialItem.sheets || { sheet_name: 'Unknown Sheet' };
          
          return {
            ...item,
            material_items: {
              ...materialItem,
              sheets: sheet,
            },
          };
        }).filter(Boolean); // Remove null items
        
        console.log(`✅ Transformed bundle "${pkg.name}":`, {
          job: job.name,
          itemCount: bundleItems.length
        });
        
        return {
          ...pkg,
          jobs: job,
          bundle_items: bundleItems as any,
        };
      });
      
      console.log('🔄 SHOP VIEW: Transformed', transformedPackages.length, 'packages');
      console.log('🔄 SHOP VIEW: Sample transformed package:', transformedPackages[0]);
      
      // Filter to only include packages that have materials with 'pull_from_shop' status
      const packagesWithShopMaterials = transformedPackages.filter(pkg => {
        if (!pkg.bundle_items || pkg.bundle_items.length === 0) {
          console.log(`⚠️ SHOP VIEW: Package "${pkg.name}" has NO bundle_items`);
          return false;
        }
        
        const shopMaterials = pkg.bundle_items.filter(item => 
          item && item.material_items && (item.material_items.status === 'pull_from_shop' || item.material_items.status === 'ready_for_job')
        );
        
        const hasShopMaterials = shopMaterials.length > 0;
        
        if (hasShopMaterials) {
          console.log(`✅ SHOP VIEW: Package "${pkg.name}" (Job: ${pkg.jobs?.name}) has ${shopMaterials.length} materials to process:`,   
            shopMaterials.map(item => ({
              id: item.material_items.id,
              material: item.material_items.material_name,
              status: item.material_items.status,
              qty: item.material_items.quantity
            }))
          );
        } else {
          console.log(`⏭️ SHOP VIEW: Package "${pkg.name}" has NO pull_from_shop materials`);
        }
        
        return hasShopMaterials;
      });
      
      console.log(`✅ SHOP VIEW: Found ${packagesWithShopMaterials.length} packages with materials to pull`);
      
      if (packagesWithShopMaterials.length === 0) {
        console.warn('⚠️ SHOP VIEW: NO PACKAGES WITH PULL FROM SHOP MATERIALS FOUND!');
        console.warn('⚠️ Total packages checked:', transformedPackages.length);
        console.warn('⚠️ This might mean all materials have been processed or none have pull_from_shop status');
      }
      
      setPackages(packagesWithShopMaterials);
      
      // Keep all packages collapsed by default
      setExpandedPackages(new Set());
    } catch (error: any) {
      console.error('❌ Error loading packages:', error);
      toast.error('Failed to load packages. Check console for details.');
    } finally {
      setLoading(false);
    }
  }

  function updateMaterialStatus(materialId: string, bundleId: string, currentStatus: string, newStatus: 'ready_for_job' | 'at_job') {
    if (processingMaterials.has(materialId)) return;

    // Optimistic: remove this item from local state immediately (capture for revert)
    let removedBundleItem: BundleItem | null = null;
    let removedPackage: MaterialBundle | null = null;
    setPackages((prev) => {
      const next = prev.map((pkg) => {
        const bundleItem = pkg.bundle_items?.find((bi) => bi.material_items.id === materialId);
        if (bundleItem) {
          removedBundleItem = bundleItem;
          removedPackage = { ...pkg, bundle_items: pkg.bundle_items };
          return { ...pkg, bundle_items: pkg.bundle_items.filter((bi) => bi.material_items.id !== materialId) };
        }
        return pkg;
      });
      return next.filter((pkg) =>
        pkg.bundle_items.some(
          (bi) => bi.material_items.status === 'pull_from_shop' || bi.material_items.status === 'ready_for_job'
        )
      );
    });

    setProcessingMaterials((prev) => new Set(prev).add(materialId));

    // Persist in background — no refetch
    (async () => {
      try {
        const { error: materialError } = await supabase
          .from('material_items')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', materialId)
          .select();
        if (materialError) throw materialError;

        if (!bundleId.startsWith('unbundled-')) {
          const { data: bundleItems, error: bundleItemsError } = await supabase
            .from('material_bundle_items')
            .select(`material_item_id, material_items!inner(status)`)
            .eq('bundle_id', bundleId);
          if (bundleItemsError) throw bundleItemsError;
          const readyMaterials =
            bundleItems?.filter(
              (item: any) => item.material_items.status === 'ready_for_job' || item.material_items.status === 'at_job'
            ).length || 0;
          if (readyMaterials === 1) {
            await supabase
              .from('material_bundles')
              .update({ status: 'delivered', updated_at: new Date().toISOString() })
              .eq('id', bundleId);
          }
        }
        toast.success(`Material marked as ${newStatus === 'ready_for_job' ? 'Ready for Job' : 'At Job'}`);
      } catch (error: any) {
        console.error('❌ SHOP Error updating material:', error);
        toast.error(`Failed to update material: ${error.message || 'Unknown error'}`);
        if (removedBundleItem && removedPackage) {
          setPackages((prev) => {
            const stillHasPackage = prev.some((p) => p.id === removedPackage!.id);
            if (stillHasPackage) {
              return prev.map((pkg) =>
                pkg.id === removedPackage!.id
                  ? { ...pkg, bundle_items: [...pkg.bundle_items, removedBundleItem!] }
                  : pkg
              );
            }
            return [...prev, removedPackage!];
          });
        }
      } finally {
        setProcessingMaterials((prev) => {
          const newSet = new Set(prev);
          newSet.delete(materialId);
          return newSet;
        });
      }
    })();
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

  function getStatusColor(status: string): string {
    switch (status) {
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

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'pull_from_shop': return 'Pull from Shop';
      case 'ready_for_job': return 'Ready for Job';
      case 'at_job': return 'At Job';
      default: return status;
    }
  }

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch = searchTerm === '' || 
      pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.jobs.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.jobs.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.bundle_items.some(item => 
        item.material_items.material_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    const matchesJob = filterJob === 'all' || pkg.job_id === filterJob;
    
    return matchesSearch && matchesJob;
  });

  // All packages should have pull_from_shop materials since that's all we load
  const pullFromShopPackages = filteredPackages;

  // Group packages by job
  const packagesByJob = pullFromShopPackages.reduce((acc, pkg) => {
    const jobId = pkg.job_id;
    if (!acc[jobId]) {
      acc[jobId] = {
        jobId,
        jobName: pkg.jobs.name,
        clientName: pkg.jobs.client_name,
        packages: [],
      };
    }
    acc[jobId].packages.push(pkg);
    return acc;
  }, {} as Record<string, JobGroup>);

  const jobGroups = Object.values(packagesByJob);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading packages...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Material Packages Grouped by Job */}
      {jobGroups.length > 0 && (
        <div className="space-y-4">
          {jobGroups.map(jobGroup => {
            const isJobExpanded = expandedPackages.has(`job-${jobGroup.jobId}`);
            const totalMaterialsInJob = jobGroup.packages.reduce(
              (sum, pkg) => sum + pkg.bundle_items.filter(
                item => item.material_items.status === 'pull_from_shop'
              ).length,
              0
            );
            
            return (
              <Card key={jobGroup.jobId} className="border-2 border-blue-200">
                <Collapsible 
                  open={isJobExpanded} 
                  onOpenChange={() => togglePackageExpanded(`job-${jobGroup.jobId}`)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer bg-gradient-to-r from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isJobExpanded ? (
                            <ChevronDown className="w-6 h-6 text-blue-600" />
                          ) : (
                            <ChevronRight className="w-6 h-6 text-blue-600" />
                          )}
                          <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-blue-600" />
                              {jobGroup.jobName}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                              Client: {jobGroup.clientName}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="font-semibold bg-white">
                            {jobGroup.packages.length} {jobGroup.packages.length === 1 ? 'package' : 'packages'}
                          </Badge>
                          <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                            {totalMaterialsInJob} materials to pull
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-2 sm:p-4 space-y-3">
                      {jobGroup.packages.map(pkg => {
                        const isPackageExpanded = expandedPackages.has(pkg.id);
                        const pullFromShopItems = pkg.bundle_items.filter(
                          item => item.material_items.status === 'pull_from_shop'
                        );
                        
                        return (
                          <Card key={pkg.id} className="border border-purple-200">
                            <Collapsible open={isPackageExpanded} onOpenChange={() => togglePackageExpanded(pkg.id)}>
                              <CollapsibleTrigger asChild>
                                <CardHeader className="cursor-pointer bg-gradient-to-r from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 transition-colors py-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {isPackageExpanded ? (
                                        <ChevronDown className="w-5 h-5 text-purple-600" />
                                      ) : (
                                        <ChevronRight className="w-5 h-5 text-purple-600" />
                                      )}
                                      <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                          <Package className="w-4 h-4 text-purple-600" />
                                          {pkg.name}
                                        </CardTitle>
                                        {pkg.description && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            {pkg.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <Badge variant="outline" className="font-semibold bg-white text-xs">
                                      {pullFromShopItems.length} to pull
                                    </Badge>
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="p-2 sm:p-3">
                                  <div className="space-y-2">
                                    {pullFromShopItems.map((item) => (
                                      <div 
                                        key={item.id} 
                                        className="bg-white border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-sm leading-tight mb-2">
                                              {item.material_items.material_name}
                                            </h4>
                                            
                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                              <div>
                                                <span className="text-muted-foreground">Qty:</span>
                                                <p className="font-semibold text-base">{item.material_items.quantity}</p>
                                              </div>
                                              
                                              <div>
                                                <span className="text-muted-foreground">Color:</span>
                                                <p className="font-medium">
                                                  {item.material_items.color || '-'}
                                                </p>
                                              </div>
                                              
                                              <div>
                                                <span className="text-muted-foreground">Length:</span>
                                                <p className="font-medium">
                                                  {item.material_items.length || '-'}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <div className="flex gap-2 flex-shrink-0">
                                            {/* Mark as Ready for Job */}
                                            {item.material_items.status === 'pull_from_shop' && (
                                              <Button
                                                size="sm"
                                                onClick={(e) => {
                                                  console.log('🖱️ SHOP Pull from Shop button clicked');
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  updateMaterialStatus(item.material_items.id, pkg.id, item.material_items.status, 'ready_for_job');
                                                }}
                                                disabled={processingMaterials.has(item.material_items.id)}
                                                className="bg-emerald-600 hover:bg-emerald-700 h-10 w-10 p-0"
                                                title="Mark as Ready for Job"
                                              >
                                                {processingMaterials.has(item.material_items.id) ? (
                                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                  <CheckCircle2 className="w-5 h-5" />
                                                )}
                                              </Button>
                                            )}
                                            
                                            {/* Mark as At Job */}
                                            {item.material_items.status === 'ready_for_job' && (
                                              <Button
                                                size="sm"
                                                onClick={(e) => {
                                                  console.log('🖱️ SHOP Ready for Job button clicked for material:', item.material_items.id);
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  updateMaterialStatus(item.material_items.id, pkg.id, item.material_items.status, 'at_job');
                                                }}
                                                disabled={processingMaterials.has(item.material_items.id)}
                                                className="bg-teal-600 hover:bg-teal-700 h-10 w-10 p-0"
                                                title="Mark as At Job"
                                              >
                                                {processingMaterials.has(item.material_items.id) ? (
                                                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                  <Truck className="w-5 h-5" />
                                                )}
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {jobGroups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {searchTerm || filterJob !== 'all' 
                ? 'No packages found matching your filters' 
                : 'No packages to process'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Packages with materials that have "Pull from Shop" status will appear here
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
