import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Download, 
  Printer,
  DollarSign,
  Package,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface Material {
  id: string;
  name: string;
  quantity: number;
  length: string | null;
  delivery_vendor: string | null;
  pickup_vendor: string | null;
  delivery_method: string | null;
  status: string;
  color: string | null;
  use_case: string | null;
}

interface CatalogMatch {
  sku: string;
  unit_price: number | null;
  purchase_cost: number | null;
}

interface EnrichedMaterial extends Material {
  catalog_price: number | null;
  extended_price: number;
  matched: boolean;
}

interface VendorGroup {
  vendor: string;
  materials: EnrichedMaterial[];
  total: number;
  selected: boolean;
}

interface MaterialsPurchaseOrderGeneratorProps {
  job: Job;
}

export function MaterialsPurchaseOrderGenerator({ job }: MaterialsPurchaseOrderGeneratorProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [catalog, setCatalog] = useState<Map<string, CatalogMatch>>(new Map());
  const [vendorGroups, setVendorGroups] = useState<VendorGroup[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewVendor, setPreviewVendor] = useState<VendorGroup | null>(null);

  useEffect(() => {
    loadData();
  }, [job.id]);

  async function loadData() {
    try {
      setLoading(true);
      
      // Load job materials
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .eq('job_id', job.id)
        .in('status', ['not_ordered', 'order_requested']);

      if (materialsError) throw materialsError;

      // Load catalog for price matching
      const { data: catalogData, error: catalogError } = await supabase
        .from('materials_catalog')
        .select('sku, material_name, part_length, unit_price, purchase_cost');

      if (catalogError) throw catalogError;

      // Build catalog lookup map (key: name|length)
      const catalogMap = new Map<string, CatalogMatch>();
      catalogData?.forEach(item => {
        const key = `${item.material_name}|${item.part_length}`.toLowerCase();
        catalogMap.set(key, {
          sku: item.sku,
          unit_price: item.unit_price,
          purchase_cost: item.purchase_cost,
        });
      });

      setCatalog(catalogMap);
      setMaterials(materialsData || []);
      
      // Process and group materials
      processVendorGroups(materialsData || [], catalogMap);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function processVendorGroups(mats: Material[], cat: Map<string, CatalogMatch>) {
    // Enrich materials with pricing
    const enriched: EnrichedMaterial[] = mats.map(mat => {
      const key = `${mat.name}|${mat.length || ''}`.toLowerCase();
      const catalogMatch = cat.get(key);
      const price = catalogMatch?.purchase_cost || catalogMatch?.unit_price || 0;
      
      return {
        ...mat,
        catalog_price: price,
        extended_price: price * mat.quantity,
        matched: !!catalogMatch,
      };
    });

    // Group by vendor (prefer delivery_vendor, fallback to pickup_vendor)
    const groups = new Map<string, EnrichedMaterial[]>();
    
    enriched.forEach(mat => {
      const vendor = mat.delivery_vendor || mat.pickup_vendor || 'Unassigned Vendor';
      if (!groups.has(vendor)) {
        groups.set(vendor, []);
      }
      groups.get(vendor)!.push(mat);
    });

    // Convert to array and calculate totals
    const vendorArray: VendorGroup[] = Array.from(groups.entries()).map(([vendor, mats]) => ({
      vendor,
      materials: mats,
      total: mats.reduce((sum, m) => sum + m.extended_price, 0),
      selected: false,
    }));

    // Sort by total descending
    vendorArray.sort((a, b) => b.total - a.total);

    setVendorGroups(vendorArray);
  }

  function toggleVendor(vendor: string) {
    const newSelected = new Set(selectedVendors);
    if (newSelected.has(vendor)) {
      newSelected.delete(vendor);
    } else {
      newSelected.add(vendor);
    }
    setSelectedVendors(newSelected);
  }

  function selectAll() {
    setSelectedVendors(new Set(vendorGroups.map(g => g.vendor)));
  }

  function clearAll() {
    setSelectedVendors(new Set());
  }

  async function generatePurchaseOrders() {
    if (selectedVendors.size === 0) {
      toast.error('Please select at least one vendor');
      return;
    }

    try {
      const selectedGroups = vendorGroups.filter(g => selectedVendors.has(g.vendor));
      
      // Generate CSV for each vendor
      for (const group of selectedGroups) {
        generateVendorPO(group);
      }

      toast.success(`Generated ${selectedGroups.length} purchase order(s)`);
      
      // Update material status to 'order_requested'
      const materialIds = selectedGroups.flatMap(g => g.materials.map(m => m.id));
      await supabase
        .from('materials')
        .update({ status: 'ordered' })
        .in('id', materialIds);

      loadData(); // Reload to reflect status changes
    } catch (error) {
      console.error('Error generating purchase orders:', error);
      toast.error('Failed to generate purchase orders');
    }
  }

  function generateVendorPO(group: VendorGroup) {
    const headers = ['Item', 'Quantity', 'Length', 'Color', 'Use Case', 'Unit Price', 'Extended Price', 'SKU/Notes'];
    const rows = group.materials.map(m => [
      m.name,
      m.quantity.toString(),
      m.length || '',
      m.color || '',
      m.use_case || '',
      m.catalog_price ? `$${m.catalog_price.toFixed(2)}` : 'TBD',
      m.catalog_price ? `$${m.extended_price.toFixed(2)}` : 'TBD',
      m.matched ? 'Matched' : 'Manual Entry',
    ]);

    // Add totals row
    rows.push([
      '',
      '',
      '',
      '',
      '',
      'TOTAL:',
      `$${group.total.toFixed(2)}`,
      '',
    ]);

    // Build CSV
    const csv = [
      `Purchase Order - ${group.vendor}`,
      `Job: ${job.name} (#${job.job_number || 'N/A'})`,
      `Client: ${job.client_name}`,
      `Date: ${new Date().toLocaleDateString()}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO_${group.vendor.replace(/\s+/g, '_')}_${job.job_number || job.id}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalSelectedValue = vendorGroups
    .filter(g => selectedVendors.has(g.vendor))
    .reduce((sum, g) => sum + g.total, 0);

  const unmatchedCount = vendorGroups.reduce(
    (sum, g) => sum + g.materials.filter(m => !m.matched).length,
    0
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
          <p className="text-muted-foreground">Loading materials...</p>
        </CardContent>
      </Card>
    );
  }

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No materials need ordering</p>
          <p className="text-sm text-muted-foreground mt-2">
            Materials with status "Not Ordered" or "Order Requested" will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Purchase Order Generator</h2>
          <p className="text-muted-foreground">
            {materials.length} material{materials.length !== 1 ? 's' : ''} ready to order
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            Clear All
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{vendorGroups.length}</p>
              <p className="text-sm text-muted-foreground">Vendors</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{selectedVendors.size}</p>
              <p className="text-sm text-muted-foreground">Selected</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold">
                ${totalSelectedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-muted-foreground">Total Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className={`text-2xl font-bold ${unmatchedCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {unmatchedCount}
              </p>
              <p className="text-sm text-muted-foreground">Unmatched</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warning for unmatched items */}
      {unmatchedCount > 0 && (
        <Card className="border-orange-500 bg-orange-50">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <div className="flex-1">
              <p className="font-semibold text-orange-900">
                {unmatchedCount} material{unmatchedCount !== 1 ? 's' : ''} could not be matched to catalog
              </p>
              <p className="text-sm text-orange-700">
                These items will show "TBD" for pricing in the purchase orders
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vendor Groups */}
      <div className="space-y-4">
        {vendorGroups.map(group => (
          <Card key={group.vendor} className={selectedVendors.has(group.vendor) ? 'border-primary' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedVendors.has(group.vendor)}
                    onCheckedChange={() => toggleVendor(group.vendor)}
                  />
                  <div>
                    <CardTitle className="text-lg">{group.vendor}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">
                        {group.materials.length} item{group.materials.length !== 1 ? 's' : ''}
                      </Badge>
                      {group.materials.some(m => !m.matched) && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-900">
                          {group.materials.filter(m => !m.matched).length} unmatched
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      ${group.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPreviewVendor(group);
                      setShowPreview(true);
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {group.materials.slice(0, 5).map(mat => (
                  <div key={mat.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                    <div className="flex-1">
                      <p className="font-medium">{mat.name}</p>
                      <div className="flex gap-2 text-muted-foreground text-xs">
                        {mat.length && <span>Length: {mat.length}</span>}
                        {mat.color && <span>• Color: {mat.color}</span>}
                        {mat.use_case && <span>• {mat.use_case}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        Qty: {mat.quantity}
                      </p>
                      {mat.matched ? (
                        <p className="text-xs text-green-600">
                          ${mat.extended_price.toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-xs text-orange-600">Price TBD</p>
                      )}
                    </div>
                  </div>
                ))}
                {group.materials.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    + {group.materials.length - 5} more items
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generate Button */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          onClick={generatePurchaseOrders}
          disabled={selectedVendors.size === 0}
          size="lg"
          className="gap-2"
        >
          <Download className="w-5 h-5" />
          Generate {selectedVendors.size} Purchase Order{selectedVendors.size !== 1 ? 's' : ''}
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Order Preview - {previewVendor?.vendor}</DialogTitle>
          </DialogHeader>
          
          {previewVendor && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded">
                <p className="font-semibold">Job: {job.name}</p>
                <p className="text-sm">Job #: {job.job_number || 'N/A'}</p>
                <p className="text-sm">Client: {job.client_name}</p>
                <p className="text-sm">Date: {new Date().toLocaleDateString()}</p>
              </div>

              <div className="border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Item</th>
                      <th className="text-center p-2">Qty</th>
                      <th className="text-center p-2">Length</th>
                      <th className="text-center p-2">Color</th>
                      <th className="text-right p-2">Unit Price</th>
                      <th className="text-right p-2">Extended</th>
                      <th className="text-center p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewVendor.materials.map(mat => (
                      <tr key={mat.id} className="border-t">
                        <td className="p-2">
                          <p className="font-medium">{mat.name}</p>
                          {mat.use_case && (
                            <p className="text-xs text-muted-foreground">{mat.use_case}</p>
                          )}
                        </td>
                        <td className="text-center p-2">{mat.quantity}</td>
                        <td className="text-center p-2">{mat.length || '-'}</td>
                        <td className="text-center p-2">{mat.color || '-'}</td>
                        <td className="text-right p-2">
                          {mat.catalog_price ? `$${mat.catalog_price.toFixed(2)}` : 'TBD'}
                        </td>
                        <td className="text-right p-2 font-semibold">
                          {mat.catalog_price ? `$${mat.extended_price.toFixed(2)}` : 'TBD'}
                        </td>
                        <td className="text-center p-2">
                          {mat.matched ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-orange-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-bold bg-muted">
                      <td colSpan={5} className="text-right p-2">TOTAL:</td>
                      <td className="text-right p-2">
                        ${previewVendor.total.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
            <Button onClick={() => {
              if (previewVendor) {
                generateVendorPO(previewVendor);
                toast.success('Purchase order downloaded');
              }
            }}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
