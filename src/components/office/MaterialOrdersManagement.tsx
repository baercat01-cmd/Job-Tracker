import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { 
  Plus, 
  Truck, 
  User, 
  Calendar, 
  FileText, 
  Upload, 
  X, 
  Edit,
  Trash2,
  Eye,
  Store,
  Package
} from 'lucide-react';
import { createNotification } from '@/lib/notifications';

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface MaterialOrder {
  id: string;
  job_id: string;
  vendor_id: string | null;
  order_number: string | null;
  order_type: 'delivery' | 'pickup';
  order_date: string;
  scheduled_date: string;
  pickup_user_id: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes: string | null;
  total_cost: number | null;
  created_by: string | null;
  created_at: string;
  vendor?: Vendor;
  pickup_user?: { id: string; username: string };
  job?: { name: string; client_name: string };
  documents?: OrderDocument[];
}

interface OrderDocument {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

interface MaterialOrdersManagementProps {
  jobId?: string;
}

export function MaterialOrdersManagement({ jobId }: MaterialOrdersManagementProps) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MaterialOrder | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    job_id: jobId || '',
    vendor_id: '',
    order_number: '',
    order_type: 'delivery' as 'delivery' | 'pickup',
    order_date: new Date().toISOString().split('T')[0],
    scheduled_date: '',
    pickup_user_id: '',
    status: 'pending' as 'pending' | 'confirmed' | 'completed' | 'cancelled',
    notes: '',
    total_cost: '',
  });
  
  // Vendor form state
  const [vendorForm, setVendorForm] = useState({
    name: '',
    phone: '',
    email: '',
  });
  
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    loadData();
  }, [jobId]);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([
        loadOrders(),
        loadVendors(),
        loadUsers(),
        loadJobs(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    try {
      let query = supabase
        .from('material_orders')
        .select(`
          *,
          vendor:vendors(id, name),
          pickup_user:user_profiles!pickup_user_id(id, username),
          job:jobs(name, client_name)
        `)
        .order('scheduled_date', { ascending: true });

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Load documents for each order
      const ordersWithDocs = await Promise.all(
        (data || []).map(async (order) => {
          const { data: docs } = await supabase
            .from('material_order_documents')
            .select('*')
            .eq('order_id', order.id);
          return { ...order, documents: docs || [] };
        })
      );

      setOrders(ordersWithDocs);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    }
  }

  async function loadVendors() {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name');
      if (error) throw error;
      setVendors(data || []);
    } catch (error) {
      console.error('Error loading vendors:', error);
    }
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, role')
        .order('username');
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name')
        .neq('status', 'archived')
        .order('name');
      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async function handleCreateVendor() {
    if (!vendorForm.name) {
      toast.error('Vendor name is required');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          name: vendorForm.name,
          phone: vendorForm.phone || null,
          email: vendorForm.email || null,
          created_by: profile?.username,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Vendor created');
      setVendorForm({ name: '', phone: '', email: '' });
      setShowVendorDialog(false);
      await loadVendors();
      setFormData({ ...formData, vendor_id: data.id });
    } catch (error: any) {
      console.error('Error creating vendor:', error);
      toast.error('Failed to create vendor');
    }
  }

  async function handleCreateOrder() {
    if (!formData.job_id) {
      toast.error('Job is required');
      return;
    }

    try {
      const { data: orderData, error: orderError } = await supabase
        .from('material_orders')
        .insert({
          job_id: formData.job_id,
          vendor_id: formData.vendor_id || null,
          order_number: formData.order_number || null,
          order_type: formData.order_type,
          order_date: formData.order_date,
          scheduled_date: formData.scheduled_date || formData.order_date,
          pickup_user_id: formData.order_type === 'pickup' ? (formData.pickup_user_id || null) : null,
          status: formData.status,
          notes: formData.notes || null,
          total_cost: formData.total_cost ? parseFloat(formData.total_cost) : null,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Upload files
      if (selectedFiles.length > 0) {
        await uploadOrderDocuments(orderData.id);
      }

      // Create calendar event (only if scheduled_date provided)
      if (orderData.scheduled_date) {
        await createCalendarEvent(orderData);
      }

      // If pickup with user and date, create task and notification
      if (orderData.order_type === 'pickup' && orderData.pickup_user_id && orderData.scheduled_date) {
        await createPickupTask(orderData);
        await createPickupNotification(orderData);
      }

      toast.success('Order created successfully');
      resetForm();
      setShowCreateDialog(false);
      await loadOrders();
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error(`Failed to create order: ${error.message || 'Unknown error'}`);
    }
  }

  async function uploadOrderDocuments(orderId: string) {
    try {
      setUploadingFiles(true);

      for (const file of selectedFiles) {
        // Upload to storage
        const fileName = `${orderId}/${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('job-files')
          .getPublicUrl(fileName);

        // Save document record
        const { error: docError } = await supabase
          .from('material_order_documents')
          .insert({
            order_id: orderId,
            file_name: file.name,
            file_url: publicUrl,
            uploaded_by: profile?.id,
          });

        if (docError) throw docError;
      }

      setSelectedFiles([]);
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.error('Failed to upload some documents');
    } finally {
      setUploadingFiles(false);
    }
  }

  async function createCalendarEvent(order: MaterialOrder) {
    if (!order.scheduled_date) return;

    try {
      const job = jobs.find(j => j.id === order.job_id);
      const vendor = vendors.find(v => v.id === order.vendor_id);
      
      const title = order.order_type === 'delivery' 
        ? `Material Delivery - ${vendor?.name || 'Vendor'}` 
        : `Material Pickup - ${vendor?.name || 'Vendor'}`;
      
      const description = `Order ${order.order_number || 'N/A'}\n${order.notes || ''}`;

      const { error } = await supabase
        .from('calendar_events')
        .insert({
          title,
          description,
          event_date: order.scheduled_date,
          event_type: order.order_type === 'delivery' ? 'delivery' : 'pickup',
          job_id: order.job_id,
          all_day: true,
          created_by: profile?.id,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      // Don't throw - calendar event is nice to have but not critical
    }
  }

  async function createPickupTask(order: MaterialOrder) {
    if (!order.pickup_user_id || !order.scheduled_date) return;

    try {
      const vendor = vendors.find(v => v.id === order.vendor_id);
      const job = jobs.find(j => j.id === order.job_id);
      
      const taskTitle = `Pickup Materials - ${vendor?.name || 'Vendor'}`;
      const taskDescription = `Pick up materials for ${job?.name || 'Job'}\nOrder: ${order.order_number || 'N/A'}\n${order.notes || ''}`;

      const { error } = await supabase
        .from('job_tasks')
        .insert({
          job_id: order.job_id,
          title: taskTitle,
          description: taskDescription,
          task_type: 'office',
          assigned_to: order.pickup_user_id,
          created_by: profile?.id,
          due_date: order.scheduled_date,
          priority: 'high',
          status: 'pending',
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating pickup task:', error);
      // Don't throw - task is nice to have but not critical
    }
  }

  async function createPickupNotification(order: MaterialOrder) {
    if (!order.pickup_user_id || !order.scheduled_date) return;

    try {
      const vendor = vendors.find(v => v.id === order.vendor_id);
      const pickupUser = users.find(u => u.id === order.pickup_user_id);
      
      const brief = `Material pickup assigned: ${vendor?.name || 'Vendor'} on ${new Date(order.scheduled_date).toLocaleDateString()}`;

      await createNotification({
        jobId: order.job_id,
        createdBy: profile?.id || '',
        type: 'note',
        brief,
        referenceData: {
          order_id: order.id,
          assigned_to: pickupUser?.username,
          vendor: vendor?.name,
        },
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      // Don't throw - notification is nice to have but not critical
    }
  }

  async function handleDeleteOrder(orderId: string) {
    if (!confirm('Are you sure you want to delete this order?')) return;

    try {
      const { error } = await supabase
        .from('material_orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Order deleted');
      await loadOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  }

  function resetForm() {
    setFormData({
      job_id: jobId || '',
      vendor_id: '',
      order_number: '',
      order_type: 'delivery',
      order_date: new Date().toISOString().split('T')[0],
      scheduled_date: '',
      pickup_user_id: '',
      status: 'pending',
      notes: '',
      total_cost: '',
    });
    setSelectedFiles([]);
    setSelectedOrder(null);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  const filteredOrders = orders.filter(order => !jobId || order.job_id === jobId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Material Orders</h3>
          <p className="text-sm text-muted-foreground">
            Manage vendor orders and pickups
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Order
        </Button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No orders found. Create your first order to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {order.order_type === 'delivery' ? (
                        <Truck className="w-4 h-4 text-blue-600" />
                      ) : (
                        <User className="w-4 h-4 text-purple-600" />
                      )}
                      <CardTitle className="text-sm">
                        {order.vendor?.name || 'No Vendor'}
                      </CardTitle>
                    </div>
                    {!jobId && order.job && (
                      <p className="text-xs text-muted-foreground">
                        {order.job.name}
                      </p>
                    )}
                  </div>
                  <Badge className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.scheduled_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {new Date(order.scheduled_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                {order.order_number && (
                  <div className="flex items-center gap-2 text-xs">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono">{order.order_number}</span>
                  </div>
                )}
                
                {order.order_type === 'pickup' && order.pickup_user && (
                  <div className="flex items-center gap-2 text-xs">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span>{order.pickup_user.username}</span>
                  </div>
                )}
                
                {order.total_cost && (
                  <div className="text-sm font-semibold text-green-700">
                    ${order.total_cost.toLocaleString()}
                  </div>
                )}
                
                {order.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {order.notes}
                  </p>
                )}
                
                {order.documents && order.documents.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {order.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                      >
                        <FileText className="w-3 h-3" />
                        {doc.file_name}
                      </a>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-1 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteOrder(order.id)}
                    className="h-7 text-xs"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Order Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Material Order</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Job Selection */}
            {!jobId && (
              <div className="space-y-2">
                <Label>Job *</Label>
                <Select
                  value={formData.job_id}
                  onValueChange={(value) => setFormData({ ...formData, job_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.name} - {job.client_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Vendor Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Vendor</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVendorDialog(true)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  New Vendor
                </Button>
              </div>
              <Select
                value={formData.vendor_id}
                onValueChange={(value) => setFormData({ ...formData, vendor_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Order Number */}
            <div className="space-y-2">
              <Label>Order Number</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                placeholder="e.g., PO-2024-001"
              />
            </div>
            
            {/* Order Type */}
            <div className="space-y-2">
              <Label>Order Type *</Label>
              <Select
                value={formData.order_type}
                onValueChange={(value: 'delivery' | 'pickup') => 
                  setFormData({ ...formData, order_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Delivery
                    </div>
                  </SelectItem>
                  <SelectItem value="pickup">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Pickup
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={formData.order_date}
                  onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
            </div>
            
            {/* Pickup User (only for pickup orders) */}
            {formData.order_type === 'pickup' && (
              <div className="space-y-2">
                <Label>Assign Pickup To</Label>
                <Select
                  value={formData.pickup_user_id}
                  onValueChange={(value) => setFormData({ ...formData, pickup_user_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.username} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Total Cost */}
            <div className="space-y-2">
              <Label>Total Cost</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.total_cost}
                onChange={(e) => setFormData({ ...formData, total_cost: e.target.value })}
                placeholder="0.00"
              />
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Order details, special instructions, etc..."
              />
            </div>
            
            {/* File Upload with Drag & Drop */}
            <div className="space-y-2">
              <Label>Documents (PDFs)</Label>
              <div 
                className="border-2 border-dashed rounded-lg p-4 transition-colors hover:border-primary hover:bg-primary/5"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('border-primary', 'bg-primary/10');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                  const files = Array.from(e.dataTransfer.files).filter(file => 
                    file.type === 'application/pdf' || file.name.endsWith('.pdf')
                  );
                  if (files.length > 0) {
                    setSelectedFiles([...selectedFiles, ...files]);
                  } else {
                    toast.error('Please upload PDF files only');
                  }
                }}
              >
                <input
                  type="file"
                  id="order-files"
                  multiple
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setSelectedFiles([...selectedFiles, ...files]);
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="order-files"
                  className="flex flex-col items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click or drag & drop PDFs here
                  </span>
                </label>
                
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-xs bg-blue-50 p-2 rounded">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
                          }}
                          className="h-5 w-5 p-0"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreateOrder}
                disabled={uploadingFiles}
                className="flex-1"
              >
                {uploadingFiles ? 'Uploading...' : 'Create Order'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Vendor Dialog */}
      <Dialog open={showVendorDialog} onOpenChange={setShowVendorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor Name *</Label>
              <Input
                value={vendorForm.name}
                onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                placeholder="e.g., ABC Supply Co."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={vendorForm.phone}
                onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={vendorForm.email}
                onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                placeholder="vendor@example.com"
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button onClick={handleCreateVendor} className="flex-1">
                <Store className="w-4 h-4 mr-2" />
                Add Vendor
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowVendorDialog(false);
                  setVendorForm({ name: '', phone: '', email: '' });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
