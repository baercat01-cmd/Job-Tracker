
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger, // This was the missing comma
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Package, CheckCircle2, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

/** DB-approved value for "at job site". Must match material_items_status_check constraint. */
const MATERIAL_STATUS_AT_JOB = 'at_job';

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
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());

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
          // NOTE: The original code had a potential issue here if 'sheets' wasn't directly on materialItem or if sheetMap wasn't used correctly for sheet_name.
          // Correcting to ensure sheet_name is retrieved from sheetMap if available, or a fallback.
          const sheetName = sheetMap.get(materialItem.sheet_id) || 'Unknown Sheet';
          
          return {
            ...materialItem, // Spreading materialItem directly to match MaterialItem interface
            _sheet_name: sheetName,
          };
        }).filter(Boolean); // Filter out any nulls if material_items was missing
        
        return {
          id: bundle.id,
          name: bundle.name,
          description: bundle.description,
          items: bundleItems, // Use the filtered and transformed items
        };
      });

      // Filter and transform bundles to only include materials with the target status
      const packagesWithStatusMaterials: MaterialBundle[] = transformedBundles
        .map((bundle: MaterialBundle) => { // Type bundle as MaterialBundle for better type safety
          console.log(`🔍 Filtering bundle "${bundle.name}":`, {
            bundleItems: bundle.items?.length || 0
          });

          // Filter items to only those with the target status
          const statusItems = (bundle.items || [])
            .filter((item: MaterialItem) => { // Type item as MaterialItem
              const hasTargetStatus = item.status === status;
              
              if (!hasTargetStatus) {
                console.log(`⏭️ Material "${item.material_name}" has status "${item.status}" (looking for "${status}")`);
              }
              
              return hasTargetStatus;
            });

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

      // Start with all packages collapsed
      setExpandedPackages(new Set());
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

  function toggleMaterial(materialId: string) {
    const newSet = new Set(expandedMaterials);
    if (newSet.has(materialId)) {
      newSet.delete(materialId);
    } else {
      newSet.add(materialId);
    }
    setExpandedMaterials(newSet);
  }

  async function updateMaterialStatus(materialId: string, newStatus: 'ready_for_job' | 'at_job') {
    if (processingMaterials.has(materialId)) return;
    setProcessingMaterials(prev => new Set(prev).add(materialId));

    try {
      const statusValue = newStatus === 'at_job' ? MATERIAL_STATUS_AT_JOB : newStatus;
      const { error: materialError } = await supabase
        .from('material_items')
        .update({
          status: statusValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', materialId)
        .select();

      if (materialError) {
        console.error('CREW material_items update error:', materialError);
        throw materialError;
      }

      toast.success(`Material marked as ${newStatus === 'ready_for_job' ? 'Ready for Job' : 'At Job'}`);

      setPackages((prev) => {
        return prev
          .map((pkg) => ({
            ...pkg,
            items: pkg.items.filter((item) => item.id !== materialId),
          }))
          .filter((pkg) => pkg.items.length > 0);
      });
    } catch (error: any) {
      console.error('CREW Error updating material:', error);
      toast.error(`Failed to update material: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessingMaterials((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
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
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-2 sm:p-3">
                  <div className="space-y-2">
                    {pkg.items.map((item) => {
                      const isMaterialExpanded = expandedMaterials.has(item.id);

                      return (
                        <div 
                          key={item.id} 
                          className="bg-white border rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              {/* Left side - clickable area for expand/collapse */}
                              <div 
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => toggleMaterial(item.id)}
                              >
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

                                {isMaterialExpanded && item.usage && (
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="text-xs text-muted-foreground font-medium">Usage:</p>
                                    <p className="text-xs text-foreground mt-1">
                                      {item.usage}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Right side - Action Button (NOT clickable for expand) */}
                              <div className="flex-shrink-0">
                                {status === 'pull_from_shop' && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      console.log('🖱️ CREW Pull from Shop button clicked');
                                      e.preventDefault();
                                      e.stopPropagation();
                                      updateMaterialStatus(item.id, 'ready_for_job');
                                    }}
                                    disabled={processingMaterials.has(item.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 h-10 w-10 p-0"
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
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      updateMaterialStatus(item.id, 'at_job');
                                    }}
                                    disabled={processingMaterials.has(item.id)}
                                    className="bg-teal-600 hover:bg-teal-700 h-10 w-10 p-0"
                                    title="Mark as At Job"
                                  >
                                    {processingMaterials.has(item.id) ? (
                                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Check className="w-5 h-5" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
