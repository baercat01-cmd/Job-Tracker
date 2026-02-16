import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, Package, DollarSign, FileText, Calendar, Receipt, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  zoho_invoice_id: string | null;
  zoho_invoice_number: string | null;
  ordered_at: string | null;
  sheets: {
    sheet_name: string;
  };
}

interface SalesOrder {
  id: string;
  number: string;
  orderedAt: string | null;
  materials: MaterialWithOrder[];
  total: number;
}

interface PurchaseOrder {
  id: string;
  number: string;
  orderedAt: string | null;
  materials: MaterialWithOrder[];
  total: number;
}

interface Invoice {
  id: string;
  number: string;
  orderedAt: string | null;
  materials: MaterialWithOrder[];
  total: number;
}

interface JobZohoOrdersProps {
  jobId: string;
}

export function JobZohoOrders({ jobId }: JobZohoOrdersProps) {
  const [orderedMaterials, setOrderedMaterials] = useState<MaterialWithOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales-orders');

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

      // Get materials with Zoho orders/invoices
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
          zoho_invoice_id,
          zoho_invoice_number,
          ordered_at,
          sheets:material_sheets(sheet_name)
        `)
        .in('sheet_id', sheetIds)
        .or('zoho_sales_order_id.not.is.null,zoho_purchase_order_id.not.is.null,zoho_invoice_id.not.is.null')
        .order('ordered_at', { ascending: false });

      if (error) throw error;
      setOrderedMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading ordered materials:', error);
    } finally {
      setLoading(false);
    }
  }

  // Group materials into Sales Orders
  function getSalesOrders(materials: MaterialWithOrder[]): SalesOrder[] {
    const soMap = new Map<string, SalesOrder>();

    materials.forEach(material => {
      if (!material.zoho_sales_order_id || !material.zoho_sales_order_number) return;

      const key = material.zoho_sales_order_number;

      if (!soMap.has(key)) {
        soMap.set(key, {
          id: material.zoho_sales_order_id,
          number: material.zoho_sales_order_number,
          orderedAt: material.ordered_at,
          materials: [],
          total: 0,
        });
      }

      const order = soMap.get(key)!;
      order.materials.push(material);
      order.total += (material.price_per_unit || 0) * material.quantity;
    });

    return Array.from(soMap.values()).sort((a, b) => {
      const dateA = a.orderedAt ? new Date(a.orderedAt).getTime() : 0;
      const dateB = b.orderedAt ? new Date(b.orderedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  // Group materials into Purchase Orders
  function getPurchaseOrders(materials: MaterialWithOrder[]): PurchaseOrder[] {
    const poMap = new Map<string, PurchaseOrder>();

    materials.forEach(material => {
      if (!material.zoho_purchase_order_id || !material.zoho_purchase_order_number) return;

      const key = material.zoho_purchase_order_number;

      if (!poMap.has(key)) {
        poMap.set(key, {
          id: material.zoho_purchase_order_id,
          number: material.zoho_purchase_order_number,
          orderedAt: material.ordered_at,
          materials: [],
          total: 0,
        });
      }

      const order = poMap.get(key)!;
      order.materials.push(material);
      order.total += (material.cost_per_unit || 0) * material.quantity;
    });

    return Array.from(poMap.values()).sort((a, b) => {
      const dateA = a.orderedAt ? new Date(a.orderedAt).getTime() : 0;
      const dateB = b.orderedAt ? new Date(b.orderedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  // Group materials into Invoices
  function getInvoices(materials: MaterialWithOrder[]): Invoice[] {
    const invMap = new Map<string, Invoice>();

    materials.forEach(material => {
      if (!material.zoho_invoice_id || !material.zoho_invoice_number) return;

      const key = material.zoho_invoice_number;

      if (!invMap.has(key)) {
        invMap.set(key, {
          id: material.zoho_invoice_id,
          number: material.zoho_invoice_number,
          orderedAt: material.ordered_at,
          materials: [],
          total: 0,
        });
      }

      const invoice = invMap.get(key)!;
      invoice.materials.push(material);
      invoice.total += (material.price_per_unit || 0) * material.quantity;
    });

    return Array.from(invMap.values()).sort((a, b) => {
      const dateA = a.orderedAt ? new Date(a.orderedAt).getTime() : 0;
      const dateB = b.orderedAt ? new Date(b.orderedAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  const salesOrders = getSalesOrders(orderedMaterials);
  const purchaseOrders = getPurchaseOrders(orderedMaterials);
  const invoices = getInvoices(orderedMaterials);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading Zoho orders...</p>
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
            Materials ordered through Zoho Books will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderMaterialsList = (materials: MaterialWithOrder[]) => (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-sm">#</th>
              <th className="text-left px-4 py-3 font-semibold text-sm">Item & Description</th>
              <th className="text-right px-4 py-3 font-semibold text-sm">Qty</th>
              <th className="text-right px-4 py-3 font-semibold text-sm">Cost</th>
              <th className="text-right px-4 py-3 font-semibold text-sm">Markup %</th>
              <th className="text-right px-4 py-3 font-semibold text-sm">Price</th>
              <th className="text-right px-4 py-3 font-semibold text-sm">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {materials.map((material, index) => {
              const cost = material.cost_per_unit || 0;
              const price = material.price_per_unit || 0;
              const markup = cost > 0 ? ((price - cost) / cost * 100) : 0;
              const amount = price * material.quantity;
              
              return (
                <tr key={material.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-slate-900">{material.material_name}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{material.sheets.sheet_name}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {material.quantity}
                    <div className="text-xs text-slate-500">pcs</div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium">
                    ${cost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-green-700">
                    {markup.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-blue-700">
                    ${price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold">
                    ${amount.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Card className="border-2 border-purple-300">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 border-b-2 border-purple-200">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-6 h-6 text-purple-700" />
            Zoho Books Orders
          </CardTitle>
          <div className="flex items-center gap-2">
            {salesOrders.length > 0 && (
              <Badge className="bg-green-600 text-white">
                {salesOrders.length} SO{salesOrders.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {invoices.length > 0 && (
              <Badge className="bg-amber-600 text-white">
                {invoices.length} Invoice{invoices.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {purchaseOrders.length > 0 && (
              <Badge className="bg-blue-600 text-white">
                {purchaseOrders.length} PO{purchaseOrders.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="sales-orders" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Sales Orders
              <Badge variant="secondary" className="ml-1">
                {salesOrders.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Invoices
              <Badge variant="secondary" className="ml-1">
                {invoices.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Purchase Orders
              <Badge variant="secondary" className="ml-1">
                {purchaseOrders.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Sales Orders Tab */}
          <TabsContent value="sales-orders" className="space-y-4">
            {salesOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Sales Orders</h3>
                  <p className="text-sm text-muted-foreground">
                    Sales orders created in Zoho Books will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              salesOrders.map((so) => (
                <Collapsible key={so.id}>
                  <Card className="border-2 border-green-200 shadow-md">
                    <div className="bg-gradient-to-r from-green-50 to-white border-b p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                              <ChevronRight className="w-5 h-5 text-green-700 transition-transform [&[data-state=open]]:rotate-90" />
                            </Button>
                          </CollapsibleTrigger>
                          <a
                            href={`https://books.zoho.com/app#/salesorders/${so.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded hover:from-green-700 hover:to-green-800 transition-all text-sm"
                          >
                            <DollarSign className="w-4 h-4" />
                            SO #{so.number}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <Badge variant="outline" className="bg-white">
                            <Package className="w-3 h-3 mr-1" />
                            {so.materials.length} items
                          </Badge>
                          {so.orderedAt && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {new Date(so.orderedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded px-4 py-1">
                          <div className="text-xs text-green-700">Total</div>
                          <div className="text-xl font-bold text-green-900">
                            ${so.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <CardContent className="pt-4">
                        {renderMaterialsList(so.materials)}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            {invoices.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Receipt className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Invoices</h3>
                  <p className="text-sm text-muted-foreground">
                    Invoices created in Zoho Books will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              invoices.map((inv) => (
                <Collapsible key={inv.id}>
                  <Card className="border-2 border-amber-200 shadow-md">
                    <div className="bg-gradient-to-r from-amber-50 to-white border-b p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                              <ChevronRight className="w-5 h-5 text-amber-700 transition-transform [&[data-state=open]]:rotate-90" />
                            </Button>
                          </CollapsibleTrigger>
                          <a
                            href={`https://books.zoho.com/app#/invoices/${inv.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white font-semibold rounded hover:from-amber-700 hover:to-amber-800 transition-all text-sm"
                          >
                            <Receipt className="w-4 h-4" />
                            INV #{inv.number}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <Badge variant="outline" className="bg-white">
                            <Package className="w-3 h-3 mr-1" />
                            {inv.materials.length} items
                          </Badge>
                          {inv.orderedAt && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {new Date(inv.orderedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-1">
                          <div className="text-xs text-amber-700">Total</div>
                          <div className="text-xl font-bold text-amber-900">
                            ${inv.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <CardContent className="pt-4">
                        {renderMaterialsList(inv.materials)}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>

          {/* Purchase Orders Tab */}
          <TabsContent value="purchase-orders" className="space-y-4">
            {purchaseOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Purchase Orders</h3>
                  <p className="text-sm text-muted-foreground">
                    Purchase orders created in Zoho Books will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              purchaseOrders.map((po) => (
                <Collapsible key={po.id}>
                  <Card className="border-2 border-blue-200 shadow-md">
                    <div className="bg-gradient-to-r from-blue-50 to-white border-b p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                              <ChevronRight className="w-5 h-5 text-blue-700 transition-transform [&[data-state=open]]:rotate-90" />
                            </Button>
                          </CollapsibleTrigger>
                          <a
                            href={`https://books.zoho.com/app#/purchaseorders/${po.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded hover:from-blue-700 hover:to-blue-800 transition-all text-sm"
                          >
                            <FileText className="w-4 h-4" />
                            PO #{po.number}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <Badge variant="outline" className="bg-white">
                            <Package className="w-3 h-3 mr-1" />
                            {po.materials.length} items
                          </Badge>
                          {po.orderedAt && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {new Date(po.orderedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded px-4 py-1">
                          <div className="text-xs text-blue-700">Total</div>
                          <div className="text-xl font-bold text-blue-900">
                            ${po.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <CardContent className="pt-4">
                        {renderMaterialsList(po.materials)}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
