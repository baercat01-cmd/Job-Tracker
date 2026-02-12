import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  Truck,
  Palette,
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
    logo_url: string | null;
  };
}

// Color options for shipment groups (3 colors only)
const SHIPMENT_COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 border-blue-400 text-blue-900' },
  { value: 'green', label: 'Green', class: 'bg-green-100 border-green-400 text-green-900' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-100 border-orange-400 text-orange-900' },
];

// Helper function to calculate board feet from material name and length (LUMBER ONLY)
function calculateBoardFeet(materialName: string, length: number): number {
  const match = materialName.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return 1;
  
  const thickness = parseInt(match[1]);
  const width = parseInt(match[2]);
  
  const boardFeet = (thickness * width * length) / 12;
  return boardFeet;
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
  const [prices, setPrices] = useState<Record<string, { mbfPrice: string; pricePerPiece: string; unitType: string; unitValue: string; notes: string; shipmentColor: string }>>({});
  const [generalNotes, setGeneralNotes] = useState('');

  const isLumber = vendorLink?.category === 'lumber';
  const isRebar = vendorLink?.category === 'rebar';

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

      const { data: linkData, error: linkError } = await supabase
        .from('lumber_rebar_vendor_links')
        .select(`
          *,
          vendor:lumber_rebar_vendors(name, contact_name, logo_url)
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

      if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
        toast.error('This link has expired');
        setLoading(false);
        return;
      }

      setVendorLink(linkData);

      const { data: materialsData, error: materialsError } = await supabase
        .from('lumber_rebar_materials')
        .select('*')
        .eq('active', true)
        .eq('category', linkData.category)
        .order('order_index');

      if (materialsError) throw materialsError;
      setMaterials(materialsData || []);

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

  function updatePrice(materialId: string, field: 'mbfPrice' | 'pricePerPiece' | 'unitType' | 'unitValue' | 'notes' | 'shipmentColor', value: string) {
    setPrices(prev => {
      const updated = {
        ...prev[materialId],
        [field]: value,
      };

      // LUMBER ONLY: If MBF price is updated, calculate price per piece
      if (field === 'mbfPrice' && value && isLumber) {
        const material = materials.find(m => m.id === materialId);
        if (material && material.unit === 'board foot') {
          const boardFeet = calculateBoardFeet(material.name, material.standard_length);
          const pricePerBF = parseFloat(value) / 1000;
          const pricePerPiece = pricePerBF * boardFeet;
          updated.pricePerPiece = pricePerPiece.toFixed(2);
        }
      }

      return {
        ...prev,
        [materialId]: updated,
      };
    });
  }

  async function submitPrices() {
    if (!vendorLink) return;

    const pricedMaterials = Object.entries(prices).filter(([_, data]) => {
      return (data.mbfPrice && parseFloat(data.mbfPrice) > 0) || 
             (data.pricePerPiece && parseFloat(data.pricePerPiece) > 0);
    });

    if (pricedMaterials.length === 0) {
      toast.error('Please enter at least one price');
      return;
    }

    // Group materials by shipment color
    const colorGroups: Record<string, string[]> = {};
    pricedMaterials.forEach(([materialId, data]) => {
      if (data.shipmentColor) {
        if (!colorGroups[data.shipmentColor]) {
          colorGroups[data.shipmentColor] = [];
        }
        colorGroups[data.shipmentColor].push(materialId);
      }
    });

    // Generate unique shipment group IDs for each color
    const colorToGroupId: Record<string, string> = {};
    Object.keys(colorGroups).forEach(color => {
      colorToGroupId[color] = crypto.randomUUID();
    });

    const pricesToSubmit = pricedMaterials.map(([materialId, data]) => {
      const material = materials.find(m => m.id === materialId);
      
      let pricePerUnit: number;
      let mbfPrice: number | null = null;
      
      if (isLumber && material?.unit === 'board foot' && data.mbfPrice) {
        pricePerUnit = parseFloat(data.pricePerPiece);
        mbfPrice = parseFloat(data.mbfPrice);
      } else {
        pricePerUnit = parseFloat(data.pricePerPiece || data.mbfPrice);
      }

      let truckloadQty = null;
      if (data.unitType === 'per_piece') {
        truckloadQty = null;
      } else if (data.unitType === 'unit' && data.unitValue) {
        truckloadQty = parseInt(data.unitValue);
      }
      
      const shipmentGroupId = data.shipmentColor ? colorToGroupId[data.shipmentColor] : null;
      
      return {
        material_id: materialId,
        vendor_id: vendorLink.vendor_id,
        price_per_unit: pricePerUnit,
        mbf_price: mbfPrice,
        truckload_quantity: truckloadQty,
        shipment_group_id: shipmentGroupId,
        shipment_group_color: data.shipmentColor || null,
        effective_date: effectiveDate,
        notes: data.notes || null,
        created_by: null,
      };
    });

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('lumber_rebar_prices')
        .insert(pricesToSubmit);

      if (error) throw error;

      const colorGroupCount = Object.keys(colorGroups).length;
      if (colorGroupCount > 0) {
        toast.success(`Successfully submitted ${pricesToSubmit.length} prices with ${colorGroupCount} shipment groups!`);
      } else {
        toast.success(`Successfully submitted ${pricesToSubmit.length} prices!`);
      }
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

  const pricedCount = Object.values(prices).filter(p => 
    (p.mbfPrice && parseFloat(p.mbfPrice) > 0) || 
    (p.pricePerPiece && parseFloat(p.pricePerPiece) > 0)
  ).length;

  const colorGroups = Object.values(prices).reduce((acc, p) => {
    if (p.shipmentColor) acc.add(p.shipmentColor);
    return acc;
  }, new Set<string>());

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card className="border-blue-200 bg-white shadow-lg">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {vendorLink.vendor?.logo_url && (
                  <img 
                    src={vendorLink.vendor.logo_url} 
                    alt={vendorLink.vendor.name} 
                    className="h-16 w-auto"
                  />
                )}
                <div>
                  <CardTitle className="text-2xl mb-2">
                    Vendor Pricing Submission
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {vendorLink.vendor?.name} - {isLumber ? 'Lumber' : 'Rebar'} Pricing
                  </p>
                </div>
              </div>
              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                {materials.length} Materials
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Effective Date & Color Legend */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 flex-wrap justify-between">
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
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  {pricedCount} of {materials.length} priced
                </p>
                {colorGroups.size > 0 && (
                  <Badge className="bg-green-100 text-green-800 border-green-300 flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    {colorGroups.size} shipment {colorGroups.size === 1 ? 'group' : 'groups'}
                  </Badge>
                )}
              </div>
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
            <p className="text-sm text-muted-foreground">
              {isLumber && 'Enter price per MBF (thousand board feet) - price per piece will be calculated automatically. '}
              {isRebar && 'Enter price per piece for each rebar material. '}
              Select a color to group materials that can be shipped together.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr className="border-b-2">
                    <th className="text-center p-3 font-semibold w-32">
                      <div className="flex items-center justify-center gap-1">
                        <Truck className="w-4 h-4" />
                        <span className="text-xs">Ship Together</span>
                      </div>
                    </th>
                    <th className="text-left p-3 font-semibold">Material</th>
                    {isLumber && (
                      <>
                        <th className="text-center p-3 font-semibold w-24">Length</th>
                        <th className="text-center p-3 font-semibold w-24">Board Feet</th>
                        <th className="text-left p-3 font-semibold w-32">Price/MBF ($)</th>
                      </>
                    )}
                    <th className="text-left p-3 font-semibold w-32">Price/Piece ($)</th>
                    <th className="text-left p-3 font-semibold w-48">Pricing Unit</th>
                    <th className="text-left p-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materials.map((material, idx) => {
                    const priceData = prices[material.id] || { mbfPrice: '', pricePerPiece: '', unitType: 'unit', unitValue: '1', notes: '', shipmentColor: '' };
                    const isEven = idx % 2 === 0;
                    const boardFeet = isLumber && material.unit === 'board foot' 
                      ? calculateBoardFeet(material.name, material.standard_length)
                      : null;
                    const hasPricing = (priceData.mbfPrice && parseFloat(priceData.mbfPrice) > 0) || 
                                      (priceData.pricePerPiece && parseFloat(priceData.pricePerPiece) > 0);
                    const selectedColorClass = SHIPMENT_COLORS.find(c => c.value === priceData.shipmentColor)?.class || '';

                    return (
                      <tr key={material.id} className={`hover:bg-blue-50 ${isEven ? 'bg-white' : 'bg-slate-50'} ${priceData.shipmentColor ? `border-l-4 ${selectedColorClass}` : ''}`}>
                        <td className="p-3">
                          <Select
                            value={priceData.shipmentColor || 'none'}
                            onValueChange={(value) => updatePrice(material.id, 'shipmentColor', value === 'none' ? '' : value)}
                            disabled={!hasPricing}
                          >
                            <SelectTrigger className={`w-full ${priceData.shipmentColor ? selectedColorClass : ''}`}>
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {SHIPMENT_COLORS.map(color => (
                                <SelectItem key={color.value} value={color.value}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded border-2 ${color.class}`} />
                                    {color.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{material.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Unit: {material.unit}
                          </div>
                        </td>
                        {isLumber && (
                          <>
                            <td className="p-3 text-center font-semibold text-blue-700">
                              {material.standard_length}'
                            </td>
                            <td className="p-3 text-center font-semibold text-slate-700">
                              {boardFeet ? `${boardFeet.toFixed(2)} BF` : '-'}
                            </td>
                            <td className="p-3">
                              {boardFeet ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={priceData.mbfPrice}
                                  onChange={(e) => updatePrice(material.id, 'mbfPrice', e.target.value)}
                                  placeholder="715"
                                  className="w-full"
                                />
                              ) : (
                                <div className="text-sm text-muted-foreground text-center">-</div>
                              )}
                            </td>
                          </>
                        )}
                        <td className="p-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={priceData.pricePerPiece}
                            onChange={(e) => updatePrice(material.id, 'pricePerPiece', e.target.value)}
                            placeholder="0.00"
                            className={`w-full ${isLumber && boardFeet && priceData.mbfPrice ? 'bg-green-50 font-semibold' : ''}`}
                            readOnly={isLumber && !!(boardFeet && priceData.mbfPrice)}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
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
                            <Select
                              value={priceData.unitType || 'unit'}
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

        {/* Shipment Color Groups Info */}
        {colorGroups.size > 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Truck className="w-5 h-5 text-green-700 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 mb-2">Shipment Color Groups</h3>
                  <p className="text-sm text-green-800 mb-3">
                    You've created {colorGroups.size} shipment {colorGroups.size === 1 ? 'group' : 'groups'}. Materials with the same color can be shipped together in one delivery.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(colorGroups).map(color => {
                      const colorConfig = SHIPMENT_COLORS.find(c => c.value === color);
                      const count = Object.values(prices).filter(p => p.shipmentColor === color).length;
                      return (
                        <Badge key={color} className={colorConfig?.class}>
                          {colorConfig?.label}: {count} {count === 1 ? 'material' : 'materials'}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Optional Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Notes (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Any additional comments, special instructions, or notes about your pricing..."
              className="min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-lg mb-1">
                  Ready to submit {pricedCount} prices?
                </p>
                <p className="text-sm text-muted-foreground">
                  Your pricing will be sent immediately and the team will be notified
                </p>
              </div>
              <Button
                onClick={submitPrices}
                disabled={submitting || pricedCount === 0}
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
