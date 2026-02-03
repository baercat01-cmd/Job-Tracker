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
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'ready_for_job', label: 'Ready for Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

export function ShopMaterialsDialog({ open, onClose, onJobSelect }: ShopMaterialsDialogProps) {
  const [materialsReadyForJob, setMaterialsReadyForJob] = useState<Material[]>([]);
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

      // Load materials ready for job
      const { data: readyForJobData, error: readyForJobError } = await supabase
        .from('materials')
        .select(`
          *,
          job:jobs(id, name, client_name),
          category:materials_categories(name)
        `)
        .eq('status', 'ready_for_job')
        .order('pull_by_date', { ascending: true, nulls: 'last' });

      if (readyForJobError) {
        console.error('Error loading ready_for_job materials:', readyForJobError);
        throw readyForJobError;
      }
      console.log('Ready for job materials:', readyForJobData?.length || 0);

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

      setMaterialsReadyForJob(readyForJobData || []);
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

  const totalReadyForJob = materialsReadyForJob.length;
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
  const readyForJobByJob = groupMaterialsByJob(materialsReadyForJob);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Shop Materials
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading materials...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-amber-600 bg-gradient-to-br from-amber-50 to-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Need to Pull</p>
                      <p className="text-3xl font-bold text-slate-900">{totalReadyToPull}</p>
                    </div>
                    <ArrowRight className="w-8 h-8 text-amber-600" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-600 bg-gradient-to-br from-green-50 to-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-green-900">Ready for Job</p>
                      <p className="text-3xl font-bold text-slate-900">{totalReadyForJob}</p>
                    </div>
                    <Package className="w-8 h-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column: Need to Pull */}
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-amber-100 to-amber-50 border-2 border-amber-700 rounded-lg p-3">
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-amber-700" />
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
                          className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-amber-500 p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all shadow-md"
                          onClick={() => {
                            onJobSelect?.(jobId);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-base text-white">{job.name}</p>
                              <p className="text-xs text-amber-100">{job.client_name}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs bg-amber-500 text-slate-900 font-semibold">
                              {materials.length} item{materials.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Materials for this job */}
                        <div className="space-y-2 pl-2">
                          {materials.map((material) => (
                            <Card key={material.id} className="border-l-4 border-l-amber-600 bg-white hover:shadow-md transition-shadow">
                              <CardContent className="py-2 px-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs border-slate-300">
                                      {material.category?.name || 'Uncategorized'}
                                    </Badge>
                                    {material.pull_by_date && (
                                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-900 border border-amber-300">
                                        {new Date(material.pull_by_date).toLocaleDateString()}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-bold text-sm text-slate-900 truncate">{material.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    <span>Qty: {material.quantity}</span>
                                    {material.length && <span>• {material.length}</span>}
                                    {material.color && <span>• {material.color}</span>}
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
                <div className="bg-gradient-to-r from-green-100 to-green-50 border-2 border-green-700 rounded-lg p-3">
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-green-700" />
                    Ready for Job ({totalReadyForJob})
                  </h3>
                </div>
                
                {totalReadyForJob === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No materials ready for job</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Array.from(readyForJobByJob.entries()).map(([jobId, { job, materials }]) => (
                      <div key={jobId} className="space-y-2">
                        {/* Job Header */}
                        <div 
                          className="bg-gradient-to-r from-slate-800 to-slate-700 border-l-4 border-green-500 p-3 cursor-pointer hover:from-slate-700 hover:to-slate-600 transition-all shadow-md"
                          onClick={() => {
                            onJobSelect?.(jobId);
                            onClose();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-base text-white">{job.name}</p>
                              <p className="text-xs text-green-100">{job.client_name}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs bg-green-500 text-slate-900 font-semibold">
                              {materials.length} item{materials.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Materials for this job */}
                        <div className="space-y-2 pl-2">
                          {materials.map((material) => (
                            <Card key={material.id} className="border-l-4 border-l-green-600 bg-white hover:shadow-md transition-shadow">
                              <CardContent className="py-2 px-3">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs border-slate-300">
                                      {material.category?.name || 'Uncategorized'}
                                    </Badge>
                                    {material.pull_by_date && (
                                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-900 border border-green-300">
                                        {new Date(material.pull_by_date).toLocaleDateString()}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-bold text-sm text-slate-900 truncate">{material.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    <span>Qty: {material.quantity}</span>
                                    {material.length && <span>• {material.length}</span>}
                                    {material.color && <span>• {material.color}</span>}
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
            {totalReadyForJob === 0 && totalReadyToPull === 0 && (
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
