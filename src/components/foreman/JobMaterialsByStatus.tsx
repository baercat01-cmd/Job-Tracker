
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger, // This was the missing comma
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Package, CheckCircle2, Check, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { TrimDrawingPreview, getCutLengthFromTrimConfig, formatLengthInches, type LineSegment } from '@/components/office/TrimDrawingPreview';
import { TrimDrawingFullScreenView } from '@/components/office/TrimDrawingFullScreenView';

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function normalizeDrawingSegments(raw: unknown): LineSegment[] {
  if (!raw) return [];
  try {
    let arr: unknown[] = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown);
    if (arr && typeof arr === 'object' && !Array.isArray(arr) && 'segments' in arr) arr = (arr as { segments: unknown[] }).segments;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map((seg: any, index: number) => ({
      id: seg.id ?? `seg-${index}`,
      start: seg.start ? { x: toNum(seg.start.x), y: toNum(seg.start.y) } : { x: 0, y: 0 },
      end: seg.end ? { x: toNum(seg.end.x), y: toNum(seg.end.y) } : { x: 0, y: 0 },
      label: seg.label ?? String.fromCharCode(65 + index),
      hasHem: seg.hasHem === true,
      hemAtStart: seg.hemAtStart === true,
      hemSide: seg.hemSide === 'left' || seg.hemSide === 'right' ? seg.hemSide : 'right',
    }));
  } catch {
    return [];
  }
}

const TRIM_PREVIEW_SIZE = { width: 88, height: 48 };

/** DB-approved value for "at job site". Must match material_items_status_check constraint. */
const MATERIAL_STATUS_AT_JOB = 'at_job';

