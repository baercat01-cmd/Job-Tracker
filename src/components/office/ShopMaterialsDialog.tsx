
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
import { Package, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
}

export function ShopMaterialsDialog({ open, onClose, onJobSelect }: ShopMaterialsDialogProps) {
  const [packages, setPackages] = useState<MaterialBundle[]>([]);
  const [loading, setLoading] = useState(false);

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
        jobs: pkg.jobs, // This was `pkg.jobs[0]`, but Supabase `!inner` join should return an object if there's one, or null. If it's an array, it means there are multiple jobs, which is unexpected for `job_id`
        bundle_items: pkg.bundle_items.map((item: any) => ({
          ...item,
          material_items: {
            ...item.material_items, // This was `item.material_items[0]`
            sheets: item.material_items.sheets, // This was `item.material_items[0].sheets[0]`
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

  // Separate packages by status
  const pullFromShopPackages = packages.filter(pkg => 
    pkg.bundle_items.some(item => 
      item.material_items.status === 'pull_from_shop'
    )
  );
  
  const readyForJobPackages = packages.filter(pkg => 
    pkg.bundle_items.some(item => // Changed .every() to .some() because a package can have both 'ready_for_job' and 'pull_from_shop'
      item.material_items.status === 'ready_for_job'
    )
  );

  const totalReadyToPull = pullFromShopPackages.reduce((sum, pkg) => 
    sum + pkg.bundle_items.filter(item => item.material_items.status === 'pull_from_shop').length, 0
  );
  
  const totalAtShop = readyForJobPackages.reduce((sum, pkg) => 
    sum + pkg.bundle_items.filter(item => item.material_items.status === 'ready_for_job').length, 0
  );

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
                  <div className="space-y-6">
                    {pullFromShopPackages.map((pkg) => {
                      const pullItems = pkg.bundle_items.filter(item => 
                        item.material_items.status === 'pull_from_shop'
                      );
                      
                      return (
                      <div key={pkg.id} className="space-y-2">
                        {/* Package Header */}
                        <div 
                          className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-purple-500 p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all shadow-md"
                          onClick={() => {
                            onJobSelect?.(pkg.job_id);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-base text-white flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                {pkg.name}
                              </p>
                              <p className="text-xs text-purple-100">{pkg.jobs.name} - {pkg.jobs.client_name}</p>
                              {pkg.description && (
                                <p className="text-xs text-purple-200 mt-1">{pkg.description}</p>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-xs bg-purple-500 text-slate-900 font-semibold">
                              {pullItems.length} item{pullItems.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Materials in this package */}
                        <div className="space-y-2 pl-2">
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
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
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
                  <div className="space-y-6">
                    {readyForJobPackages.map((pkg) => {
                      const readyItems = pkg.bundle_items.filter(item => 
                        item.material_items.status === 'ready_for_job'
                      );
                      
                      return (
                      <div key={pkg.id} className="space-y-2">
                        {/* Package Header */}
                        <div 
                          className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-blue-500 p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all shadow-md"
                          onClick={() => {
                            onJobSelect?.(pkg.job_id);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-base text-white flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                {pkg.name}
                              </p>
                              <p className="text-xs text-blue-100">{pkg.jobs.name} - {pkg.jobs.client_name}</p>
                              {pkg.description && (
                                <p className="text-xs text-blue-200 mt-1">{pkg.description}</p>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-xs bg-blue-500 text-slate-900 font-semibold">
                              {readyItems.length} item{readyItems.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Materials in this package */}
                        <div className="space-y-2 pl-2">
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
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
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
