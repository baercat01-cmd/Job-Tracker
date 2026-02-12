import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  CheckCircle,
  Package,
  DollarSign,
  Calendar,
  Send,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
}

interface VendorLink {
  id: string;
  vendor_id: string;
  category: string;
  expires_at: string | null;
  vendor?: {
    name: string;
    contact_name: string | null;
  };
}

export function VendorPricingForm() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [vendorLink, setVendorLink] = useState<VendorLink | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [prices, setPrices] = useState<Record<string, { price: string; unitType: string; unitValue: string; notes: string }>>({});

  useEffect(() => {
    loadVendorLink();
  }, [token]);

  async function loadVendorLink() {
    if (!token) {
      toast.error('Invalid link');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Load vendor link (public access)
      const { data: linkData, error: linkError } = await supabase
        .from('lumber_rebar_vendor_links')
        .select(`
          *,
          vendor:lumber_rebar_vendors(name, contact_name)
        `)
        .eq('token', token)
        .eq('is_active', true)
        .maybeSingle();

      if (linkError) throw linkError;

      if (!linkData) {
        toast.error('This link is invalid or has expired');
        setLoading(false);
        return;
      }

      // Check expiration
      if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
        toast.error('This link has expired');
        setLoading(false);
        return;
      }

      setVendorLink(linkData);

      // Load materials for this category
      const { data: materialsData, error: materialsError } = await supabase
        .from('lumber_rebar_materials')
        .select('*')
        .eq('active', true)
        .eq('category', linkData.category)
        .order('order_index');

      if (materialsError) throw materialsError;
      setMaterials(materialsData || []);

      // Update last_used_at
      await supabase
        .from('lumber_rebar_vendor_links')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', linkData.id);

    } catch (error: any) {
      console.error('Error loading vendor link:', error);
      toast.error('Failed to load pricing form');
    } finally {
      setLoading(false);
    }
  }

  function updatePrice(materialId: string, field: 'price' | 'unitType' | 'unitValue' | 'notes', value: string) {
    setPrices(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [field]: value,
      }
    }));
  }

  async function submitPrices() {
    if (!vendorLink) return;

    const pricesToSubmit = Object.entries(prices)
      .filter(([_, data]) => data.price && parseFloat(data.price) > 0)
      .map(([materialId, data]) => {
        // Build truckload quantity from unit type and value
        let truckloadQty = null;
        if (data.unitType === 'per_piece') {
          truckloadQty = null; // Per piece doesn't need truckload
        } else if (data.unitType === 'unit' && data.unitValue) {
          truckloadQty = parseInt(data.unitValue);
        }
        
        return {
          material_id: materialId,
          vendor_id: vendorLink.vendor_id,
          price_per_unit: parseFloat(data.price),
          truckload_quantity: truckloadQty,
          effective_date: effectiveDate,
          notes: data.notes || null,
          created_by: null, // Vendor submission
        };
      });

    if (pricesToSubmit.length === 0) {
      toast.error('Please enter at least one price');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('lumber_rebar_prices')
        .insert(pricesToSubmit);

      if (error) throw error;

      toast.success(`Successfully submitted ${pricesToSubmit.length} prices!`);
      setSubmitted(true);
    } catch (error: any) {
      console.error('Error submitting prices:', error);
      toast.error('Failed to submit prices. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin" />
            <p className="text-muted-foreground">Loading pricing form...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vendorLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">Invalid Link</h2>
            <p className="text-muted-foreground">
              This pricing link is invalid or has expired. Please contact the sender for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-green-200">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h2 className="text-xl font-bold mb-2">Prices Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for submitting your pricing. The team has been notified and will review your prices.
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Submit More Prices
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-blue-200 bg-white shadow-lg">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <img 
                  src="/tri-state-logo.png" 
                  alt="Tri-State Forest Products" 
                  className="h-16 w-auto"
                />
                <div>
                  <CardTitle className="text-2xl mb-2">
                    Vendor Pricing Submission
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {vendorLink.vendor?.name} - {vendorLink.category === 'lumber' ? 'Lumber' : 'Rebar'} Pricing
                  </p>
                </div>
              </div>
              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                {materials.length} Materials
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Effective Date */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label className="font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Effective Date:
              </Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-48"
              />
              <p className="text-sm text-muted-foreground ml-auto">
                {Object.values(prices).filter(p => p.price && parseFloat(p.price) > 0).length} of {materials.length} priced
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Materials Pricing Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Enter Your Prices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr className="border-b-2">
                    <th className="text-left p-3 font-semibold">Material</th>
                    <th className="text-center p-3 font-semibold w-24">Length</th>
                    <th className="text-left p-3 font-semibold w-40">Price per {materials[0]?.unit || 'Unit'} ($)</th>
                    <th className="text-left p-3 font-semibold w-48">Pricing Unit</th>
                    <th className="text-left p-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materials.map((material, idx) => {
                    const priceData = prices[material.id] || { price: '', unitType: 'per_piece', unitValue: '', notes: '' };
                    const isEven = idx % 2 === 0;

                    return (
                      <tr key={material.id} className={`hover:bg-blue-50 ${isEven ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="p-3">
                          <div className="font-medium">{material.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Unit: {material.unit}
                          </div>
                        </td>
                        <td className="p-3 text-center font-semibold text-blue-700">
                          {material.standard_length}'
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={priceData.price}
                            onChange={(e) => updatePrice(material.id, 'price', e.target.value)}
                            placeholder="0.00"
                            className="w-full"
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Select
                              value={priceData.unitType || 'per_piece'}
                              onValueChange={(value) => updatePrice(material.id, 'unitType', value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_piece">Per Piece</SelectItem>
                                <SelectItem value="unit">Unit</SelectItem>
                              </SelectContent>
                            </Select>
                            {priceData.unitType === 'unit' && (
                              <Input
                                type="number"
                                min="0"
                                value={priceData.unitValue}
                                onChange={(e) => updatePrice(material.id, 'unitValue', e.target.value)}
                                placeholder="Qty"
                                className="w-24"
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Input
                            value={priceData.notes}
                            onChange={(e) => updatePrice(material.id, 'notes', e.target.value)}
                            placeholder="Optional notes..."
                            className="w-full"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg mb-1">
                  Ready to submit {Object.values(prices).filter(p => p.price && parseFloat(p.price) > 0).length} prices?
                </p>
                <p className="text-sm text-muted-foreground">
                  Your pricing will be sent immediately and the team will be notified
                </p>
              </div>
              <Button
                onClick={submitPrices}
                disabled={submitting || Object.values(prices).filter(p => p.price && parseFloat(p.price) > 0).length === 0}
                size="lg"
                className="bg-green-600 hover:bg-green-700 px-8"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Prices
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer - Contact Information */}
        <Card className="border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-center mb-4 text-lg">Questions or Need Help?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              <div className="bg-slate-50 p-4 rounded-lg border text-center">
                <p className="font-semibold text-lg mb-1">Cody Martin</p>
                <a href="tel:5745362582" className="text-blue-600 hover:underline flex items-center justify-center gap-2">
                  <span>📞</span>
                  <span>(574) 536-2582</span>
                </a>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border text-center">
                <p className="font-semibold text-lg mb-1">Zac Oakley</p>
                <a href="tel:5743544029" className="text-blue-600 hover:underline flex items-center justify-center gap-2">
                  <span>📞</span>
                  <span>(574) 354-4029</span>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
