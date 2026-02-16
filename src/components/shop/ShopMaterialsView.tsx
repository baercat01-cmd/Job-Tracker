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
import { Search, X, CheckCircle2, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

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
      
      console.log('🔍 Loading packages with materials that need shop processing...');
      
      // Get ALL packages that contain materials with pull_from_shop, ready_for_job, or at_job status
      const { data, error } = await supabase
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
              usage,
              status,
              cost_per_unit,
              sheets:material_sheets(sheet_name)
            )
          )
        `)
        .order('name');

      if (error) {
        console.error('❌ Error loading packages:', error);
        throw error;
      }

      console.log(`📦 Found ${data?.length || 0} total packages`);
      
      // Transform Supabase response to match our interface
      const transformedPackages: MaterialBundle[] = (data || []).map((pkg: SupabaseBundleResponse) => ({
        ...pkg,
        jobs: pkg.jobs[0], // Take first element from array
        bundle_items: pkg.bundle_items.map(item => ({
          ...item,
          material_items: {
            ...item.material_items[0], // Take first element from array
            sheets: item.material_items[0].sheets[0], // Take first element from array
          },
        })),
      }));
      
      // Filter to only include packages that have materials with pull_from_shop, ready_for_job, or at_job status
      const packagesWithShopMaterials = transformedPackages.filter(pkg => 
        pkg.bundle_items.some(item => 
          item.material_items.status === 'pull_from_shop' || 
          item.material_items.status === 'ready_for_job' ||
          item.material_items.status === 'at_job'
        )
      );
      
      console.log(`✅ Found ${packagesWithShopMaterials.length} packages with shop materials`);
      
      // ALSO load unbundled materials that have pull_from_shop, ready_for_job, or at_job status
      // These are materials that haven't been added to a bundle yet
      const { data: unbundledMaterials, error: unbundledError } = await supabase
        .from('material_items')
        .select(`
          id,
          sheet_id,
          category,
          material_name,
          quantity,
          length,
          usage,
          status,
          cost_per_unit,
          sheets:material_sheets!inner(
            sheet_name,
            workbook_id,
            material_workbooks!inner(
              job_id,
              jobs!inner(
                id,
                name,
                client_name
              )
            )
          )
        `)
        .in('status', ['pull_from_shop', 'ready_for_job', 'at_job'])
        .order('material_name');

      if (unbundledError) {
        console.error('❌ Error loading unbundled materials:', unbundledError);
      } else {
        console.log(`📋 Found ${unbundledMaterials?.length || 0} total materials with shop statuses`);
        
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
        
        console.log(`🔓 Found ${trulyUnbundled.length} unbundled materials needing shop processing`);
        
        // Group unbundled materials by job
        const unbundledByJob = new Map<string, any[]>();
        trulyUnbundled.forEach((material: any) => {
          // Extract nested data - Supabase returns arrays for joins
          const sheet = Array.isArray(material.sheets) ? material.sheets[0] : material.sheets;
          if (!sheet) {
            console.warn('Material has no sheet:', material.id, material.material_name);
            return;
          }
          
          const workbook = Array.isArray(sheet.material_workbooks) ? sheet.material_workbooks[0] : sheet.material_workbooks;
          if (!workbook) {
            console.warn('Sheet has no workbook:', sheet.sheet_name);
            return;
          }
          
          const job = Array.isArray(workbook.jobs) ? workbook.jobs[0] : workbook.jobs;
          if (!job) {
            console.warn('Workbook has no job:', workbook.workbook_id);
            return;
          }
          
          const jobId = job.id;
          
          console.log('✅ Processing unbundled material:', {
            materialId: material.id,
            materialName: material.material_name,
            sheet: sheet.sheet_name,
            jobId,
            jobName: job.name
          });
          
          if (!unbundledByJob.has(jobId)) {
            unbundledByJob.set(jobId, []);
          }
          unbundledByJob.get(jobId)!.push(material);
        });
        
        // Create virtual packages for unbundled materials
        const virtualPackages: MaterialBundle[] = Array.from(unbundledByJob.entries()).map(([jobId, materials]) => {
          const firstMaterial = materials[0];
          // Extract nested data
          const sheet = Array.isArray(firstMaterial.sheets) ? firstMaterial.sheets[0] : firstMaterial.sheets;
          const workbook = Array.isArray(sheet?.material_workbooks) ? sheet.material_workbooks[0] : sheet?.material_workbooks;
          const job = Array.isArray(workbook?.jobs) ? workbook.jobs[0] : workbook?.jobs;
          
          return {
            id: `unbundled-${jobId}`,
            job_id: jobId,
            name: `Unbundled Materials`,
            description: 'Materials not yet assigned to a package',
            status: 'not_ordered',
            jobs: {
              name: job?.name || 'Unknown Job',
              client_name: job?.client_name || '',
            },
            bundle_items: materials.map(material => {
              const matSheet = Array.isArray(material.sheets) ? material.sheets[0] : material.sheets;
              return {
                id: `virtual-${material.id}`,
                bundle_id: `unbundled-${jobId}`,
                material_item_id: material.id,
                material_items: {
                  ...material,
                  sheets: {
                    sheet_name: matSheet?.sheet_name || 'Unknown Sheet'
                  },
                },
              };
            }),
          };
        });
        
        console.log(`📦 Created ${virtualPackages.length} virtual packages for unbundled materials`);
        
        // Combine bundled and unbundled packages
        setPackages([...packagesWithShopMaterials, ...virtualPackages]);
      }
    } catch (error: any) {
      console.error('Error loading packages:', error);
      toast.error('Failed to load packages');
    } finally {
      setLoading(false);
    }
  }

  async function markMaterialReady(materialId: string, bundleId: string) {
    if (processingMaterials.has(materialId)) return;
    
    setProcessingMaterials(prev => new Set(prev).add(materialId));

    try {
      console.log(`🔄 Marking material ${materialId} as ready_for_job`);
      
      // Update material status to ready_for_job
      const { error: materialError } = await supabase
        .from('material_items')
        .update({ 
          status: 'ready_for_job',
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (materialError) throw materialError;

      // Check if this is the first material in the package being marked as ready
      // Get all materials in the package
      const { data: bundleItems, error: bundleItemsError } = await supabase
        .from('material_bundle_items')
        .select(`
          material_item_id,
          material_items!inner(status)
        `)
        .eq('bundle_id', bundleId);

      if (bundleItemsError) throw bundleItemsError;

      // Count how many materials are now ready_for_job
      const readyMaterials = bundleItems?.filter(
        (item: any) => item.material_items.status === 'ready_for_job'
      ).length || 0;

      console.log(`📊 Package ${bundleId}: ${readyMaterials}/${bundleItems?.length || 0} materials ready`);

      // If this is the first material being marked ready, update package status to ready_for_job
      if (readyMaterials === 1) {
        console.log('🔄 First material marked ready - updating package to ready_for_job');
        const { error: packageError } = await supabase
          .from('material_bundles')
          .update({
            status: 'delivered', // Database value for ready_for_job
            updated_at: new Date().toISOString(),
          })
          .eq('id', bundleId);

        if (packageError) throw packageError;
        toast.success('Material marked ready - Package moved to Ready for Job');
      } else {
        toast.success('Material marked ready');
      }

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

  // Group packages by whether they have any pull_from_shop materials or are fully ready
  const pullFromShopPackages = filteredPackages.filter(pkg => 
    pkg.bundle_items.some(item => 
      item.material_items.status === 'pull_from_shop'
    )
  );
  const readyForJobPackages = filteredPackages.filter(pkg => 
    pkg.bundle_items.some(item => 
      item.material_items.status === 'ready_for_job' ||
      item.material_items.status === 'at_job'
    ) && !pkg.bundle_items.some(item => 
      item.material_items.status === 'pull_from_shop'
    )
  );

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
            <div className="flex gap-3">
              <Badge variant="outline" className="text-lg px-4 py-2 bg-purple-50">
                Pull from Shop: {pullFromShopPackages.length}
              </Badge>
              <Badge variant="outline" className="text-lg px-4 py-2 bg-emerald-50">
                Ready for Job: {readyForJobPackages.length}
              </Badge>
            </div>
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

      {/* Pull from Shop Section */}
      {pullFromShopPackages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-purple-200" />
            <h3 className="text-lg font-bold text-purple-700 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Pull from Shop ({pullFromShopPackages.length})
            </h3>
            <div className="h-px flex-1 bg-purple-200" />
          </div>

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
                        <table className="w-full">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              <th className="text-left p-3 font-semibold">Sheet</th>
                              <th className="text-left p-3 font-semibold">Category</th>
                              <th className="text-left p-3 font-semibold">Material</th>
                              <th className="text-left p-3 font-semibold">Usage</th>
                              <th className="text-center p-3 font-semibold">Qty</th>
                              <th className="text-center p-3 font-semibold">Length</th>
                              <th className="text-center p-3 font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pullFromShopItems.map((item) => (
                              <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                  <Badge variant="outline" className="bg-blue-50">
                                    {item.material_items.sheets.sheet_name}
                                  </Badge>
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline">{item.material_items.category}</Badge>
                                </td>
                                <td className="p-3 font-medium">{item.material_items.material_name}</td>
                                <td className="p-3 text-sm text-muted-foreground">
                                  {item.material_items.usage || '-'}
                                </td>
                                <td className="p-3 text-center font-semibold">
                                  {item.material_items.quantity}
                                </td>
                                <td className="p-3 text-center">
                                  {item.material_items.length || '-'}
                                </td>
                                <td className="p-3">
                                  <div className="flex justify-center">
                                    <Button
                                      size="sm"
                                      onClick={() => markMaterialReady(item.material_items.id, pkg.id)}
                                      disabled={processingMaterials.has(item.material_items.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                      {processingMaterials.has(item.material_items.id) ? (
                                        <>
                                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                          Processing...
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 className="w-4 h-4 mr-2" />
                                          Mark Ready
                                        </>
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

      {/* Ready for Job Section */}
      {readyForJobPackages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-emerald-200" />
            <h3 className="text-lg font-bold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Ready for Job ({readyForJobPackages.length})
            </h3>
            <div className="h-px flex-1 bg-emerald-200" />
          </div>

          {readyForJobPackages.map(pkg => {
            const isExpanded = expandedPackages.has(pkg.id);
            const readyItems = pkg.bundle_items.filter(
              item => item.material_items.status === 'ready_for_job'
            );
            const atJobItems = pkg.bundle_items.filter(
              item => item.material_items.status === 'at_job'
            );
            const pullItems = pkg.bundle_items.filter(
              item => item.material_items.status === 'pull_from_shop'
            );
            
            return (
              <Card key={pkg.id} className="border-2 border-emerald-200">
                <Collapsible open={isExpanded} onOpenChange={() => togglePackageExpanded(pkg.id)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer bg-gradient-to-r from-emerald-50 to-emerald-100/50 hover:from-emerald-100 hover:to-emerald-200/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-emerald-600" />
                          )}
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Package className="w-5 h-5 text-emerald-600" />
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
                        <div className="flex gap-2">
                          {atJobItems.length > 0 && (
                            <Badge variant="outline" className="font-semibold bg-teal-50 text-teal-700">
                              {atJobItems.length} at job
                            </Badge>
                          )}
                          {readyItems.length > 0 && (
                            <Badge variant="outline" className="font-semibold bg-emerald-50 text-emerald-700">
                              {readyItems.length} ready
                            </Badge>
                          )}
                          {pullItems.length > 0 && (
                            <Badge variant="outline" className="font-semibold bg-purple-50 text-purple-700">
                              {pullItems.length} to pull
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-0">
                      {/* At Job Materials */}
                      {atJobItems.length > 0 && (
                        <div>
                          <div className="bg-teal-50 px-4 py-2 border-b">
                            <h4 className="font-semibold text-teal-900 text-sm">
                              ✓ At Job ({atJobItems.length})
                            </h4>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-muted/50 border-b">
                                <tr>
                                  <th className="text-left p-3 font-semibold">Sheet</th>
                                  <th className="text-left p-3 font-semibold">Category</th>
                                  <th className="text-left p-3 font-semibold">Material</th>
                                  <th className="text-left p-3 font-semibold">Usage</th>
                                  <th className="text-center p-3 font-semibold">Qty</th>
                                  <th className="text-center p-3 font-semibold">Length</th>
                                </tr>
                              </thead>
                              <tbody>
                                {atJobItems.map((item) => (
                                  <tr key={item.id} className="border-b bg-teal-50/30">
                                    <td className="p-3">
                                      <Badge variant="outline" className="bg-blue-50">
                                        {item.material_items.sheets.sheet_name}
                                      </Badge>
                                    </td>
                                    <td className="p-3">
                                      <Badge variant="outline">{item.material_items.category}</Badge>
                                    </td>
                                    <td className="p-3 font-medium">{item.material_items.material_name}</td>
                                    <td className="p-3 text-sm text-muted-foreground">
                                      {item.material_items.usage || '-'}
                                    </td>
                                    <td className="p-3 text-center font-semibold">
                                      {item.material_items.quantity}
                                    </td>
                                    <td className="p-3 text-center">
                                      {item.material_items.length || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Ready Materials */}
                      {readyItems.length > 0 && (
                        <div>
                          <div className="bg-emerald-50 px-4 py-2 border-b">
                            <h4 className="font-semibold text-emerald-900 text-sm">
                              ✓ Ready for Job ({readyItems.length})
                            </h4>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-muted/50 border-b">
                                <tr>
                                  <th className="text-left p-3 font-semibold">Sheet</th>
                                  <th className="text-left p-3 font-semibold">Category</th>
                                  <th className="text-left p-3 font-semibold">Material</th>
                                  <th className="text-left p-3 font-semibold">Usage</th>
                                  <th className="text-center p-3 font-semibold">Qty</th>
                                  <th className="text-center p-3 font-semibold">Length</th>
                                </tr>
                              </thead>
                              <tbody>
                                {readyItems.map((item) => (
                                  <tr key={item.id} className="border-b bg-emerald-50/30">
                                    <td className="p-3">
                                      <Badge variant="outline" className="bg-blue-50">
                                        {item.material_items.sheets.sheet_name}
                                      </Badge>
                                    </td>
                                    <td className="p-3">
                                      <Badge variant="outline">{item.material_items.category}</Badge>
                                    </td>
                                    <td className="p-3 font-medium">{item.material_items.material_name}</td>
                                    <td className="p-3 text-sm text-muted-foreground">
                                      {item.material_items.usage || '-'}
                                    </td>
                                    <td className="p-3 text-center font-semibold">
                                      {item.material_items.quantity}
                                    </td>
                                    <td className="p-3 text-center">
                                      {item.material_items.length || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Still Need to Pull */}
                      {pullItems.length > 0 && (
                        <div>
                          <div className="bg-purple-50 px-4 py-2 border-b">
                            <h4 className="font-semibold text-purple-900 text-sm">
                              Still Need to Pull ({pullItems.length})
                            </h4>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-muted/50 border-b">
                                <tr>
                                  <th className="text-left p-3 font-semibold">Sheet</th>
                                  <th className="text-left p-3 font-semibold">Category</th>
                                  <th className="text-left p-3 font-semibold">Material</th>
                                  <th className="text-left p-3 font-semibold">Usage</th>
                                  <th className="text-center p-3 font-semibold">Qty</th>
                                  <th className="text-center p-3 font-semibold">Length</th>
                                  <th className="text-center p-3 font-semibold">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pullItems.map((item) => (
                                  <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                                    <td className="p-3">
                                      <Badge variant="outline" className="bg-blue-50">
                                        {item.material_items.sheets.sheet_name}
                                      </Badge>
                                    </td>
                                    <td className="p-3">
                                      <Badge variant="outline">{item.material_items.category}</Badge>
                                    </td>
                                    <td className="p-3 font-medium">{item.material_items.material_name}</td>
                                    <td className="p-3 text-sm text-muted-foreground">
                                      {item.material_items.usage || '-'}
                                    </td>
                                    <td className="p-3 text-center font-semibold">
                                      {item.material_items.quantity}
                                    </td>
                                    <td className="p-3 text-center">
                                      {item.material_items.length || '-'}
                                    </td>
                                    <td className="p-3">
                                      <div className="flex justify-center">
                                        <Button
                                          size="sm"
                                          onClick={() => markMaterialReady(item.material_items.id, pkg.id)}
                                          disabled={processingMaterials.has(item.material_items.id)}
                                          className="bg-emerald-600 hover:bg-emerald-700"
                                        >
                                          {processingMaterials.has(item.material_items.id) ? (
                                            <>
                                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                              Processing...
                                            </>
                                          ) : (
                                            <>
                                              <CheckCircle2 className="w-4 h-4 mr-2" />
                                              Mark Ready
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
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
              Packages with materials that have "Pull from Shop", "Ready for Job", or "At Job" status will appear here
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
