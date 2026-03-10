import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  ShoppingCart, Loader2, CheckCircle2, ExternalLink, Package,
} from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
  sku?: string | null;
}

interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
}

export interface LumberPORecord {
  id: string;
  material_id: string;
  vendor_id: string | null;
  quantity: number;
  price_per_unit: number;
  unit: string | null;
  notes: string | null;
  order_date: string;
  status: 'ordered' | 'received' | 'cancelled';
  zoho_po_id: string | null;
  zoho_po_number: string | null;
  zoho_po_url: string | null;
  created_at: string;
  vendor?: Vendor;
  material?: Material;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: Material;
  vendor: Vendor;
  /** Pre-filled cost price from this week's best price */
  defaultPrice: number;
  onCreated: (po: LumberPORecord) => void;
}

export function LumberPurchaseOrderDialog({
  open, onOpenChange, material, vendor, defaultPrice, onCreated,
}: Props) {
  const { profile } = useAuth();
  const [quantity, setQuantity] = useState('1');
  const [pricePerUnit, setPricePerUnit] = useState(defaultPrice.toFixed(2));
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [createInZoho, setCreateInZoho] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdPO, setCreatedPO] = useState<{ zoho_po_number?: string; zoho_po_url?: string } | null>(null);

  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(pricePerUnit) || 0;
  const total = qty * price;

  async function handleCreate() {
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return; }
    if (price <= 0) { toast.error('Price must be greater than 0'); return; }

    setCreating(true);
    try {
      let zoho_po_id: string | null = null;
      let zoho_po_number: string | null = null;
      let zoho_po_url: string | null = null;

      // --- Optionally create in Zoho Books ---
      if (createInZoho) {
        const { data: zohoData, error: zohoError } = await supabase.functions.invoke('zoho-sync', {
          body: {
            action: 'create_orders',
            jobName: `Lumber Restock – ${material.name}`,
            materialItems: [{
              id: `lumber-${material.id}`,
              material_name: material.name,
              quantity: qty,
              sku: material.sku || undefined,
              category: material.category,
              cost_per_unit: price,
              price_per_unit: price * 1.15,
              length: `${material.standard_length}'`,
            }],
            materialItemIds: [],
            userId: profile?.id,
            notes: notes || undefined,
            orderType: 'purchase_order',
            vendorName: vendor.name,
          },
        });

        if (zohoError) {
          let msg = zohoError.message;
          if (zohoError instanceof FunctionsHttpError) {
            try { msg = `[${zohoError.context?.status}] ${await zohoError.context?.text()}`; } catch { /* ignore */ }
          }
          // Non-fatal: warn but still save locally
          toast.warning(`Zoho PO creation failed: ${msg}. Saving locally only.`);
        } else if (zohoData?.purchaseOrder) {
          zoho_po_id = zohoData.purchaseOrder.id ?? null;
          zoho_po_number = zohoData.purchaseOrder.number ?? null;
          zoho_po_url = zohoData.purchaseOrder.url ?? null;
        }
      }

      // --- Always save to lumber_purchase_orders ---
      const { data: insertedRow, error: dbError } = await supabase
        .from('lumber_purchase_orders')
        .insert({
          material_id: material.id,
          vendor_id: vendor.id,
          quantity: qty,
          price_per_unit: price,
          unit: material.unit,
          notes: notes || null,
          order_date: orderDate,
          status: 'ordered',
          zoho_po_id,
          zoho_po_number,
          zoho_po_url,
          created_by: profile?.id ?? null,
        })
        .select('*')
        .single();

      if (dbError) throw dbError;

      // Attach vendor/material locally (avoids schema-cache join issues)
      const fullRecord: LumberPORecord = {
        ...insertedRow,
        vendor,
        material,
      };

      setCreatedPO({ zoho_po_number: zoho_po_number ?? undefined, zoho_po_url: zoho_po_url ?? undefined });
      onCreated(fullRecord);
      toast.success(
        zoho_po_number
          ? `PO #${zoho_po_number} created in Zoho Books`
          : 'Purchase order saved',
      );
    } catch (err: any) {
      console.error('Error creating lumber PO:', err);
      toast.error(`Failed to create purchase order: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  function handleClose() {
    setCreatedPO(null);
    setQuantity('1');
    setPricePerUnit(defaultPrice.toFixed(2));
    setNotes('');
    setCreateInZoho(true);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-600" />
            {createdPO ? 'Purchase Order Created' : 'Create Purchase Order'}
          </DialogTitle>
          <DialogDescription>
            {createdPO
              ? 'The purchase order has been recorded.'
              : `Order ${material.name} from ${vendor.name}`}
          </DialogDescription>
        </DialogHeader>

        {!createdPO ? (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex items-start gap-3">
              <Package className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-orange-900">{material.name}</p>
                <p className="text-sm text-orange-700">Vendor: {vendor.name}</p>
                {material.sku && (
                  <Badge variant="outline" className="mt-1 text-xs">SKU: {material.sku}</Badge>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity ({material.unit}s)</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>Price / {material.unit} ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                />
              </div>
              <div>
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-lg bg-slate-50 border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Order Total</p>
                  <p className="text-xl font-bold text-orange-700">
                    ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery instructions, color, grade notes…"
              />
            </div>

            {/* Zoho toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createInZoho}
                onChange={(e) => setCreateInZoho(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm font-medium">Create Purchase Order in Zoho Books</span>
            </label>

            <div className="flex gap-3 pt-2 border-t">
              <Button
                className="flex-1 bg-orange-600 hover:bg-orange-700"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
                ) : (
                  <><ShoppingCart className="w-4 h-4 mr-2" />Create PO</>
                )}
              </Button>
              <Button variant="outline" onClick={handleClose} disabled={creating}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 border-2 border-green-300 p-6 text-center">
              <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-3" />
              <p className="text-lg font-bold text-green-900">
                {createdPO.zoho_po_number
                  ? `PO #${createdPO.zoho_po_number} created!`
                  : 'Purchase order saved'}
              </p>
              <p className="text-sm text-green-700 mt-1">
                {material.name} · {qty} {material.unit}s @ ${price.toFixed(2)}
              </p>
            </div>

            {createdPO.zoho_po_url && (
              <Button
                variant="outline"
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => window.open(createdPO.zoho_po_url!, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View in Zoho Books
              </Button>
            )}

            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleClose}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
