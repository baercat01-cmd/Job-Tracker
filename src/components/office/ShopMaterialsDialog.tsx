import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Truck, ArrowRight, ExternalLink } from 'lucide-react';
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
  pickup_date?: string | null;
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
  { value: 'at_shop', label: 'At Shop', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

export function ShopMaterialsDialog({ open, onClose, onJobSelect }: ShopMaterialsDialogProps) {
  const [materialsAtShop, setMaterialsAtShop] = useState<Material[]>([]);
  const [materialsReadyToPull, setMaterialsReadyToPull] = useState<Material[]>([]);
  const [materialsAtJob, setMaterialsAtJob] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadMaterials();
    }
  }, [open]);

  async function loadMaterials() {
    try {
      setLoading(true);

      // Load materials at shop
      const { data: atShopData, error: atShopError } = await supabase
        .from('materials')
        .select(`
          *,
          job:jobs!inner(id, name, client_name, status),
          category:materials_categories(name)
        `)
        .eq('status', 'at_shop')
        .in('jobs.status', ['active', 'prepping'])
        .order('pull_by_date', { ascending: true, nullsFirst: false });

      if (atShopError) throw atShopError;

      // Load materials ready to pull
      const { data: readyToPullData, error: readyToPullError } = await supabase
        .from('materials')
        .select(`
          *,
          job:jobs!inner(id, name, client_name, status),
          category:materials_categories(name)
        `)
        .eq('status', 'ready_to_pull')
        .in('jobs.status', ['active', 'prepping'])
        .order('pull_by_date', { ascending: true, nullsFirst: false });

      if (readyToPullError) throw readyToPullError;

      // Load materials at job (recently delivered)
      const { data: atJobData, error: atJobError } = await supabase
        .from('materials')
        .select(`
          *,
          job:jobs!inner(id, name, client_name, status),
          category:materials_categories(name)
        `)
        .eq('status', 'at_job')
        .in('jobs.status', ['active', 'prepping'])
        .order('pickup_date', { ascending: false, nullsFirst: false })
        .limit(50); // Show recent 50

      if (atJobError) throw atJobError;

      setMaterialsAtShop(atShopData || []);
      setMaterialsReadyToPull(readyToPullData || []);
      setMaterialsAtJob(atJobData || []);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
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
  const totalAtJob = materialsAtJob.length;

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
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-700">At Shop</p>
                      <p className="text-3xl font-bold text-blue-900">{totalAtShop}</p>
                    </div>
                    <Package className="w-8 h-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-700">Ready to Pull</p>
                      <p className="text-3xl font-bold text-purple-900">{totalReadyToPull}</p>
                    </div>
                    <ArrowRight className="w-8 h-8 text-purple-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700">At Job</p>
                      <p className="text-3xl font-bold text-green-900">{totalAtJob}</p>
                    </div>
                    <Truck className="w-8 h-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Materials Ready to Pull (Priority) */}
            {totalReadyToPull > 0 && (
              <Card className="border-purple-300 border-2">
                <CardHeader className="bg-purple-50">
                  <CardTitle className="flex items-center gap-2 text-purple-900">
                    <ArrowRight className="w-5 h-5" />
                    Ready to Pull ({totalReadyToPull})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {materialsReadyToPull.map((material) => (
                      <Card key={material.id} className="border-l-4 border-l-purple-500">
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {material.category?.name || 'Uncategorized'}
                                </Badge>
                                {material.pull_by_date && (
                                  <Badge variant="secondary" className="text-xs">
                                    Pull by: {new Date(material.pull_by_date).toLocaleDateString()}
                                  </Badge>
                                )}
                              </div>
                              <p className="font-bold text-base mb-1">{material.name}</p>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>Qty: {material.quantity}</span>
                                {material.length && <span>Length: {material.length}</span>}
                                {material.color && <span>Color: {material.color}</span>}
                              </div>
                              {material.job && (
                                <button
                                  onClick={() => {
                                    onJobSelect?.(material.job_id);
                                    onClose();
                                  }}
                                  className="flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {material.job.name} - {material.job.client_name}
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Select
                                value={material.status}
                                onValueChange={(value) => updateMaterialStatus(material.id, value)}
                              >
                                <SelectTrigger className={`w-48 h-8 font-medium border-2 text-xs ${getStatusColor(material.status)}`}>
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
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Materials At Shop */}
            {totalAtShop > 0 && (
              <Card className="border-blue-300 border-2">
                <CardHeader className="bg-blue-50">
                  <CardTitle className="flex items-center gap-2 text-blue-900">
                    <Package className="w-5 h-5" />
                    At Shop ({totalAtShop})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {materialsAtShop.map((material) => (
                      <Card key={material.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {material.category?.name || 'Uncategorized'}
                                </Badge>
                                {material.pull_by_date && (
                                  <Badge variant="secondary" className="text-xs">
                                    Pull by: {new Date(material.pull_by_date).toLocaleDateString()}
                                  </Badge>
                                )}
                              </div>
                              <p className="font-bold text-base mb-1">{material.name}</p>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>Qty: {material.quantity}</span>
                                {material.length && <span>Length: {material.length}</span>}
                                {material.color && <span>Color: {material.color}</span>}
                              </div>
                              {material.job && (
                                <button
                                  onClick={() => {
                                    onJobSelect?.(material.job_id);
                                    onClose();
                                  }}
                                  className="flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {material.job.name} - {material.job.client_name}
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Select
                                value={material.status}
                                onValueChange={(value) => updateMaterialStatus(material.id, value)}
                              >
                                <SelectTrigger className={`w-48 h-8 font-medium border-2 text-xs ${getStatusColor(material.status)}`}>
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
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Materials At Job */}
            {totalAtJob > 0 && (
              <Card className="border-green-300">
                <CardHeader className="bg-green-50">
                  <CardTitle className="flex items-center gap-2 text-green-900">
                    <Truck className="w-5 h-5" />
                    At Job ({totalAtJob})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {materialsAtJob.map((material) => (
                      <Card key={material.id} className="border-l-4 border-l-green-500">
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {material.category?.name || 'Uncategorized'}
                                </Badge>
                                {material.pickup_date && (
                                  <Badge variant="secondary" className="text-xs">
                                    Delivered: {new Date(material.pickup_date).toLocaleDateString()}
                                  </Badge>
                                )}
                              </div>
                              <p className="font-bold text-base mb-1">{material.name}</p>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>Qty: {material.quantity}</span>
                                {material.length && <span>Length: {material.length}</span>}
                                {material.color && <span>Color: {material.color}</span>}
                              </div>
                              {material.job && (
                                <button
                                  onClick={() => {
                                    onJobSelect?.(material.job_id);
                                    onClose();
                                  }}
                                  className="flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {material.job.name} - {material.job.client_name}
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Select
                                value={material.status}
                                onValueChange={(value) => updateMaterialStatus(material.id, value)}
                              >
                                <SelectTrigger className={`w-48 h-8 font-medium border-2 text-xs ${getStatusColor(material.status)}`}>
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
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {totalAtShop === 0 && totalReadyToPull === 0 && totalAtJob === 0 && (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-semibold mb-2">No Materials Found</p>
                <p className="text-sm text-muted-foreground">
                  There are currently no materials at the shop, ready to pull, or at job sites
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
