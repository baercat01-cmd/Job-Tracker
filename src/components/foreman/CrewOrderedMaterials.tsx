import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, ShoppingCart, User } from 'lucide-react';
import type { Job } from '@/types';

interface MaterialItem {
  id: string;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  usage: string | null;
  status: string;
  requested_by: string | null;
  order_requested_at: string | null;
  date_needed_by: string | null;
  _requester_name?: string;
  _sheet_name?: string;
}

interface CrewOrderedMaterialsProps {
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

export function CrewOrderedMaterials({ job }: CrewOrderedMaterialsProps) {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCrewOrders();

    // Subscribe to material changes
    const itemsChannel = supabase
      .channel('crew_orders_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_items' },
        () => {
          loadCrewOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
    };
  }, [job.id]);

  async function loadCrewOrders() {
    try {
      setLoading(true);

      console.log('🔍 Loading crew-ordered materials for job:', job.id);

      // Get workbooks for this job
      const { data: workbooksData, error: workbooksError } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working');

      if (workbooksError) throw workbooksError;

      const workbookIds = (workbooksData || []).map(wb => wb.id);

      if (workbookIds.length === 0) {
        setMaterials([]);
        setLoading(false);
        return;
      }

      // Get sheets for these workbooks
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('id, sheet_name')
        .in('workbook_id', workbookIds);

      const sheetIds = (sheetsData || []).map(s => s.id);
      const sheetMap = new Map((sheetsData || []).map(s => [s.id, s.sheet_name]));

      if (sheetIds.length === 0) {
        setMaterials([]);
        setLoading(false);
        return;
      }

      // Get material items that were requested by crew (have requested_by field)
      const { data: materialsData, error: materialsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .not('requested_by', 'is', null)
        .order('order_requested_at', { ascending: false });

      if (materialsError) throw materialsError;

      // Get unique user IDs to fetch their names
      const userIds = [...new Set((materialsData || []).map(m => m.requested_by).filter(Boolean))];

      // Fetch user profiles
      const { data: usersData } = await supabase
        .from('user_profiles')
        .select('id, username')
        .in('id', userIds);

      const userMap = new Map((usersData || []).map(u => [u.id, u.username]));

      // Transform materials with user names and sheet names
      const transformedMaterials = (materialsData || []).map((item: any) => ({
        ...item,
        _requester_name: userMap.get(item.requested_by) || 'Unknown User',
        _sheet_name: sheetMap.get(item.sheet_id) || 'Unknown Sheet',
      }));

      setMaterials(transformedMaterials);

      // Start with all sections collapsed
      setExpandedSections(new Set());
    } catch (error: any) {
      console.error('❌ Error loading crew-ordered materials:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(section: string) {
    const newSet = new Set(expandedSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setExpandedSections(newSet);
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading crew orders...</p>
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            No materials ordered by crew yet
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Materials requested by crew members will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  const isExpanded = expandedSections.has('all');

  return (
    <div className="space-y-4">
      <Card className="border border-orange-200">
        <Collapsible open={isExpanded} onOpenChange={() => toggleSection('all')}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer bg-gradient-to-r from-orange-50 to-orange-100/50 hover:from-orange-100 hover:to-orange-200/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-orange-600" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-orange-600" />
                  )}
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-orange-600" />
                    Crew Ordered Materials
                  </CardTitle>
                </div>
                <Badge variant="outline" className="font-semibold bg-white text-xs">
                  {materials.length} {materials.length === 1 ? 'item' : 'items'}
                </Badge>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-2 sm:p-3">
              <div className="space-y-2">
                {materials.map((item) => (
                  <div 
                    key={item.id} 
                    className="bg-white border rounded-lg p-3 hover:bg-muted/30 transition-colors"
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

                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge
                            variant="outline"
                            className={getStatusConfig(item.status).bgClass}
                          >
                            {getStatusConfig(item.status).label}
                          </Badge>
                          {item._sheet_name && (
                            <Badge variant="outline" className="text-xs">
                              {item._sheet_name}
                            </Badge>
                          )}
                          {item.date_needed_by && (
                            <Badge variant="outline" className="text-xs">
                              Needed by: {new Date(item.date_needed_by).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span>Ordered by: <strong>{item._requester_name}</strong></span>
                          {item.order_requested_at && (
                            <span>on {new Date(item.order_requested_at).toLocaleDateString()}</span>
                          )}
                        </div>

                        {item.usage && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {item.usage}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