interface TrimConfig {
  id: string;
  name: string;
  drawing_segments: unknown;
}

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
  trim_saved_config_id?: string | null;
  trim_saved_configs?: TrimConfig | null;
  quantity_ready_for_job?: number;
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
  const [viewingTrimConfig, setViewingTrimConfig] = useState<{ name: string; drawing_segments: unknown } | null>(null);
  const [partialQtyInput, setPartialQtyInput] = useState<Record<string, string>>({});

  useEffect(() => {
    loadMaterials();
    // No realtime subscription here — checkmark uses optimistic UI to avoid refetch/scroll jump
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
              status,
              trim_saved_config_id,
              quantity_ready_for_job
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

      // Unbundled materials for this job with same status — group by sheet (same flow as packages)
      const bundleIdsForJob = (bundlesData || []).map((b: any) => b.id);
      let bundledItemIds = new Set<string>();
      if (bundleIdsForJob.length > 0) {
        const { data: bundleItemRows } = await supabase
          .from('material_bundle_items')
          .select('material_item_id')
          .in('bundle_id', bundleIdsForJob);
        bundledItemIds = new Set((bundleItemRows || []).map((r: any) => r.material_item_id));
      }

      const { data: unbundledRows } = await supabase
        .from('material_items')
        .select('id, sheet_id, material_name, quantity, length, color, usage, status, trim_saved_config_id, quantity_ready_for_job')
        .in('sheet_id', sheetIds)
        .eq('status', status);

      const unbundled = (unbundledRows || []).filter((r: any) => !bundledItemIds.has(r.id));
      const bySheet = new Map<string, MaterialItem[]>();
      for (const item of unbundled) {
        const sheetName = sheetMap.get(item.sheet_id) || 'Unknown Sheet';
        const key = item.sheet_id;
        if (!bySheet.has(key)) bySheet.set(key, []);
        bySheet.get(key)!.push({ ...item, _sheet_name: sheetName });
      }

      const sheetGroups: MaterialBundle[] = [];
      for (const [sheetId, items] of bySheet) {
        const sheetName = sheetMap.get(sheetId) || 'Unknown Sheet';
        sheetGroups.push({
          id: `unbundled-${sheetId}`,
          name: sheetName,
          description: null,
          items,
        });
      }

      // Fetch trim configs for all items that have trim_saved_config_id (crew gets same trim drawings as shop)
      const allItems = [...packagesWithStatusMaterials.flatMap((p) => p.items), ...sheetGroups.flatMap((p) => p.items)];
      const trimIds = [...new Set(allItems.map((i: MaterialItem) => i.trim_saved_config_id).filter(Boolean))] as string[];
      const trimConfigMap = new Map<string, TrimConfig>();
      if (trimIds.length > 0) {
        const { data: trimConfigs } = await supabase
          .from('trim_saved_configs')
          .select('id, name, drawing_segments')
          .in('id', trimIds);
        (trimConfigs || []).forEach((c: TrimConfig) => trimConfigMap.set(c.id, c));
      }
      const enrichWithTrim = (items: MaterialItem[]): MaterialItem[] =>
        items.map((i) => ({
          ...i,
          trim_saved_configs: i.trim_saved_config_id ? trimConfigMap.get(i.trim_saved_config_id) ?? null : null,
        }));
      const packagesEnriched = packagesWithStatusMaterials.map((p) => ({ ...p, items: enrichWithTrim(p.items) }));
      const sheetGroupsEnriched = sheetGroups.map((p) => ({ ...p, items: enrichWithTrim(p.items) }));

      console.log(`✅ Found ${packagesEnriched.length} packages and ${sheetGroupsEnriched.length} sheet groups with ${status} materials`);

      setPackages([...packagesEnriched, ...sheetGroupsEnriched]);

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

  function updateMaterialStatus(materialId: string, newStatus: 'ready_for_job' | 'at_job') {
    if (processingMaterials.has(materialId)) return;

    // Capture item and package for possible revert (package may be removed if it was the last item)
    let removedItem: MaterialItem | null = null;
    let removedPackage: MaterialBundle | null = null;
    setPackages((prev) => {
      for (const pkg of prev) {
        const item = pkg.items.find((i) => i.id === materialId);
        if (item) {
          removedItem = item;
          removedPackage = { ...pkg, items: pkg.items };
          break;
        }
      }
      return prev
        .map((pkg) => ({
          ...pkg,
          items: pkg.items.filter((item) => item.id !== materialId),
        }))
        .filter((pkg) => pkg.items.length > 0);
    });

    setProcessingMaterials((prev) => new Set(prev).add(materialId));
    const statusValue = newStatus === 'at_job' ? MATERIAL_STATUS_AT_JOB : newStatus;

    async function persistInBackground() {
      try {
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
      } catch (error: any) {
        console.error('CREW Error updating material:', error);
        const msg = error?.message || 'Unknown error';
        const isConstraintError = /material_items_status_check/i.test(msg);
        if (isConstraintError) {
          toast.error(
            `Database rejected "At Job" status. Make sure the fix script was run in the same Supabase project as your app (check .env VITE_SUPABASE_URL). Error: ${msg}`,
            { duration: 10000 }
          );
        } else {
          toast.error(`Failed to update material: ${msg}`);
        }
        if (removedItem && removedPackage) {
          setPackages((prev) => {
            const stillHasPackage = prev.some((p) => p.id === removedPackage!.id);
            if (stillHasPackage) {
              return prev.map((pkg) =>
                pkg.id === removedPackage!.id
                  ? { ...pkg, items: [...pkg.items, removedItem!] }
                  : pkg
              );
            }
            return [...prev, removedPackage!];
          });
        }
      } finally {
        setProcessingMaterials((prev) => {
          const next = new Set(prev);
          next.delete(materialId);
          return next;
        });
      }
    }
    void persistInBackground();
  }

  async function markPartialReady(itemId: string, qtyToMark: number, currentReady: number, totalQty: number) {
    if (processingMaterials.has(itemId) || qtyToMark <= 0 || currentReady >= totalQty) return;
    const capped = Math.min(qtyToMark, totalQty - currentReady);
    setProcessingMaterials((prev) => new Set(prev).add(itemId));
    setPartialQtyInput((prev) => ({ ...prev, [itemId]: '' }));
    try {
      const { error } = await supabase.rpc('mark_material_partial_ready', {
        p_material_item_id: itemId,
        p_quantity_to_mark: capped,
      });
      if (error) {
        if (/schema cache|could not find the function/i.test(error.message)) {
          const newReady = currentReady + capped;
          const { error: updateErr } = await supabase
            .from('material_items')
            .update({
              quantity_ready_for_job: newReady,
              ...(newReady >= totalQty ? { status: 'ready_for_job' } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', itemId);
          if (updateErr) throw updateErr;
        } else {
          throw error;
        }
      }
      toast.success(`Marked ${capped} as ready for job${capped >= totalQty - currentReady ? ' (all remaining)' : ''}.`);
      loadMaterials();
    } catch (e: any) {
      const msg = e?.message || '';
      if (/quantity_ready_for_job|schema cache|could not find the function/i.test(msg)) {
        toast.error(
          'Partial "Mark ready" requires a database update. In Supabase SQL Editor run: supabase/migrations/RUN_THIS_FOR_PARTIAL_READY.sql',
          { duration: 8000 }
        );
      } else {
        toast.error(msg || 'Failed to mark partial ready');
      }
    } finally {
      setProcessingMaterials((prev) => {
        const n = new Set(prev);
        n.delete(itemId);
        return n;
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

  const isPullTab = status === 'pull_from_shop';
  const isSheetGroup = (pkg: MaterialBundle) => pkg.id.startsWith('unbundled-');

  return (
    <div className="space-y-4">
      {packages.map(pkg => {
        const isExpanded = expandedPackages.has(pkg.id);

        return (
          <Card
            key={pkg.id}
            className={isPullTab ? 'border border-purple-200' : 'border border-blue-200'}
          >
            <Collapsible open={isExpanded} onOpenChange={() => togglePackage(pkg.id)}>
              <CollapsibleTrigger asChild>
                <CardHeader
                  className={
                    isPullTab
                      ? 'cursor-pointer bg-gradient-to-r from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 transition-colors py-3'
                      : 'cursor-pointer bg-gradient-to-r from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 transition-colors py-3'
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown
                          className={isPullTab ? 'w-5 h-5 text-purple-600' : 'w-5 h-5 text-blue-600'}
                        />
                      ) : (
                        <ChevronRight
                          className={isPullTab ? 'w-5 h-5 text-purple-600' : 'w-5 h-5 text-blue-600'}
                        />
                      )}
                      <div>
                        <CardTitle
                          className={
                            isPullTab
                              ? 'text-base flex items-center gap-2 text-purple-600'
                              : 'text-base flex items-center gap-2 text-blue-600'
                          }
                        >
                          {isSheetGroup(pkg) ? (
                            <>
                              <FileSpreadsheet className={isPullTab ? 'w-4 h-4 text-purple-600' : 'w-4 h-4 text-blue-600'} />
                              Sheet: {pkg.name}
                            </>
                          ) : (
                            <>
                              <Package className={isPullTab ? 'w-4 h-4 text-purple-600' : 'w-4 h-4 text-blue-600'} />
                              {pkg.name}
                            </>
                          )}
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

                                {/* Pull-from-shop: show to-pull / ready counts when quantity > 1 (same as shop) */}
                                {status === 'pull_from_shop' && item.quantity > 1 && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {Math.max(0, item.quantity - (item.quantity_ready_for_job ?? 0))} to pull
                                    <span className="font-normal"> (of {item.quantity} total)</span>
                                    {(item.quantity_ready_for_job ?? 0) > 0 && (
                                      <span className="font-normal"> — {item.quantity_ready_for_job} ready</span>
                                    )}
                                  </p>
                                )}

                                {/* Trim drawing and cut length (same as shop user) */}
                                {item.trim_saved_configs?.drawing_segments && (
                                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewingTrimConfig({
                                          name: item.trim_saved_configs!.name || item.material_name,
                                          drawing_segments: item.trim_saved_configs.drawing_segments,
                                        });
                                      }}
                                      className="rounded border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden shrink-0"
                                      title="View trim drawing"
                                    >
                                      <TrimDrawingPreview
                                        segments={normalizeDrawingSegments(item.trim_saved_configs.drawing_segments)}
                                        width={TRIM_PREVIEW_SIZE.width}
                                        height={TRIM_PREVIEW_SIZE.height}
                                      />
                                    </button>
                                    <span className="text-xs text-muted-foreground">
                                      Cut length: {formatLengthInches(getCutLengthFromTrimConfig(item.trim_saved_configs))}
                                    </span>
                                  </div>
                                )}

                                {isMaterialExpanded && item.usage && (
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="text-xs text-muted-foreground font-medium">Usage:</p>
                                    <p className="text-xs text-foreground mt-1">
                                      {item.usage}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Right side - Action (partial check-off like shop, or full checkmark) */}
                              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                {status === 'pull_from_shop' && (
                                  item.quantity > 1 ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, item.quantity - (item.quantity_ready_for_job ?? 0))}
                                        className="w-14 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={partialQtyInput[item.id] ?? String(Math.max(0, item.quantity - (item.quantity_ready_for_job ?? 0)))}
                                        onChange={(e) => setPartialQtyInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                        onFocus={(e) => e.currentTarget.select()}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <Button
                                        size="sm"
                                        disabled={processingMaterials.has(item.id)}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const ready = item.quantity_ready_for_job ?? 0;
                                          const total = item.quantity;
                                          const remaining = total - ready;
                                          const raw = partialQtyInput[item.id] ?? String(remaining);
                                          const v = Math.min(Math.max(parseInt(raw, 10) || 0, 1), remaining);
                                          if (v > 0 && ready < total) markPartialReady(item.id, v, ready, total);
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 h-9"
                                        title="Mark this many as ready for job"
                                      >
                                        {processingMaterials.has(item.id) ? (
                                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          'Mark ready'
                                        )}
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={(e) => {
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
                                  )
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

      {viewingTrimConfig && (
        <TrimDrawingFullScreenView
          title={viewingTrimConfig.name}
          segments={normalizeDrawingSegments(viewingTrimConfig.drawing_segments)}
          onClose={() => setViewingTrimConfig(null)}
        />
      )}
    </div>
  );
}
