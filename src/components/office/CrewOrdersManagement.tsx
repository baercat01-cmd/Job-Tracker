import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wrench,
  Package,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cleanMaterialValue } from '@/lib/utils';

interface CrewOrder {
  id: string;
  name: string;
  quantity: number;
  length: string | null;
  notes: string | null;
  extra_notes: string | null;
  is_extra: boolean;
  unit_cost: number | null;
  total_cost: number | null;
  import_source: string;
  order_requested_at: string;
  ordered_by_name: string;
  job_id: string;
  job_name: string;
  category_name: string;
}

interface GroupedOrders {
  job_id: string;
  job_name: string;
  orders: CrewOrder[];
  total_cost: number;
  extra_count: number;
}

export function CrewOrdersManagement() {
  const [groupedOrders, setGroupedOrders] = useState<GroupedOrders[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  
  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState<CrewOrder | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [saving, setSaving] = useState(false);

  // Approve/Process dialog
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [processingOrders, setProcessingOrders] = useState<CrewOrder[]>([]);

  useEffect(() => {
    loadCrewOrders();

    // Subscribe to changes
    const channel = supabase
      .channel('crew_orders_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: 'status=eq.not_ordered' },
        () => loadCrewOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadCrewOrders() {
    try {
      setLoading(true);

      // Load all materials that are field requests and not yet ordered
      const { data, error } = await supabase
        .from('materials')
        .select(`
          *,
          jobs!inner(id, name),
          materials_categories!inner(name),
          ordered_by_user:ordered_by(username, email)
        `)
        .in('import_source', ['field_catalog', 'field_custom'])
        .eq('status', 'not_ordered')
        .order('order_requested_at', { ascending: false });

      if (error) throw error;

      // Group by job
      const jobMap = new Map<string, CrewOrder[]>();

      (data || []).forEach((material: any) => {
        const order: CrewOrder = {
          id: material.id,
          name: material.name,
          quantity: material.quantity,
          length: material.length,
          notes: material.notes,
          extra_notes: material.extra_notes,
          is_extra: material.is_extra || false,
          unit_cost: material.unit_cost,
          total_cost: material.total_cost,
          import_source: material.import_source,
          order_requested_at: material.order_requested_at,
          ordered_by_name: material.ordered_by_user?.username || material.ordered_by_user?.email || 'Unknown',
          job_id: material.jobs.id,
          job_name: material.jobs.name,
          category_name: material.materials_categories.name,
        };

        if (!jobMap.has(order.job_id)) {
          jobMap.set(order.job_id, []);
        }
        jobMap.get(order.job_id)!.push(order);
      });

      // Convert to grouped array with totals
      const grouped: GroupedOrders[] = Array.from(jobMap.entries()).map(([job_id, orders]) => ({
        job_id,
        job_name: orders[0].job_name,
        orders,
        total_cost: orders.reduce((sum, o) => sum + (o.total_cost || 0), 0),
        extra_count: orders.filter(o => o.is_extra).length,
      }));

      setGroupedOrders(grouped);
    } catch (error: any) {
      console.error('Error loading crew orders:', error);
      toast.error('Failed to load crew orders');
    } finally {
      setLoading(false);
    }
  }

  function toggleJob(jobId: string) {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  }

  function openEditDialog(order: CrewOrder) {
    setEditingOrder(order);
    setEditNotes(order.notes || '');
    setEditUnitCost(order.unit_cost?.toString() || '');
    setShowEditDialog(true);
  }

  async function saveEdit() {
    if (!editingOrder) return;

    setSaving(true);
    try {
      const unit_cost = editUnitCost ? parseFloat(editUnitCost) : null;
      const total_cost = unit_cost ? unit_cost * editingOrder.quantity : null;

      const { error } = await supabase
        .from('materials')
        .update({
          notes: editNotes.trim() || null,
          unit_cost,
          total_cost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingOrder.id);

      if (error) throw error;

      toast.success('Order updated');
      setShowEditDialog(false);
      loadCrewOrders();
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(orderId: string) {
    if (!confirm('Delete this crew order? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order deleted');
      loadCrewOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  }

  function openProcessDialog(orders: CrewOrder[]) {
    setProcessingOrders(orders);
    setShowProcessDialog(true);
  }

  async function approveOrders(targetStatus: 'ordered' | 'ready_to_pull') {
    if (processingOrders.length === 0) return;

    setSaving(true);
    try {
      // Update all selected orders to target status
      const orderIds = processingOrders.map(o => o.id);
      
      const { error } = await supabase
        .from('materials')
        .update({
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .in('id', orderIds);

      if (error) throw error;

      const statusLabel = targetStatus === 'ordered' ? 'Ordered' : 'Pull from Shop';
      toast.success(`${orderIds.length} order(s) approved as "${statusLabel}" and moved to main materials list`);
      setShowProcessDialog(false);
      loadCrewOrders();
    } catch (error: any) {
      console.error('Error approving orders:', error);
      toast.error('Failed to approve orders');
    } finally {
      setSaving(false);
    }
  }

  const totalOrders = groupedOrders.reduce((sum, g) => sum + g.orders.length, 0);
  const totalCost = groupedOrders.reduce((sum, g) => sum + g.total_cost, 0);
  const totalExtras = groupedOrders.reduce((sum, g) => sum + g.extra_count, 0);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading crew orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-6 h-6 text-orange-700" />
              <span className="text-xl">Crew Material Orders</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-700">{totalOrders}</div>
              <div className="text-sm text-orange-600 mt-1">Pending Orders</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-700">{groupedOrders.length}</div>
              <div className="text-sm text-orange-600 mt-1">Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-700">${totalCost.toFixed(2)}</div>
              <div className="text-sm text-orange-600 mt-1">Total Value</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-700">{totalExtras}</div>
              <div className="text-sm text-red-600 mt-1">Extra Charges</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders by Job */}
      {groupedOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground">No pending crew orders</p>
            <p className="text-sm text-muted-foreground mt-2">
              Field crews can order materials from their job view
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedOrders.map(group => {
            const isExpanded = expandedJobs.has(group.job_id);
            
            return (
              <Card key={group.job_id} className="border-2 border-orange-200">
                <CardHeader
                  className="bg-orange-50 cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => toggleJob(group.job_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-orange-700" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-orange-700" />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-orange-900">{group.job_name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-orange-700">
                            {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                          </span>
                          {group.extra_count > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {group.extra_count} EXTRA
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-orange-700">
                          ${group.total_cost.toFixed(2)}
                        </div>
                        <div className="text-xs text-orange-600">Total Value</div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            openProcessDialog(group.orders);
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve All ({group.orders.length})
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-left p-3">Material</th>
                          <th className="text-center p-3">Category</th>
                          <th className="text-center p-3">Qty</th>
                          <th className="text-center p-3">Cost</th>
                          <th className="text-center p-3">Type</th>
                          <th className="text-center p-3">Requested By</th>
                          <th className="text-center p-3">Date</th>
                          <th className="text-right p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map(order => (
                          <tr key={order.id} className={`border-b hover:bg-muted/30 ${order.is_extra ? 'bg-red-50' : ''}`}>
                            <td className="p-3">
                              <div>
                                <div className="font-medium">{cleanMaterialValue(order.name)}</div>
                                {order.length && (
                                  <div className="text-sm text-muted-foreground">
                                    {cleanMaterialValue(order.length)}
                                  </div>
                                )}
                                {order.extra_notes && (
                                  <div className="text-xs text-red-700 mt-1 font-semibold">
                                    ⚠️ {order.extra_notes}
                                  </div>
                                )}
                                {order.notes && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    📝 {order.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant="outline">{order.category_name}</Badge>
                            </td>
                            <td className="p-3 text-center font-semibold">{order.quantity}</td>
                            <td className="p-3 text-center">
                              {order.total_cost ? (
                                <span className="font-bold text-green-700">${order.total_cost.toFixed(2)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {order.is_extra ? (
                                <Badge variant="destructive" className="font-bold">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  EXTRA
                                </Badge>
                              ) : (
                                <Badge variant="secondary">For Job</Badge>
                              )}
                            </td>
                            <td className="p-3 text-center text-sm">{order.ordered_by_name}</td>
                            <td className="p-3 text-center text-xs text-muted-foreground">
                              {new Date(order.order_requested_at).toLocaleDateString()}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditDialog(order)}
                                  title="Edit pricing/notes"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteOrder(order.id)}
                                  className="text-destructive"
                                  title="Delete order"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => openProcessDialog([order])}
                                  className="bg-green-600 hover:bg-green-700 ml-2"
                                  title="Approve and order"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Order Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Edit Order Details
            </DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-semibold">{editingOrder.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Qty: {editingOrder.quantity} {editingOrder.length ? `× ${editingOrder.length}` : ''}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  value={editUnitCost}
                  onChange={(e) => setEditUnitCost(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
                {editUnitCost && (
                  <p className="text-xs text-muted-foreground">
                    Total: ${(parseFloat(editUnitCost) * editingOrder.quantity).toFixed(2)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this order..."
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button onClick={saveEdit} disabled={saving} className="flex-1">
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Process/Approve Orders Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Approve Orders
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Choose approval status:</h4>
              <p className="text-sm text-blue-800 mb-3">
                Select the status these materials should move to. They will leave the Crew Orders list and appear in the main Materials view.
              </p>
              <ul className="text-sm text-blue-800 space-y-1 list-disc ml-5">
                <li><strong>Ordered:</strong> Materials that need to be ordered from suppliers</li>
                <li><strong>Pull from Shop:</strong> Materials ready to be pulled from your shop inventory</li>
                <li>EXTRA materials will be tagged and appear in Extras Management</li>
              </ul>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 border-b font-semibold">
                Orders to Approve ({processingOrders.length})
              </div>
              <div className="max-h-96 overflow-y-auto">
                {processingOrders.map(order => (
                  <div key={order.id} className={`p-3 border-b hover:bg-muted/30 ${order.is_extra ? 'bg-red-50' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{order.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Qty: {order.quantity} {order.length ? `× ${order.length}` : ''} • {order.category_name}
                        </div>
                        {order.is_extra && order.extra_notes && (
                          <div className="text-xs text-red-700 mt-1 font-semibold">
                            ⚠️ EXTRA: {order.extra_notes}
                          </div>
                        )}
                      </div>
                      <div className="ml-3 text-right">
                        {order.total_cost ? (
                          <div className="font-bold text-green-700">${order.total_cost.toFixed(2)}</div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No price set</div>
                        )}
                        {order.is_extra && (
                          <Badge variant="destructive" className="text-xs mt-1">EXTRA</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={() => approveOrders('ordered')} 
                  disabled={saving} 
                  className="h-12 text-base bg-yellow-600 hover:bg-yellow-700"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Order ({processingOrders.length})
                    </>
                  )}
                </Button>
                <Button 
                  onClick={() => approveOrders('ready_to_pull')} 
                  disabled={saving} 
                  className="h-12 text-base bg-purple-600 hover:bg-purple-700"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Pull from Shop ({processingOrders.length})
                    </>
                  )}
                </Button>
              </div>
              <Button variant="outline" onClick={() => setShowProcessDialog(false)} className="w-full h-10">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
