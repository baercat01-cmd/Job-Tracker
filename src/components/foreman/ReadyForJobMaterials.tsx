import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Package, Search, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface Material {
  id: string;
  name: string;
  quantity: number;
  length: string | null;
  use_case: string | null;
  status: string;
  job_id: string;
  category_id: string;
}

interface MaterialWithJob extends Material {
  job_name: string;
  client_name: string;
  category_name: string;
}

interface ReadyForJobMaterialsProps {
  userId: string;
  currentJobId?: string;
}

export function ReadyForJobMaterials({ userId, currentJobId }: ReadyForJobMaterialsProps) {
  const [materials, setMaterials] = useState<MaterialWithJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentJobId) {
      loadMaterials();
      
      // Subscribe to material changes
      const channel = supabase
        .channel('ready_materials_changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'materials' },
          () => {
            loadMaterials();
          }
        )
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentJobId]);



  async function loadMaterials() {
    if (!currentJobId) return;
    
    try {
      setLoading(true);
      
      // Get materials with status "at_shop" (Ready for Job) for current job only
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select(`
          *,
          jobs!inner(
            id,
            name,
            client_name,
            status
          ),
          materials_categories!inner(
            name
          )
        `)
        .eq('status', 'at_shop')
        .eq('job_id', currentJobId)
        .order('name');

      if (materialsError) throw materialsError;

      const materialsWithJob = (materialsData || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        length: m.length,
        use_case: m.use_case,
        status: m.status,
        job_id: m.job_id,
        category_id: m.category_id,
        job_name: m.jobs.name,
        client_name: m.jobs.client_name,
        category_name: m.materials_categories.name,
      }));

      setMaterials(materialsWithJob);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  async function markAsAtJob(materialId: string, materialName: string) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          status: 'at_job', 
          actual_delivery_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (error) throw error;

      toast.success(`${materialName} marked as at job`);
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material status');
    }
  }



  const filteredMaterials = materials;

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full lg:max-w-4xl lg:mx-auto">

      {/* Materials List */}
      {filteredMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              No materials ready for this job
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Materials with "Ready for Job" status will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMaterials.map((material) => (
            <Card key={material.id} className="overflow-hidden">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  {/* Material Info - Compact Single Row */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm leading-tight truncate">{material.name}</h3>
                      {material.use_case && (
                        <span className="text-xs text-muted-foreground truncate">({material.use_case})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Qty: <span className="font-semibold text-foreground">{material.quantity}</span></span>
                      {material.length && (
                        <span>Len: <span className="font-medium text-foreground">{material.length}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Action Button - Compact */}
                  <Button
                    size="sm"
                    onClick={() => markAsAtJob(material.id, material.name)}
                    className="shrink-0 gradient-primary h-12"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
