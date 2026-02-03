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

interface Material {
  id: string;
  name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  status: string;
  job_id: string;
  category_id: string;
  pull_by_date?: string | null;
  job?: {
    id: string;
    name: string;
    client_name: string;
  };
  category?: {
    name: string;
  };
}

interface ShopMaterialsDialogProps {
  open: boolean;
  onClose: () => void;
  onJobSelect?: (jobId: string) => void;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_shop', label: 'Ready for Job', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'installed', label: 'Installed', color: 'bg-slate-800 text-white border-slate-800' },
  { value: 'missing', label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

export function ShopMaterialsDialog({ open, onClose, onJobSelect }: ShopMaterialsDialogProps) {
  const [materialsAtShop, setMaterialsAtShop] = useState<Material[]>([]);
  const [materialsReadyToPull, setMaterialsReadyToPull] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadMaterials();
    }
  }, [open]);

  async function loadMaterials() {
    try {
      setLoading(true);
      console.log('Loading shop materials...');

      // Load materials at shop
      const { data: atShopData, error: atShopError } = await supabase
        .from('materials')
        .select(`
          *,
          job:jobs(id, name, client_name),
          category:materials_categories(name)
        `)
        .eq('status', 'at_shop')
        .order('pull_by_date', { ascending: true, nulls: 'last' });

      if (atShopError) {
        console.error('Error loading at_shop materials:', atShopError);
        throw atShopError;
      }
      console.log('At shop materials:', atShopData?.length || 0);

      // Load materials ready to pull
      const { data: readyToPullData, error: readyToPullError } = await supabase
        .from('materials')
        .select(`
          *,
          job:jobs(id, name, client_name),
          category:materials_categories(name)
        `)
        .eq('status', 'ready_to_pull')
        .order('pull_by_date', { ascending: true, nulls: 'last' });

      if (readyToPullError) {
        console.error('Error loading ready_to_pull materials:', readyToPullError);
        throw readyToPullError;
      }
      console.log('Ready to pull materials:', readyToPullData?.length || 0);

      setMaterialsAtShop(atShopData || []);
      setMaterialsReadyToPull(readyToPullData || []);
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
        .from('materials')
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

  const totalAtShop = materialsAtShop.length;
  const totalReadyToPull = materialsReadyToPull.length;

  // Group materials by job
  function groupMaterialsByJob(materials: Material[]): Map<string, { job: any; materials: Material[] }> {
    const grouped = new Map<string, { job: any; materials: Material[] }>();
    
    materials.forEach(material => {
      if (!material.job) return;
      
      const jobId = material.job.id;
      if (!grouped.has(jobId)) {
        grouped.set(jobId, {
          job: material.job,
          materials: []
        });
      }
      grouped.get(jobId)!.materials.push(material);
    });
    
    return grouped;
  }

  const readyToPullByJob = groupMaterialsByJob(materialsReadyToPull);
  const atShopByJob = groupMaterialsByJob(materialsAtShop);

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
                    {Array.from(readyToPullByJob.entries()).map(([jobId, { job, materials }]) => (
                      <div key={jobId} className="space-y-2">
                        {/* Job Header */}
                        <div 
                          className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-purple-500 p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all shadow-md"
                          onClick={() => {
                            onJobSelect?.(jobId);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-base text-white">{job.name}</p>
                              <p className="text-xs text-purple-100">{job.client_name}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs bg-purple-500 text-slate-900 font-semibold">
                              {materials.length} item{materials.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Materials for this job */}
                        <div className="space-y-2 pl-2">
                          {materials.map((material) => (
                            <Card key={material.id} className="border-l-4 border-l-purple-600 bg-white hover:shadow-md transition-shadow">
                              <CardContent className="py-2 px-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs border-slate-300">
                                      {material.category?.name || 'Uncategorized'}
                                    </Badge>
                                    {material.pull_by_date && (
                                      <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-900 border border-purple-300">
                                        Pull by: {new Date(material.pull_by_date).toLocaleDateString()}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-bold text-sm text-slate-900">{material.name}</p>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>Qty: {material.quantity}</span>
                                    {material.length && <span>Length: {material.length}</span>}
                                    {material.color && <span>Color: {material.color}</span>}
                                  </div>
                                  <Select
                                    value={material.status}
                                    onValueChange={(value) => updateMaterialStatus(material.id, value)}
                                  >
                                    <SelectTrigger className={`w-full h-7 font-medium border text-xs ${getStatusColor(material.status)}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
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
                    {Array.from(atShopByJob.entries()).map(([jobId, { job, materials }]) => (
                      <div key={jobId} className="space-y-2">
                        {/* Job Header */}
                        <div 
                          className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-blue-500 p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all shadow-md"
                          onClick={() => {
                            onJobSelect?.(jobId);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-base text-white">{job.name}</p>
                              <p className="text-xs text-blue-100">{job.client_name}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs bg-blue-500 text-slate-900 font-semibold">
                              {materials.length} item{materials.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Materials for this job */}
                        <div className="space-y-2 pl-2">
                          {materials.map((material) => (
                            <Card key={material.id} className="border-l-4 border-l-blue-600 bg-white hover:shadow-md transition-shadow">
                              <CardContent className="py-2 px-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs border-slate-300">
                                      {material.category?.name || 'Uncategorized'}
                                    </Badge>
                                    {material.pull_by_date && (
                                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-900 border border-blue-300">
                                        Pull by: {new Date(material.pull_by_date).toLocaleDateString()}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-bold text-sm text-slate-900">{material.name}</p>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>Qty: {material.quantity}</span>
                                    {material.length && <span>Length: {material.length}</span>}
                                    {material.color && <span>Color: {material.color}</span>}
                                  </div>
                                  <Select
                                    value={material.status}
                                    onValueChange={(value) => updateMaterialStatus(material.id, value)}
                                  >
                                    <SelectTrigger className={`w-full h-7 font-medium border text-xs ${getStatusColor(material.status)}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
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
