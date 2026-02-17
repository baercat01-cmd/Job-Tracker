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
import { Search, X, CheckCircle2, Package, ChevronDown, ChevronRight, Truck } from 'lucide-react';
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

interface ShopMaterialsViewProps {
  userId: string;
}

export function ShopMaterialsView({ userId }: ShopMaterialsViewProps) {
  const [packages, setPackages] = useState<MaterialBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterJob, setFilterJob] = useState('all');
  const [jobs, setJobs] = useState<any[]>([]);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set()); // Empty set = all collapsed by default
  const [processingMaterials, setProcessingMaterials] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPackages();
    loadJobs();
    
    // Subscribe to package changes
    const bundlesChannel = supabase
      .channel('shop_bundles_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_bundles' },
        () => {
          loadPackages();
        }
      )
      .subscribe();

    // Subscribe to material item changes
    const itemsChannel = supabase
      .channel('shop_items_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_items' },
        () => {
          loadPackages();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(bundlesChannel);
      supabase.removeChannel(itemsChannel);
    };
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
      
      console.log('🔍 Loading packages with materials that need to be pulled from shop...');
      
      // Only get material items with 'pull_from_shop' status
      const { data: shopMaterials, error: materialsError } = await supabase
        .from('material_items')
        .select('id, sheet_id, category, material_name, quantity, length, color, usage, status, cost_per_unit')
        .eq('status', 'pull_from_shop');
      
      if (materialsError) {
        console.error('❌ Error loading shop materials:', materialsError);
        throw materialsError;
      }
      
      console.log(`📋 Found ${shopMaterials?.length || 0} materials with shop statuses`);
      
      if (!shopMaterials || shopMaterials.length === 0) {
        console.log('❌ No materials found with shop statuses');
        setPackages([]);
        return;
      }
      
      // Get the material item IDs
      const materialIds = shopMaterials.map(m => m.id);
      
      // Get bundles that contain these materials
      const { data, error } = await supabase
        .from('material_bundle_items')
        .select(`
          bundle_id,
          material_bundles!inner(
            id,
            job_id,
            name,
            description,
            status,
            jobs!inner(
              name,
              client_name
            )
          )
        `)
        .in('material_item_id', materialIds);

      if (error) {
        console.error('❌ Error loading bundles:', error);
        throw error;
      }
      
      console.log(`📦 Found ${data?.length || 0} bundle items`);
      
      // Get unique bundles
      const uniqueBundles = new Map();
      (data || []).forEach((item: any) => {
        const bundle = item.material_bundles;
        if (bundle && !uniqueBundles.has(bundle.id)) {
          uniqueBundles.set(bundle.id, bundle);
        }
      });
      
      console.log(`📦 Found ${uniqueBundles.size} unique bundles with shop materials`);
      
      // Now load full bundle data with all their items
      const bundleIds = Array.from(uniqueBundles.keys());
      
      if (bundleIds.length === 0) {
        console.log('❌ No bundles found');
        setPackages([]);
        return;
      }
      
      const { data: fullBundles, error: bundlesError } = await supabase
        .from('material_bundles')
        .select(`
          id,
          job_id,
          name,
          description,
          status,
          jobs!inner(
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
              color,
              usage,
              status,
              cost_per_unit,
              sheets:material_sheets(sheet_name)
            )
          )
        `)
        .in('id', bundleIds)
        .order('name');
      
      if (bundlesError) {
        console.error('❌ Error loading full bundle data:', bundlesError);
        throw bundlesError;
      }
      
      console.log(`📦 Loaded ${fullBundles?.length || 0} full bundles`);
      console.log('👤 Current user:', userId);
      
      // Transform Supabase response to match our interface with better error handling
      const transformedPackages: MaterialBundle[] = (fullBundles || []).map((pkg: SupabaseBundleResponse) => {
        // Safely access nested arrays
        const job = Array.isArray(pkg.jobs) && pkg.jobs.length > 0 ? pkg.jobs[0] : { name: 'Unknown Job', client_name: '' };
        
        const bundleItems = (pkg.bundle_items || []).map(item => {
          const materialItem = Array.isArray(item.material_items) && item.material_items.length > 0 
            ? item.material_items[0] 
            : null;
          
          if (!materialItem) {
            console.warn('⚠️ Bundle item missing material_items:', item);
            return null;
          }
          
          const sheet = Array.isArray(materialItem.sheets) && materialItem.sheets.length > 0
            ? materialItem.sheets[0]
            : { sheet_name: 'Unknown Sheet' };
          
          return {
            ...item,
            material_items: {
              ...materialItem,
              sheets: sheet,
            },
          };
        }).filter(Boolean); // Remove null items
        
        return {
          ...pkg,
          jobs: job,
          bundle_items: bundleItems as any,
        };
      });
      
      console.log('🔄 Transformed packages:', transformedPackages);
      
      // Filter to only include packages that have materials with 'pull_from_shop' status
      const packagesWithShopMaterials = transformedPackages.filter(pkg => {
        const hasShopMaterials = pkg.bundle_items.some(item => 
          item.material_items.status === 'pull_from_shop'
        );
        
        if (hasShopMaterials) {
          console.log(`✅ Package "${pkg.name}" (Job: ${pkg.jobs.name}) has materials to pull:`, 
            pkg.bundle_items.filter(item => 
              item.material_items.status === 'pull_from_shop'
            ).map(item => ({
              material: item.material_items.material_name,
              status: item.material_items.status
            }))
          );
        }
        
        return hasShopMaterials;
      });
      
      console.log(`✅ Found ${packagesWithShopMaterials.length} packages with materials to pull`);
      
      if (packagesWithShopMaterials.length === 0) {
        console.warn('⚠️ NO PACKAGES WITH PULL FROM SHOP MATERIALS FOUND!');
        console.warn('⚠️ This might indicate all materials have been processed or there are no materials needing shop processing');
      }
      console.log('📦 Packages with pull from shop materials:', packagesWithShopMaterials);
      
      // ALSO load unbundled materials that have 'pull_from_shop' status
      // These are materials that haven't been added to a bundle yet
      // Use a simpler approach: load materials with sheets, then fetch workbook/job data separately
      const { data: unbundledMaterials, error: unbundledError } = await supabase
        .from('material_items')
        .select(`
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
          material_sheets!inner(
            sheet_name,
            workbook_id
          )
        `)
        .eq('status', 'pull_from_shop')
        .order('material_name');

      if (unbundledError) {
        console.error('❌ Error loading unbundled materials:', unbundledError);
      } else {
        console.log(`📋 Found ${unbundledMaterials?.length || 0} total materials with pull from shop status`);
        
        // Get IDs of materials that are already in bundles
        const bundledMaterialIds = new Set(
          packagesWithShopMaterials.flatMap(pkg => 
            pkg.bundle_items.map(item => item.material_items.id)
          )
        );
        
        // Filter out materials that are already in bundles
        const trulyUnbundled = (unbundledMaterials || []).filter(
          (material: any) => !bundledMaterialIds.has(material.id)
        );
        
        console.log(`🔓 Found ${trulyUnbundled.length} unbundled materials to pull from shop`);
        
        // Get unique workbook IDs
        const workbookIds = [...new Set(
          trulyUnbundled
            .map((m: any) => {
              const sheet = Array.isArray(m.material_sheets) ? m.material_sheets[0] : m.material_sheets;
              return sheet?.workbook_id;
            })
            .filter(Boolean)
        )];
        
        console.log(`🔍 Loading ${workbookIds.length} workbooks for unbundled materials...`);
        
        // Fetch workbook and job data
        const { data: workbooks, error: workbooksError } = await supabase
          .from('material_workbooks')
          .select(`
            id,
            job_id,
            jobs!inner(
              id,
              name,
              client_name
            )
          `)
          .in('id', workbookIds);
        
        if (workbooksError) {
          console.error('❌ Error loading workbooks:', workbooksError);
        } else {
          console.log(`✅ Loaded ${workbooks?.length || 0} workbooks with job data`);
          
          // Create a map of workbook_id -> job data
          const workbookJobMap = new Map(
            (workbooks || []).map((wb: any) => {
              const job = Array.isArray(wb.jobs) ? wb.jobs[0] : wb.jobs;
              return [wb.id, job];
            })
          );
          
          // Group unbundled materials by job
          const unbundledByJob = new Map<string, any[]>();
          trulyUnbundled.forEach((material: any) => {
            const sheet = Array.isArray(material.material_sheets) ? material.material_sheets[0] : material.material_sheets;
            if (!sheet) {
              console.warn('⚠️ Material has no sheet:', material.id, material.material_name);
              return;
            }
            
            const job = workbookJobMap.get(sheet.workbook_id);
            if (!job) {
              console.warn('⚠️ Sheet has no job:', sheet.sheet_name, sheet.workbook_id);
              return;
            }
            
            const jobId = job.id;
            
            console.log('✅ Processed unbundled material:', {
              materialId: material.id,
              materialName: material.material_name,
              sheet: sheet.sheet_name,
              jobId,
              jobName: job.name
            });
            
            if (!unbundledByJob.has(jobId)) {
              unbundledByJob.set(jobId, []);
            }
            unbundledByJob.get(jobId)!.push({
              ...material,
              sheets: sheet,
              job: job
            });
          });
          
          // Create virtual packages for unbundled materials
          const virtualPackages: MaterialBundle[] = Array.from(unbundledByJob.entries()).map(([jobId, materials]) => {
            const firstMaterial = materials[0];
            
            return {
              id: `unbundled-${jobId}`,
              job_id: jobId,
              name: `Unbundled Materials`,
              description: 'Materials not yet assigned to a package',
              status: 'not_ordered',
              jobs: {
                name: firstMaterial.job?.name || 'Unknown Job',
                client_name: firstMaterial.job?.client_name || '',
              },
              bundle_items: materials.map(material => ({
                id: `virtual-${material.id}`,
                bundle_id: `unbundled-${jobId}`,
                material_item_id: material.id,
                material_items: {
                  id: material.id,
                  sheet_id: material.sheet_id,
                  category: material.category,
                  material_name: material.material_name,
                  quantity: material.quantity,
                  length: material.length,
                  usage: material.usage,
                  status: material.status,
                  cost_per_unit: material.cost_per_unit,
                  sheets: {
                    sheet_name: material.sheets?.sheet_name || 'Unknown Sheet'
                  },
                },
              })),
            };
          });
          
          console.log(`📦 Created ${virtualPackages.length} virtual packages for unbundled materials`);
          
          // Combine bundled and unbundled packages
          const finalPackages = [...packagesWithShopMaterials, ...virtualPackages];
          console.log(`✅ FINAL: Setting ${finalPackages.length} total packages (${packagesWithShopMaterials.length} bundled + ${virtualPackages.length} unbundled)`);
          
          if (finalPackages.length === 0) {
            console.error('❌ NO PACKAGES TO DISPLAY! This is a problem.');
            toast.error('No materials found. Please contact office if materials should be visible.');
          }
          
          setPackages(finalPackages);
        }
      }
    } catch (error: any) {
      console.error('❌ Error loading packages:', error);
      toast.error('Failed to load packages. Check console for details.');
    } finally {
      setLoading(false);
    }
  }

  async function updateMaterialStatus(materialId: string, bundleId: string, newStatus: 'ready_for_job' | 'at_job') {
    if (processingMaterials.has(materialId)) return;
    
    setProcessingMaterials(prev => new Set(prev).add(materialId));

    try {
      console.log(`🔄 Updating material ${materialId} to ${newStatus}`);
      
      // Update material status
      const { error: materialError } = await supabase
        .from('material_items')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (materialError) throw materialError;

      // Check if this is the first material in the package being marked as ready
      // Get all materials in the package (only for non-virtual bundles)
      if (!bundleId.startsWith('unbundled-')) {
        const { data: bundleItems, error: bundleItemsError } = await supabase
          .from('material_bundle_items')
          .select(`
            material_item_id,
            material_items!inner(status)
          `)
          .eq('bundle_id', bundleId);

        if (bundleItemsError) throw bundleItemsError;

        // Count how many materials are now ready_for_job or at_job
        const readyMaterials = bundleItems?.filter(
          (item: any) => item.material_items.status === 'ready_for_job' || item.material_items.status === 'at_job'
        ).length || 0;

        console.log(`📊 Package ${bundleId}: ${readyMaterials}/${bundleItems?.length || 0} materials ready`);

        // If this is the first material being marked ready, update package status
        if (readyMaterials === 1) {
          console.log('🔄 First material marked ready - updating package status');
          const { error: packageError } = await supabase
            .from('material_bundles')
            .update({
              status: 'delivered', // Database value for ready_for_job
              updated_at: new Date().toISOString(),
            })
            .eq('id', bundleId);

          if (packageError) throw packageError;
        }
      }

      toast.success(`Material marked as ${newStatus === 'ready_for_job' ? 'Ready for Job' : 'At Job'}`);

      loadPackages();
    } catch (error: any) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material status');
    } finally {
      setProcessingMaterials(prev => {
        const newSet = new Set(prev);
        newSet.delete(materialId);
        return newSet;
      });
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
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Package className="w-6 h-6 text-purple-600" />
                Shop Material Packages
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Process material packages and prepare them for job sites
              </p>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2 bg-purple-50">
              Packages to Process: {pullFromShopPackages.length}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Search & Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search packages, materials, job, or client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Job Filter */}
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger>
                <SelectValue placeholder="All Jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs.map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.name} - {job.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Material Packages */}
      {pullFromShopPackages.length > 0 && (
        <div className="space-y-3">

          {pullFromShopPackages.map(pkg => {
            const isExpanded = expandedPackages.has(pkg.id);
            const pullFromShopItems = pkg.bundle_items.filter(
              item => item.material_items.status === 'pull_from_shop'
            );
            
            return (
              <Card key={pkg.id} className="border-2 border-purple-200">
                <Collapsible open={isExpanded} onOpenChange={() => togglePackageExpanded(pkg.id)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer bg-gradient-to-r from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-purple-600" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-purple-600" />
                          )}
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Package className="w-5 h-5 text-purple-600" />
                              {pkg.name}
                              <Badge className={`text-xs ${getStatusColor(pkg.status)}`}>
                                {getStatusLabel(pkg.status)}
                              </Badge>
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                              Job: {pkg.jobs.name} • Client: {pkg.jobs.client_name}
                            </p>
                            {pkg.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {pkg.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="font-semibold bg-white">
                          {pullFromShopItems.length} to pull
                        </Badge>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full table-fixed">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              <th className="text-left p-3 font-semibold w-full">Material</th>
                              <th className="text-center p-3 font-semibold whitespace-nowrap">Qty</th>
                              <th className="text-center p-3 font-semibold whitespace-nowrap">Color</th>
                              <th className="text-center p-3 font-semibold whitespace-nowrap">Length</th>
                              <th className="text-center p-3 font-semibold w-12"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pullFromShopItems.map((item) => (
                              <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-3 font-medium break-words">{item.material_items.material_name}</td>
                                <td className="p-3 text-center font-semibold whitespace-nowrap">
                                  {item.material_items.quantity}
                                </td>
                                <td className="p-3 text-center whitespace-nowrap">
                                  {item.material_items.color ? (
                                    <Badge variant="outline" className="bg-blue-50">
                                      {item.material_items.color}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="p-3 text-center whitespace-nowrap">
                                  {item.material_items.length || '-'}
                                </td>
                                <td className="p-3">
                                  <div className="flex justify-center">
                                    <Button
                                      size="sm"
                                      onClick={() => updateMaterialStatus(item.material_items.id, pkg.id, 'ready_for_job')}
                                      disabled={processingMaterials.has(item.material_items.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700 h-8 w-8 p-0"
                                      title="Mark as Ready"
                                    >
                                      {processingMaterials.has(item.material_items.id) ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {filteredPackages.length === 0 && (
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
