import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Package, CheckCircle2, Truck } from 'lucide-react';
import { toast } from 'sonner';
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
  const [processingMaterials, setProcessingMaterials] = useState<Set<string>>(new Set());

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
            id,
            material_item_id,
            material_items (
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
      console.log('📦 Bundle data sample:', bundlesData?.[0]);
      
      // Transform Supabase response properly (handles both array and object responses)
      const transformedBundles = (bundlesData || []).map((bundle: any) => {
        console.log(`🔧 Processing bundle "${bundle.name}":`, {
          bundleId: bundle.id,
          bundleItemsType: typeof bundle.bundle_items,
          bundleItemsIsArray: Array.isArray(bundle.bundle_items),
          bundleItemsCount: bundle.bundle_items?.length || 0
        });
        
        // Transform bundle items and handle Supabase nested response
        const bundleItems = (bundle.bundle_items || []).map((item: any) => {
          const materialItem = item.material_items;
          
          if (!materialItem) {
            console.warn('⚠️ Bundle item missing material_items:', item);
            return null;
          }
          
          // Handle sheets which might be array or object
          const sheet = Array.isArray(materialItem.sheets) 
            ? materialItem.sheets[0] 
            : materialItem.sheets || { sheet_name: 'Unknown Sheet' };
          
          return {
            ...item,
            material_items: {
              ...materialItem,
              sheets: sheet,
              _sheet_name: sheet.sheet_name || sheetMap.get(materialItem.sheet_id) || 'Unknown Sheet',
            },
          };
        }).filter(Boolean);
        
        return {
          ...bundle,
          bundle_items: bundleItems,
        };
      });

      // Filter and transform bundles to only include materials with the target status
      const packagesWithStatusMaterials: MaterialBundle[] = transformedBundles
        .map((bundle: any) => {
          console.log(`🔍 Filtering bundle "${bundle.name}":`, {
            bundleItems: bundle.bundle_items?.length || 0
          });

          // Filter items to only those with the target status
          const statusItems = (bundle.bundle_items || [])
            .filter((item: any) => {
              const hasMaterial = item && item.material_items;
              const hasTargetStatus = hasMaterial && item.material_items.status === status;
              
              if (!hasMaterial) {
                console.log('⚠️ Bundle item missing material_items:', item);
              } else if (!hasTargetStatus) {
                console.log(`⏭️ Material "${item.material_items.material_name}" has status "${item.material_items.status}" (looking for "${status}")`);
              }
              
              return hasTargetStatus;
            })
            .map((item: any) => ({
              ...item.material_items,
              _sheet_name: item.material_items._sheet_name,
            }));

          console.log(`✅ Bundle "${bundle.name}" has ${statusItems.length} materials with status "${status}"`);

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

  async function updateMaterialStatus(materialId: string, newStatus: 'ready_for_job' | 'at_job') {
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

      toast.success(`Material marked as ${newStatus === 'ready_for_job' ? 'Ready for Job' : 'At Job'}`);

      loadMaterials();
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
                        <div className="flex items-start justify-between gap-2">
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

                          {/* Action Button */}
                          {status === 'pull_from_shop' && (
                            <Button
                              size="sm"
                              onClick={() => updateMaterialStatus(item.id, 'ready_for_job')}
                              disabled={processingMaterials.has(item.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 h-10 w-10 p-0 flex-shrink-0"
                              title="Mark as Ready for Job"
                            >
                              {processingMaterials.has(item.id) ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-5 h-5" />
                              )}
                            </Button>
                          )}
                          {status === 'ready_for_job' && (
                            <Button
                              size="sm"
                              onClick={() => updateMaterialStatus(item.id, 'at_job')}
                              disabled={processingMaterials.has(item.id)}
                              className="bg-teal-600 hover:bg-teal-700 h-10 w-10 p-0 flex-shrink-0"
                              title="Mark as At Job"
                            >
                              {processingMaterials.has(item.id) ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Truck className="w-5 h-5" />
                              )}
                            </Button>
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
