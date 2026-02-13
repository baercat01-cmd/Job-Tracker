import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Package, DollarSign, FileText, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface MaterialItem {
  id: string;
  material_name: string;
  quantity: number;
  sku?: string | null;
  usage?: string | null;
  category?: string;
  cost_per_unit?: number | null;
  price_per_unit?: number | null;
}

interface ZohoOrderConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobName: string;
  materials: MaterialItem[];
  packageName?: string;
}

export function ZohoOrderConfirmationDialog({
  open,
  onOpenChange,
  jobName,
  materials,
  packageName,
}: ZohoOrderConfirmationDialogProps) {
  const { profile } = useAuth();
  const [creating, setCreating] = useState(false);
  const [orderType, setOrderType] = useState<'both' | 'sales_order' | 'purchase_order'>('both');
  const [createdOrders, setCreatedOrders] = useState<{
    salesOrder?: { id: string; number: string; url: string };
    purchaseOrder?: { id: string; number: string; url: string };
  } | null>(null);

  const totalCost = materials.reduce((sum, m) => sum + ((m.cost_per_unit || 0) * m.quantity), 0);
  const totalPrice = materials.reduce((sum, m) => sum + ((m.price_per_unit || 0) * m.quantity), 0);

  async function createOrders() {
    setCreating(true);
    try {
      console.log('📤 Creating Zoho orders for materials:', materials.length, 'Type:', orderType);
      
      // Check if any materials are already ordered
      const alreadyOrdered = materials.filter(m => 
        m.zoho_sales_order_id || m.zoho_purchase_order_id
      );
      
      if (alreadyOrdered.length > 0) {
        const proceed = confirm(
          `${alreadyOrdered.length} material${alreadyOrdered.length !== 1 ? 's' : ''} already ha${alreadyOrdered.length !== 1 ? 've' : 's'} Zoho orders. Continue anyway?`
        );
        if (!proceed) {
          setCreating(false);
          return;
        }
      }
      
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'create_orders',
          jobName: jobName,
          materialItems: materials,
          materialItemIds: materials.map(m => m.id),
          userId: profile?.id,
          notes: packageName ? `Package: ${packageName}` : undefined,
          orderType: orderType,
        },
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        throw new Error(errorMessage);
      }

      console.log('✅ Orders created successfully:', data);
      setCreatedOrders({
        salesOrder: data.salesOrder,
        purchaseOrder: data.purchaseOrder,
      });
      
      // Build toast description based on what was created
      let description = '';
      if (data.salesOrder && data.purchaseOrder) {
        description = `Sales Order #${data.salesOrder.number} and PO #${data.purchaseOrder.number}`;
      } else if (data.salesOrder) {
        description = `Sales Order #${data.salesOrder.number}`;
      } else if (data.purchaseOrder) {
        description = `Purchase Order #${data.purchaseOrder.number}`;
      }
      
      toast.success('Orders created in Zoho Books!', { description });
    } catch (error: any) {
      console.error('❌ Error creating orders:', error);
      toast.error(`Failed to create orders: ${error.message}`);
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setCreatedOrders(null);
    setOrderType('both');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            {createdOrders ? 'Orders Created Successfully!' : 'Create Zoho Orders'}
          </DialogTitle>
          <DialogDescription>
            {createdOrders 
              ? `Order${(createdOrders.salesOrder && createdOrders.purchaseOrder) ? 's' : ''} created in Zoho Books`
              : `Create Zoho order(s) for: ${jobName}${packageName ? ` - ${packageName}` : ''}`
            }
          </DialogDescription>
        </DialogHeader>

        {!createdOrders ? (
          <>
            {/* Order Summary */}
            <div className="space-y-4">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Order Summary</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-sm text-blue-700">Job:</span>
                    <p className="font-semibold text-blue-900">{jobName}</p>
                  </div>
                  {packageName && (
                    <div>
                      <span className="text-sm text-blue-700">Package:</span>
                      <p className="font-semibold text-blue-900">{packageName}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-blue-700">Total Items:</span>
                    <p className="font-semibold text-blue-900">{materials.length}</p>
                  </div>
                  <div>
                    <span className="text-sm text-blue-700">Total Quantity:</span>
                    <p className="font-semibold text-blue-900">
                      {materials.reduce((sum, m) => sum + m.quantity, 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Order Type Selection */}
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                <Label className="text-sm font-semibold text-purple-900 mb-3 block">Select Order Type:</Label>
                <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as any)} className="space-y-2">
                  <div className="flex items-center space-x-2 p-2 rounded hover:bg-purple-100 cursor-pointer">
                    <RadioGroupItem value="both" id="both" />
                    <Label htmlFor="both" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Both - Sales Order & Purchase Order</div>
                      <div className="text-xs text-muted-foreground">Create both orders for complete workflow</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2 rounded hover:bg-green-100 cursor-pointer">
                    <RadioGroupItem value="sales_order" id="sales_order" />
                    <Label htmlFor="sales_order" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Sales Order Only</div>
                      <div className="text-xs text-muted-foreground">For invoicing the customer</div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2 rounded hover:bg-orange-100 cursor-pointer">
                    <RadioGroupItem value="purchase_order" id="purchase_order" />
                    <Label htmlFor="purchase_order" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Purchase Order Only</div>
                      <div className="text-xs text-muted-foreground">For ordering from vendor</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Financials */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-green-700" />
                    <h4 className="font-semibold text-green-900">Sales Order Total</h4>
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    ${totalPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-green-600 mt-1">Based on selling prices</p>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-orange-700" />
                    <h4 className="font-semibold text-orange-900">Purchase Order Total</h4>
                  </div>
                  <p className="text-2xl font-bold text-orange-700">
                    ${totalCost.toFixed(2)}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">Based on cost prices</p>
                </div>
              </div>

              {/* Materials List */}
              <div className="border rounded-lg">
                <div className="bg-slate-100 px-4 py-2 font-semibold text-sm border-b sticky top-0">
                  Materials to Order ({materials.length})
                </div>
                <div className="max-h-64 overflow-y-auto divide-y">
                  {materials.map((material) => (
                    <div key={material.id} className="p-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{material.material_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {material.sku && (
                              <Badge variant="outline" className="text-xs">
                                SKU: {material.sku}
                              </Badge>
                            )}
                            {material.category && (
                              <Badge variant="secondary" className="text-xs">
                                {material.category}
                              </Badge>
                            )}
                            {material.usage && (
                              <span className="text-xs text-muted-foreground truncate">
                                {material.usage}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-semibold">Qty: {material.quantity}</p>
                          {material.price_per_unit && (
                            <p className="text-xs text-green-600">
                              ${material.price_per_unit.toFixed(2)}/unit
                            </p>
                          )}
                          {material.cost_per_unit && (
                            <p className="text-xs text-orange-600">
                              Cost: ${material.cost_per_unit.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="font-semibold text-blue-900 text-sm mb-2">What will be created:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  {(orderType === 'both' || orderType === 'sales_order') && (
                    <li>• <strong>Sales Order</strong> - For invoicing the customer (${totalPrice.toFixed(2)})</li>
                  )}
                  {(orderType === 'both' || orderType === 'purchase_order') && (
                    <li>• <strong>Purchase Order</strong> - For ordering from vendor (${totalCost.toFixed(2)})</li>
                  )}
                  <li>• Order{orderType === 'both' ? 's' : ''} will reference: <strong>{jobName}</strong></li>
                  <li>• Created in Zoho Books COUNTYWIDE organization</li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={createOrders}
                disabled={creating}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Orders...
                  </>
                ) : orderType === 'both' ? (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Create Sales Order & PO
                  </>
                ) : orderType === 'sales_order' ? (
                  <>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Create Sales Order
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Create Purchase Order
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Success View */}
            <div className="space-y-4">
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-green-900 mb-2">
                  Order{(createdOrders.salesOrder && createdOrders.purchaseOrder) ? 's' : ''} Created Successfully!
                </h3>
                <p className="text-green-700">
                  {createdOrders.salesOrder && createdOrders.purchaseOrder
                    ? 'Both Sales Order and Purchase Order have been created'
                    : createdOrders.salesOrder
                    ? 'Sales Order has been created'
                    : 'Purchase Order has been created'
                  } in Zoho Books
                </p>
              </div>

              {/* Sales Order Card */}
              {createdOrders.salesOrder && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-700" />
                    <h4 className="font-semibold text-green-900">Sales Order</h4>
                  </div>
                  <Badge className="bg-green-600">Created</Badge>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-green-700">Order Number:</span>
                    <p className="font-semibold text-green-900">{createdOrders.salesOrder?.number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-green-700">Order ID:</span>
                    <p className="font-mono text-xs text-green-800">{createdOrders.salesOrder?.id}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-green-300 text-green-700 hover:bg-green-100"
                    onClick={() => window.open(createdOrders.salesOrder?.url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View in Zoho Books
                  </Button>
                </div>
              </div>
              )}

              {/* Purchase Order Card */}
              {createdOrders.purchaseOrder && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-orange-700" />
                    <h4 className="font-semibold text-orange-900">Purchase Order</h4>
                  </div>
                  <Badge className="bg-orange-600">Created</Badge>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-orange-700">PO Number:</span>
                    <p className="font-semibold text-orange-900">{createdOrders.purchaseOrder?.number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-orange-700">PO ID:</span>
                    <p className="font-mono text-xs text-orange-800">{createdOrders.purchaseOrder?.id}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                    onClick={() => window.open(createdOrders.purchaseOrder?.url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View in Zoho Books
                  </Button>
                </div>
              </div>
              )}
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleClose} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
