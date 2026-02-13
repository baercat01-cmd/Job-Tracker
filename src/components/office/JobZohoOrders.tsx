import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Package, DollarSign, FileText, Calendar } from 'lucide-react';

interface MaterialWithOrder {
  id: string;
  material_name: string;
  quantity: number;
  category: string;
  cost_per_unit: number | null;
  price_per_unit: number | null;
  zoho_sales_order_id: string | null;
  zoho_sales_order_number: string | null;
  zoho_purchase_order_id: string | null;
  zoho_purchase_order_number: string | null;
  ordered_at: string | null;
  sheets: {
    sheet_name: string;
  };
}

interface OrderGroup {
  salesOrderNumber: string | null;
  purchaseOrderNumber: string | null;
  salesOrderId: string | null;
  purchaseOrderId: string | null;
  orderedAt: string | null;
  materials: MaterialWithOrder[];
}

interface JobZohoOrdersProps {
  jobId: string;
}

export function JobZohoOrders({ jobId }: JobZohoOrdersProps) {
  const [orderedMaterials, setOrderedMaterials] = useState<MaterialWithOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderedMaterials();
  }, [jobId]);

  async function loadOrderedMaterials() {
    try {
      setLoading(true);

      // Get working workbook
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working')
        .maybeSingle();

      if (!workbookData) {
        setOrderedMaterials([]);
        return;
      }

      // Get all sheets
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('id')
        .eq('workbook_id', workbookData.id);

      if (!sheetsData || sheetsData.length === 0) {
        setOrderedMaterials([]);
        return;
      }

      const sheetIds = sheetsData.map(s => s.id);

      // Get materials with Zoho orders
      const { data, error } = await supabase
        .from('material_items')
        .select(`
          id,
          material_name,
          quantity,
          category,
          cost_per_unit,
          price_per_unit,
          zoho_sales_order_id,
          zoho_sales_order_number,
          zoho_purchase_order_id,
          zoho_purchase_order_number,
          ordered_at,
          sheets:material_sheets(sheet_name)
        `)
        .in('sheet_id', sheetIds)
        .or('zoho_sales_order_id.not.is.null,zoho_purchase_order_id.not.is.null')
        .order('ordered_at', { ascending: false });

      if (error) throw error;
      setOrderedMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading ordered materials:', error);
    } finally {
      setLoading(false);
    }
  }

  // Group materials by their order numbers
  function groupMaterialsByOrder(materials: MaterialWithOrder[]): OrderGroup[] {
    const orderMap = new Map<string, OrderGroup>();

    materials.forEach(material => {
      // Create a unique key for this combination of orders
      const key = `${material.zoho_sales_order_number || 'none'}_${material.zoho_purchase_order_number || 'none'}`;

      if (!orderMap.has(key)) {
        orderMap.set(key, {
          salesOrderNumber: material.zoho_sales_order_number,
          purchaseOrderNumber: material.zoho_purchase_order_number,
          salesOrderId: material.zoho_sales_order_id,
          purchaseOrderId: material.zoho_purchase_order_id,
          orderedAt: material.ordered_at,
          materials: [],
        });
      }

      orderMap.get(key)!.materials.push(material);
    });

    return Array.from(orderMap.values()).sort((a, b) => {
      const dateA = a.orderedAt ? new Date(a.orderedAt).getTime() : 0;
      const dateB = b.orderedAt ? new Date(b.orderedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  const orderGroups = groupMaterialsByOrder(orderedMaterials);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading orders...</p>
      </div>
    );
  }

  if (orderedMaterials.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Materials Ordered Yet</h3>
          <p className="text-sm text-muted-foreground">
            Materials that are ordered through Zoho will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-purple-900">Zoho Orders Summary</h3>
            <p className="text-sm text-purple-700 mt-1">
              {orderGroups.length} order{orderGroups.length !== 1 ? 's' : ''} • {orderedMaterials.length} material{orderedMaterials.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Package className="w-12 h-12 text-purple-600 opacity-50" />
        </div>
      </div>

      <div className="space-y-3">
        {orderGroups.map((group, index) => {
          const totalCost = group.materials.reduce((sum, m) => sum + ((m.cost_per_unit || 0) * m.quantity), 0);
          const totalPrice = group.materials.reduce((sum, m) => sum + ((m.price_per_unit || 0) * m.quantity), 0);

          return (
            <Card key={index} className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {group.salesOrderNumber && (
                        <Badge className="bg-green-600">
                          <DollarSign className="w-3 h-3 mr-1" />
                          SO: {group.salesOrderNumber}
                        </Badge>
                      )}
                      {group.purchaseOrderNumber && (
                        <Badge className="bg-blue-600">
                          <FileText className="w-3 h-3 mr-1" />
                          PO: {group.purchaseOrderNumber}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {group.materials.length} material{group.materials.length !== 1 ? 's' : ''}
                      </Badge>
                    </CardTitle>
                    {group.orderedAt && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Ordered: {new Date(group.orderedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {group.salesOrderId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => window.open(`https://books.zoho.com/app#/salesorders/${group.salesOrderId}`, '_blank')}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View SO
                      </Button>
                    )}
                    {group.purchaseOrderId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => window.open(`https://books.zoho.com/app#/purchaseorders/${group.purchaseOrderId}`, '_blank')}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View PO
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Order Totals */}
                <div className="grid grid-cols-2 gap-3">
                  {group.salesOrderNumber && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="text-xs text-green-700 mb-1">Sales Order Total</div>
                      <div className="text-lg font-bold text-green-900">${totalPrice.toFixed(2)}</div>
                    </div>
                  )}
                  {group.purchaseOrderNumber && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs text-blue-700 mb-1">Purchase Order Total</div>
                      <div className="text-lg font-bold text-blue-900">${totalCost.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Materials List */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 text-sm font-semibold border-b">
                    Materials in Order
                  </div>
                  <div className="divide-y max-h-64 overflow-y-auto">
                    {group.materials.map(material => (
                      <div key={material.id} className="p-3 hover:bg-slate-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{material.material_name}</div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="text-xs">
                                {material.category}
                              </Badge>
                              <span>•</span>
                              <span>{material.sheets.sheet_name}</span>
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-sm font-semibold">Qty: {material.quantity}</div>
                            {material.price_per_unit && (
                              <div className="text-xs text-green-600">
                                ${material.price_per_unit.toFixed(2)}/unit
                              </div>
                            )}
                            {material.cost_per_unit && (
                              <div className="text-xs text-blue-600">
                                Cost: ${material.cost_per_unit.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
