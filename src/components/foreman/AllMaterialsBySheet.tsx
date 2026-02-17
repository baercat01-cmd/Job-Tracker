import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, FileText, Package } from 'lucide-react';
import type { Job } from '@/types';

interface MaterialItem {
  id: string;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  usage: string | null;
  status: string;
  sku: string | null;
}

interface MaterialSheet {
  id: string;
  sheet_name: string;
  description: string | null;
  is_option: boolean;
  items: MaterialItem[];
}

interface AllMaterialsBySheetProps {
  job: Job;
}

const STATUS_CONFIG: Record<string, { label: string; bgClass: string }> = {
  not_ordered: { label: 'Not Ordered', bgClass: 'bg-gray-50 text-gray-700 border-gray-200' },
  pull_from_shop: { label: 'Pull from Shop', bgClass: 'bg-purple-50 text-purple-800 border-purple-200' },
  ready_for_job: { label: 'Ready for Job', bgClass: 'bg-blue-50 text-blue-800 border-blue-200' },
  at_job: { label: 'At Job', bgClass: 'bg-green-50 text-green-800 border-green-200' },
  installed: { label: 'Installed', bgClass: 'bg-slate-100 text-slate-800 border-slate-200' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.not_ordered;
}

export function AllMaterialsBySheet({ job }: AllMaterialsBySheetProps) {
  const [sheets, setSheets] = useState<MaterialSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMaterials();

    // Subscribe to material changes
    const itemsChannel = supabase
      .channel('all_materials_changes')
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
  }, [job.id]);

  async function loadMaterials() {
    try {
      setLoading(true);

      console.log('🔍 Loading all materials for job:', job.id);

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
        setSheets([]);
        setLoading(false);
        return;
      }

      // Get sheets with their materials
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select(`
          id,
          sheet_name,
          description,
          is_option,
          material_items (
            id,
            material_name,
            quantity,
            length,
            color,
            usage,
            status,
            sku
          )
        `)
        .in('workbook_id', workbookIds)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      console.log('📋 Loaded sheets:', sheetsData?.length || 0);

      // Transform data
      const transformedSheets = (sheetsData || []).map((sheet: any) => ({
        id: sheet.id,
        sheet_name: sheet.sheet_name,
        description: sheet.description,
        is_option: sheet.is_option,
        items: Array.isArray(sheet.material_items) ? sheet.material_items : [],
      }));

      setSheets(transformedSheets);

      // Start with all sheets collapsed
      setExpandedSheets(new Set());
    } catch (error: any) {
      console.error('❌ Error loading materials:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleSheet(sheetId: string) {
    const newSet = new Set(expandedSheets);
    if (newSet.has(sheetId)) {
      newSet.delete(sheetId);
    } else {
      newSet.add(sheetId);
    }
    setExpandedSheets(newSet);
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

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            No materials found for this job
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sheets.map(sheet => {
        const isExpanded = expandedSheets.has(sheet.id);

        return (
          <Card key={sheet.id} className="border border-slate-200">
            <Collapsible open={isExpanded} onOpenChange={() => toggleSheet(sheet.id)}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer bg-gradient-to-r from-slate-50 to-slate-100/50 hover:from-slate-100 hover:to-slate-200/50 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      )}
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-600" />
                          {sheet.sheet_name}
                          {sheet.is_option && (
                            <Badge variant="outline" className="text-xs">
                              Option
                            </Badge>
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
                    {sheet.items.map((item) => {
                      const isMaterialExpanded = expandedMaterials.has(item.id);

                      return (
                        <div 
                          key={item.id} 
                          className="bg-white border rounded-lg p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => toggleMaterial(item.id)}
                        >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm leading-tight mb-2">
                              {item.material_name}
                            </h4>
                            
                            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
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

                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={getStatusConfig(item.status).bgClass}
                              >
                                {getStatusConfig(item.status).label}
                              </Badge>
                              {item.sku && (
                                <Badge variant="outline" className="text-xs">
                                  SKU: {item.sku}
                                </Badge>
                              )}
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
