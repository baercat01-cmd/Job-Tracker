import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import type { Job } from '@/types';

interface MaterialItem {
  id: string;
  sheet_id: string;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  usage: string | null;
  status: string;
  _sheet_name?: string;
}

interface MaterialBundle {
  id: string;
  name: string;
  description: string | null;
  items: MaterialItem[];
}

interface JobMaterialsByStatusProps {
  job: Job;
  status: 'pull_from_shop' | 'ready_for_job';
}

export function JobMaterialsByStatus({ job, status }: JobMaterialsByStatusProps) {
  const [packages, setPackages] = useState<MaterialBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMaterials();

    // Subscribe to material changes
    const itemsChannel = supabase
      .channel('job_materials_status_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_items' },
        () => {
          loadMaterials();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
    };
  }, [job.id, status]);

  async function loadMaterials() {
    try {
      setLoading(true);

      console.log(`🔍 Loading ${status} materials for job:`, job.id);

      // Get workbooks for this job
      const { data: workbooksData, error: workbooksError } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working');

      if (workbooksError) throw workbooksError;

      const workbookIds = (workbooksData || []).map(wb => wb.id);

      if (workbookIds.length === 0) {
        console.log('❌ No workbooks found for job');
        setPackages([]);
        setLoading(false);
        return;
      }

      // Get sheets for these workbooks
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('id, sheet_name')
        .in('workbook_id', workbookIds);

      if (sheetsError) throw sheetsError;

      const sheetIds = (sheetsData || []).map(s => s.id);
      const sheetMap = new Map((sheetsData || []).map(s => [s.id, s.sheet_name]));

      if (sheetIds.length === 0) {
        console.log('❌ No sheets found for workbooks');
        setPackages([]);
        setLoading(false);
        return;
      }

      // Get material bundles for this job
      const { data: bundlesData, error: bundlesError } = await supabase
        .from('material_bundles')
        .select(`
          id,
          name,
          description,
          bundle_items:material_bundle_items (
            material_item_id,
            material_items!inner (
              id,
              sheet_id,
              material_name,
              quantity,
              length,
              color,
              usage,
              status
            )
          )
        `)
        .eq('job_id', job.id);

      if (bundlesError) throw bundlesError;

      console.log(`📦 Loaded ${bundlesData?.length || 0} bundles`);

      // Filter and transform bundles to only include materials with the target status
      const packagesWithStatusMaterials: MaterialBundle[] = (bundlesData || [])
        .map((bundle: any) => {
          // Filter items to only those with the target status
          const statusItems = (bundle.bundle_items || [])
            .filter((item: any) => 
              item.material_items && 
              item.material_items.status === status
            )
            .map((item: any) => ({
              ...item.material_items,
              _sheet_name: sheetMap.get(item.material_items.sheet_id) || 'Unknown Sheet',
            }));

          if (statusItems.length === 0) return null;

          return {
            id: bundle.id,
            name: bundle.name,
            description: bundle.description,
            items: statusItems,
          };
        })
        .filter(Boolean) as MaterialBundle[];

      console.log(`✅ Found ${packagesWithStatusMaterials.length} packages with ${status} materials`);

      setPackages(packagesWithStatusMaterials);

      // Auto-expand all packages
      setExpandedPackages(new Set(packagesWithStatusMaterials.map(p => p.id)));
    } catch (error: any) {
      console.error('❌ Error loading materials:', error);
    } finally {
      setLoading(false);
    }
  }

  function togglePackage(packageId: string) {
    const newSet = new Set(expandedPackages);
    if (newSet.has(packageId)) {
      newSet.delete(packageId);
    } else {
      newSet.add(packageId);
    }
    setExpandedPackages(newSet);
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            No materials with "{status === 'pull_from_shop' ? 'Pull from Shop' : 'Ready for Job'}" status
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {packages.map(pkg => {
        const isExpanded = expandedPackages.has(pkg.id);

        return (
          <Card key={pkg.id} className="border border-purple-200">
            <Collapsible open={isExpanded} onOpenChange={() => togglePackage(pkg.id)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-gradient-to-r from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
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
                      {pkg.items.length} {pkg.items.length === 1 ? 'item' : 'items'}
                    </Badge>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-2 sm:p-3">
                  <div className="space-y-2">
                    {pkg.items.map((item) => (
                      <div 
                        key={item.id} 
                        className="bg-white border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm leading-tight mb-2">
                            {item.material_name}
                          </h4>
                          
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Qty:</span>
                              <p className="font-semibold text-base">{item.quantity}</p>
                            </div>
                            
                            <div>
                              <span className="text-muted-foreground">Color:</span>
                              <p className="font-medium">
                                {item.color || '-'}
                              </p>
                            </div>
                            
                            <div>
                              <span className="text-muted-foreground">Length:</span>
                              <p className="font-medium">
                                {item.length || '-'}
                              </p>
                            </div>
                          </div>

                          {item.usage && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {item.usage}
                            </p>
                          )}
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
    </div>
  );
}
