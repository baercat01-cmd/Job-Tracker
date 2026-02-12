import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  ShoppingCart,
  Truck,
  Package,
  Calendar,
  DollarSign,
  Plus,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
}

interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
}

interface OrderItem {
  id: string;
  order_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes: string | null;
  material?: Material;
}

interface Order {
  id: string;
  vendor_id: string;
  order_number: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: string;
  total_cost: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  vendor?: Vendor;
  order_items?: OrderItem[];
}

interface LumberOrderTrackingProps {
  category: 'lumber' | 'rebar';
}

export function LumberOrderTracking({ category }: LumberOrderTrackingProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Dialogs
  const [showCreateOrderDialog, setShowCreateOrderDialog] = useState(false);
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Form states
  const [orderVendorId, setOrderVendorId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderItems, setOrderItems] = useState<Record<string, { quantity: string; unitPrice: string; notes: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
    
    // Subscribe to changes
    const ordersChannel = supabase
      .channel('lumber_rebar_orders_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_orders' },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([
        loadMaterials(),
        loadVendors(),
        loadOrders(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load order data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials() {
    const { data, error } = await supabase
      .from('lumber_rebar_materials')
      .select('*')
      .eq('active', true)
      .eq('category', category)
      .order('order_index');

    if (error) throw error;
    setMaterials(data || []);
  }

  async function loadVendors() {
    const { data, error } = await supabase
      .from('lumber_rebar_vendors')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    setVendors(data || []);
  }

  async function loadOrders() {
    // Get all orders and filter by category through material items
    const { data, error } = await supabase
      .from('lumber_rebar_orders')
      .select(`
        *,
        vendor:lumber_rebar_vendors(*),
        order_items:lumber_rebar_order_items(
          *,
          material:lumber_rebar_materials(*)
        )
      `)
      .order('order_date', { ascending: false });

    if (error) throw error;
    
    // Filter orders that have materials matching the current category
    const filteredOrders = (data || []).filter(order => 
      order.order_items?.some((item: OrderItem) => item.material?.category === category)
    );
    
    setOrders(filteredOrders);
  }

  function openCreateOrderDialog() {
    setOrderVendorId('');
    setOrderNumber('');
    setOrderDate(new Date().toISOString().split('T')[0]);
    setExpectedDeliveryDate('');
    setOrderNotes('');
    setOrderItems({});
    setShowCreateOrderDialog(true);
  }

  function updateOrderItem(materialId: string, field: 'quantity' | 'unitPrice' | 'notes', value: string) {
    setOrderItems(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [field]: value,
      }
    }));
  }

  async function saveOrder() {
    if (!orderVendorId) {
      toast.error('Please select a vendor');
      return;
    }

    const itemsToSave = Object.entries(orderItems)
      .filter(([_, item]) => item.quantity && parseFloat(item.quantity) > 0)
      .map(([materialId, item]) => ({
        materialId,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice) || 0,
        notes: item.notes || null,
      }));

    if (itemsToSave.length === 0) {
      toast.error('Please add at least one material to the order');
      return;
    }

    setSaving(true);

    try {
      // Calculate total
      const totalCost = itemsToSave.reduce(
        (sum, item) => sum + (item.quantity * item.unitPrice),
        0
      );

      // Create order
      const { data: newOrder, error: orderError } = await supabase
        .from('lumber_rebar_orders')
        .insert({
          vendor_id: orderVendorId,
          order_number: orderNumber || null,
          order_date: orderDate,
          expected_delivery_date: expectedDeliveryDate || null,
          status: 'ordered',
          total_cost: totalCost,
          notes: orderNotes || null,
          created_by: profile?.id || null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsData = itemsToSave.map(item => ({
        order_id: newOrder.id,
        material_id: item.materialId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.quantity * item.unitPrice,
        notes: item.notes,
      }));

      const { error: itemsError } = await supabase
        .from('lumber_rebar_order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      toast.success(`Order created with ${itemsToSave.length} items`);
      setShowCreateOrderDialog(false);
      await loadOrders();
    } catch (error: any) {
      console.error('Error saving order:', error);
      toast.error('Failed to create order');
    } finally {
      setSaving(false);
    }
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    try {
      const updateData: any = {
        status: newStatus,
      };

      if (newStatus === 'delivered') {
        updateData.actual_delivery_date = new Date().toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from('lumber_rebar_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order status updated');
      await loadOrders();
    } catch (error: any) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  }

  function openOrderDetails(order: Order) {
    setSelectedOrder(order);
    setShowOrderDetailsDialog(true);
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'ordered':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'in_transit':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'ordered':
        return <ShoppingCart className="w-4 h-4" />;
      case 'in_transit':
        return <Truck className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-green-600" />
            {category === 'lumber' ? 'Lumber' : 'Rebar'} Orders
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track orders placed with vendors
          </p>
        </div>
        <Button onClick={openCreateOrderDialog} className="bg-green-600 hover:bg-green-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Order
        </Button>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first order to start tracking lumber purchases
            </p>
            <Button onClick={openCreateOrderDialog} className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map(order => (
            <Card
              key={order.id}
              className="cursor-pointer hover:shadow-lg transition-all"
              onClick={() => openOrderDetails(order)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      {order.order_number || `Order #${order.id.slice(0, 8)}`}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.vendor?.name}
                    </p>
                  </div>
                  <Badge className={`${getStatusColor(order.status)} flex items-center gap-1`}>
                    {getStatusIcon(order.status)}
                    {order.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Ordered: {new Date(order.order_date).toLocaleDateString()}</span>
                  </div>
                  {order.expected_delivery_date && (
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-muted-foreground" />
                      <span>Expected: {new Date(order.expected_delivery_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span>{order.order_items?.length || 0} items</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="font-bold">${order.total_cost?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <Select
                    value={order.status}
                    onValueChange={(value) => {
                      updateOrderStatus(order.id, value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectTrigger className={`h-8 text-xs ${getStatusColor(order.status)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="in_transit">In Transit</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Order Dialog */}
      <Dialog open={showCreateOrderDialog} onOpenChange={setShowCreateOrderDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Create New Order
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Order Details */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border">
              <div className="space-y-2">
                <Label>Vendor *</Label>
                <Select value={orderVendorId} onValueChange={setOrderVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(vendor => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Order Number</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="Optional PO number..."
                />
              </div>

              <div className="space-y-2">
                <Label>Order Date *</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Expected Delivery</Label>
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Additional notes about this order..."
                  rows={2}
                />
              </div>
            </div>

            {/* Materials Table */}
            <div className="flex-1 overflow-y-auto border rounded-lg">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-100 z-10">
                  <tr className="border-b-2">
                    <th className="text-left p-3 font-semibold">Material</th>
                    <th className="text-left p-3 font-semibold w-32">Quantity</th>
                    <th className="text-left p-3 font-semibold w-32">Unit Price ($)</th>
                    <th className="text-right p-3 font-semibold w-32">Total ($)</th>
                    <th className="text-left p-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materials.map(material => {
                    const item = orderItems[material.id] || { quantity: '', unitPrice: '', notes: '' };
                    const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);

                    return (
                      <tr key={material.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium">{material.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {material.standard_length}' • {material.unit}
                          </div>
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateOrderItem(material.id, 'quantity', e.target.value)}
                            placeholder="0"
                            className="w-full"
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateOrderItem(material.id, 'unitPrice', e.target.value)}
                            placeholder="0.00"
                            className="w-full"
                          />
                        </td>
                        <td className="p-3 text-right font-semibold">
                          ${total.toFixed(2)}
                        </td>
                        <td className="p-3">
                          <Input
                            value={item.notes}
                            onChange={(e) => updateOrderItem(material.id, 'notes', e.target.value)}
                            placeholder="Optional..."
                            className="w-full"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Order Total:</span>
                <span className="text-green-700">
                  ${Object.values(orderItems).reduce((sum, item) => 
                    sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 
                    0
                  ).toFixed(2)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {Object.values(orderItems).filter(item => parseFloat(item.quantity) > 0).length} items selected
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={saveOrder}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Create Order
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateOrderDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      {selectedOrder && (
        <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {selectedOrder.order_number || `Order #${selectedOrder.id.slice(0, 8)}`}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border">
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-semibold">{selectedOrder.vendor?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={`${getStatusColor(selectedOrder.status)} flex items-center gap-1 w-fit`}>
                    {getStatusIcon(selectedOrder.status)}
                    {selectedOrder.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Date</p>
                  <p className="font-semibold">{new Date(selectedOrder.order_date).toLocaleDateString()}</p>
                </div>
                {selectedOrder.expected_delivery_date && (
                  <div>
                    <p className="text-sm text-muted-foreground">Expected Delivery</p>
                    <p className="font-semibold">{new Date(selectedOrder.expected_delivery_date).toLocaleDateString()}</p>
                  </div>
                )}
                {selectedOrder.actual_delivery_date && (
                  <div>
                    <p className="text-sm text-muted-foreground">Actual Delivery</p>
                    <p className="font-semibold">{new Date(selectedOrder.actual_delivery_date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-3">Order Items</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold">Material</th>
                        <th className="text-right p-3 text-sm font-semibold">Qty</th>
                        <th className="text-right p-3 text-sm font-semibold">Unit Price</th>
                        <th className="text-right p-3 text-sm font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedOrder.order_items?.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-medium">{item.material?.name}</div>
                            {item.notes && (
                              <div className="text-xs text-muted-foreground mt-1">{item.notes}</div>
                            )}
                          </td>
                          <td className="p-3 text-right">{item.quantity}</td>
                          <td className="p-3 text-right font-mono">${item.unit_price.toFixed(2)}</td>
                          <td className="p-3 text-right font-mono font-semibold">${item.total_price.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-green-50 font-bold">
                        <td colSpan={3} className="p-3 text-right">Total:</td>
                        <td className="p-3 text-right text-green-700">${selectedOrder.total_cost?.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <h3 className="font-semibold mb-2">Notes</h3>
                  <p className="text-sm text-muted-foreground bg-slate-50 p-3 rounded border">
                    {selectedOrder.notes}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
