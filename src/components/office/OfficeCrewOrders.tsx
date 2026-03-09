import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  User,
  Check,
  Package,
  Truck,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface CrewOrderItem {
  id: string;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  usage: string | null;
  notes: string | null;
  status: string;
  sku: string | null;
  category: string | null;
  requested_by: string | null;
  order_requested_at: string | null;
  _requester_name?: string;
}

interface OfficeCrewOrdersProps {
  jobId: string;
  onCountChange?: (count: number) => void;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', badge: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered',     label: 'Ordered',      badge: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'pull_from_shop', label: 'Pull from Shop', badge: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'ready_for_job',  label: 'Ready for Job',  badge: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'at_job',     label: 'At Job',       badge: 'bg-green-100 text-green-700 border-green-300' },
];

function statusBadge(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.badge ?? 'bg-gray-100 text-gray-700 border-gray-300';
}
function statusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;
}

export function OfficeCrewOrders({ jobId, onCountChange }: OfficeCrewOrdersProps) {
  const [items, setItems] = useState<CrewOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`office_crew_orders_${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_items' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [jobId]);

  async function load() {
    try {
      setLoading(true);

      // Get working workbooks for this job
      const { data: wbs } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working');
      const wbIds = (wbs || []).map(w => w.id);
      if (!wbIds.length) { setItems([]); return; }

      // Get sheets in those workbooks
      const { data: sheets } = await supabase
        .from('material_sheets')
        .select('id')
        .in('workbook_id', wbIds);
      const sheetIds = (sheets || []).map(s => s.id);
      if (!sheetIds.length) { setItems([]); return; }

      // Get material_items that have requested_by set (crew requests)
      const { data: rawItems, error } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .not('requested_by', 'is', null)
        .order('order_requested_at', { ascending: false });

      if (error) throw error;

      // Fetch requester names
      const userIds = [...new Set((rawItems || []).map((i: any) => i.requested_by).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username')
        .in('id', userIds);
      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.username]));

      const enriched: CrewOrderItem[] = (rawItems || []).map((i: any) => ({
        ...i,
        _requester_name: nameMap.get(i.requested_by) || 'Crew Member',
      }));

      setItems(enriched);
      onCountChange?.(enriched.filter(i => i.status === 'not_ordered').length);
    } catch (err: any) {
      console.error('Error loading crew orders:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(itemId: string, newStatus: string) {
    setUpdating(prev => new Set(prev).add(itemId));
    // Optimistic update
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: newStatus } : i));
    const { error } = await supabase
      .from('material_items')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) {
      toast.error('Failed to update status');
      await load(); // revert
    } else {
      toast.success(`Status updated to "${statusLabel(newStatus)}"`);
      onCountChange?.(items.filter(i =>
        (i.id !== itemId ? i.status : newStatus) === 'not_ordered'
      ).length);
      // Notify MaterialsManagement workbook to re-sync (picks up the status change in Workbook tab)
      window.dispatchEvent(new CustomEvent('materials-workbook-updated'));
    }
    setUpdating(prev => { const s = new Set(prev); s.delete(itemId); return s; });
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  // Group by status bucket
  const pending  = items.filter(i => i.status === 'not_ordered');
  const inProgress = items.filter(i => ['ordered','pull_from_shop','ready_for_job'].includes(i.status));
  const done     = items.filter(i => i.status === 'at_job');

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (items.length === 0) return (
    <Card>
      <CardContent className="py-16 text-center">
        <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-lg font-semibold text-muted-foreground">No crew material requests</p>
        <p className="text-sm text-muted-foreground mt-1">Crew requests submitted from the field will appear here.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingCart className="w-6 h-6 text-orange-500" />
        <h2 className="text-xl font-bold">Crew Material Requests</h2>
        {pending.length > 0 && (
          <Badge className="bg-red-100 text-red-700 border-red-300 animate-pulse">
            {pending.length} pending
          </Badge>
        )}
      </div>

      {/* PENDING */}
      {pending.length > 0 && (
        <Section
          title="Needs Ordering"
          icon={<Clock className="w-5 h-5 text-red-500" />}
          borderColor="border-red-200"
          headerBg="bg-gradient-to-r from-red-50 to-red-100/50"
          items={pending}
          expanded={expanded}
          updating={updating}
          onToggle={toggle}
          onStatusChange={updateStatus}
          defaultOpen
        />
      )}

      {/* IN PROGRESS */}
      {inProgress.length > 0 && (
        <Section
          title="In Progress"
          icon={<Truck className="w-5 h-5 text-yellow-600" />}
          borderColor="border-yellow-200"
          headerBg="bg-gradient-to-r from-yellow-50 to-yellow-100/50"
          items={inProgress}
          expanded={expanded}
          updating={updating}
          onToggle={toggle}
          onStatusChange={updateStatus}
          defaultOpen
        />
      )}

      {/* DONE */}
      {done.length > 0 && (
        <Section
          title="At Job Site"
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          borderColor="border-green-200"
          headerBg="bg-gradient-to-r from-green-50 to-green-100/50"
          items={done}
          expanded={expanded}
          updating={updating}
          onToggle={toggle}
          onStatusChange={updateStatus}
          defaultOpen={false}
        />
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  borderColor: string;
  headerBg: string;
  items: CrewOrderItem[];
  expanded: Set<string>;
  updating: Set<string>;
  onToggle: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  defaultOpen: boolean;
}

function Section({ title, icon, borderColor, headerBg, items, expanded, updating, onToggle, onStatusChange, defaultOpen }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={`border ${borderColor}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className={`cursor-pointer ${headerBg} transition-colors py-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                {icon}
                <CardTitle className="text-base">{title}</CardTitle>
                <Badge variant="outline" className="ml-1">{items.length}</Badge>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 space-y-3">
            {items.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                isExpanded={expanded.has(item.id)}
                isUpdating={updating.has(item.id)}
                onToggle={() => onToggle(item.id)}
                onStatusChange={(s) => onStatusChange(item.id, s)}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function ItemCard({ item, isExpanded, isUpdating, onToggle, onStatusChange }: {
  item: CrewOrderItem;
  isExpanded: boolean;
  isUpdating: boolean;
  onToggle: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="p-3 flex items-start gap-3">
        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{item.material_name}</span>
            {item.sku && <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div><span className="text-muted-foreground">Qty</span><p className="font-bold text-base">{item.quantity}</p></div>
            <div><span className="text-muted-foreground">Length</span><p className="font-medium">{item.length || '—'}</p></div>
            <div><span className="text-muted-foreground">Color</span><p className="font-medium">{item.color || '—'}</p></div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-xs ${statusBadge(item.status)}`}>
              {statusLabel(item.status)}
            </Badge>
            {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              {item._requester_name}
              {item.order_requested_at && ` · ${new Date(item.order_requested_at).toLocaleDateString()}`}
            </span>
          </div>
          {isExpanded && (item.notes || item.usage) && (
            <div className="mt-2 pt-2 border-t space-y-1">
              {item.usage && <p className="text-xs"><span className="font-medium text-muted-foreground">Usage: </span>{item.usage}</p>}
              {item.notes && <p className="text-xs"><span className="font-medium text-muted-foreground">Notes: </span>{item.notes}</p>}
            </div>
          )}
        </div>

        {/* Status selector */}
        <div className="flex-shrink-0 w-40">
          <Select
            value={item.status}
            onValueChange={onStatusChange}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  <span className="flex items-center gap-2">
                    {item.status === opt.value && <Check className="w-3 h-3" />}
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isUpdating && <p className="text-xs text-muted-foreground text-center mt-1">Saving…</p>}
        </div>
      </div>
    </div>
  );
}
