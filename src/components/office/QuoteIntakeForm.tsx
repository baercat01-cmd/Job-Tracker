
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Send, Briefcase, CheckCircle } from 'lucide-react';
import { FloorPlanBuilder } from './FloorPlanBuilder';
import { useAuth } from '@/hooks/useAuth';

interface QuoteIntakeFormProps {
  quoteId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface QuoteData {
  // Customer info
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  project_name: string;
  
  // Building dimensions
  width: number;
  length: number;
  eave: number;
  pitch: string;
  truss: string;
  
  // Foundation & Floor
  foundation_type: string;
  floor_type: string;
  soffit_type: string;
  
  // Structure & Design
  snow_load: number;
  wind_load: number;
  building_use: string;
  
  // Exterior Colors
  roof_material: string;
  roof_color: string;
  trim_color: string;
  wainscot_enabled: boolean;
  
  // Overhang
  overhang_same_all: boolean;
  overhang_front: number;
  overhang_back: number;
  overhang_left: number;
  overhang_right: number;
  
  // Insulation
  insulation_type: string;
  
  // Special Features
  has_loft: boolean;
  has_porch: boolean;
  
  // Utilities
  has_plumbing: boolean;
  has_electrical: boolean;
  has_hvac: boolean;
  
  // Notes
  site_notes: string;
  structural_notes: string;
  
  // Status and price
  status: string;
  estimated_price: number | null;
}

export function QuoteIntakeForm({ quoteId, onSuccess, onCancel }: QuoteIntakeFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingQuote, setExistingQuote] = useState<any>(null);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | undefined>(quoteId);
  
  const [formData, setFormData] = useState<QuoteData>({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    project_name: '',
    width: 30,
    length: 40,
    eave: 10,
    pitch: '4/12',
    truss: '', // Added missing comma here
    foundation_type: '',
    floor_type: '',
    soffit_type: '',
    snow_load: 0,
    wind_load: 0,
    building_use: '',
    roof_material: '',
    roof_color: '',
    trim_color: '',
    wainscot_enabled: false,
    overhang_same_all: true,
    overhang_front: 12,
    overhang_back: 12,
    overhang_left: 12,
    overhang_right: 12,
    insulation_type: '',
    has_loft: false,
    has_porch: false,
    has_plumbing: false,
    has_electrical: false,
    has_hvac: false,
    site_notes: '',
    structural_notes: '',
    status: 'draft',
    estimated_price: null,
  });

  useEffect(() => {
    if (quoteId) {
      setCurrentQuoteId(quoteId);
      loadQuote();
    }
  }, [quoteId]);

  async function loadQuote() {
    if (!quoteId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (error) throw error;

      setExistingQuote(data);
      setFormData({
        customer_name: data.customer_name || '',
        customer_email: data.customer_email || '',
        customer_phone: data.customer_phone || '',
        customer_address: data.customer_address || '',
        project_name: data.project_name || '',
        width: data.width || 30,
        length: data.length || 40,
        eave: data.eave || 10,
        pitch: data.pitch || '4/12',
        truss: data.truss || '',
        foundation_type: data.foundation_type || '',
        floor_type: data.floor_type || '',
        soffit_type: data.soffit_type || '',
        snow_load: data.snow_load || 0,
        wind_load: data.wind_load || 0,
        building_use: data.building_use || '',
        roof_material: data.roof_material || '',
        roof_color: data.roof_color || '',
        trim_color: data.trim_color || '',
        wainscot_enabled: data.wainscot_enabled || false,
        overhang_same_all: data.overhang_same_all !== false,
        overhang_front: data.overhang_front || 12,
        overhang_back: data.overhang_back || 12,
        overhang_left: data.overhang_left || 12,
        overhang_right: data.overhang_right || 12,
        insulation_type: data.insulation_type || '',
        has_loft: data.has_loft || false,
        has_porch: data.has_porch || false,
        has_plumbing: data.has_plumbing || false,
        has_electrical: data.has_electrical || false,
        has_hvac: data.has_hvac || false,
        site_notes: data.site_notes || '',
        structural_notes: data.structural_notes || '',
        status: data.status || 'draft',
        estimated_price: data.estimated_price,
      });
    } catch (error: any) {
      console.error('Error loading quote:', error);
      toast.error('Failed to load quote');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDraft() {
    await saveQuote('draft');
  }

  async function handleSubmit() {
    await saveQuote('submitted');
  }

  async function saveQuote(status: string) {
    // Validate required numeric fields
    const width = Number(formData.width);
    const length = Number(formData.length);
    
    if (isNaN(width) || width <= 0) {
      toast.error('Please enter a valid building width (must be greater than 0)');
      return;
    }
    
    if (isNaN(length) || length <= 0) {
      toast.error('Please enter a valid building length (must be greater than 0)');
      return;
    }

    setSaving(true);

    try {
      // Helper function to convert empty strings to null
      const cleanString = (value: string | undefined | null): string | null => {
        if (value === null || value === undefined) return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      };

      // Helper for optional numbers - returns null for 0 or invalid values
      const cleanOptionalNumber = (value: number | string | null | undefined): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        return !isNaN(num) && num > 0 ? num : null;
      };

      // Build the quote data object - only include fields with values
      const quoteData: any = {
        // Required fields
        width: width,
        length: length,
        status,
      };

      // Add optional string fields only if they have values
      if (cleanString(formData.customer_name)) quoteData.customer_name = cleanString(formData.customer_name);
      if (cleanString(formData.customer_email)) quoteData.customer_email = cleanString(formData.customer_email);
      if (cleanString(formData.customer_phone)) quoteData.customer_phone = cleanString(formData.customer_phone);
      if (cleanString(formData.customer_address)) quoteData.customer_address = cleanString(formData.customer_address);
      if (cleanString(formData.project_name)) quoteData.project_name = cleanString(formData.project_name);
      if (cleanString(formData.pitch)) quoteData.pitch = cleanString(formData.pitch);
      if (cleanString(formData.truss)) quoteData.truss = cleanString(formData.truss);
      if (cleanString(formData.foundation_type)) quoteData.foundation_type = cleanString(formData.foundation_type);
      if (cleanString(formData.floor_type)) quoteData.floor_type = cleanString(formData.floor_type);
      if (cleanString(formData.soffit_type)) quoteData.soffit_type = cleanString(formData.soffit_type);
      if (cleanString(formData.building_use)) quoteData.building_use = cleanString(formData.building_use);
      if (cleanString(formData.roof_material)) quoteData.roof_material = cleanString(formData.roof_material);
      if (cleanString(formData.roof_color)) quoteData.roof_color = cleanString(formData.roof_color);
      if (cleanString(formData.trim_color)) quoteData.trim_color = cleanString(formData.trim_color);
      if (cleanString(formData.insulation_type)) quoteData.insulation_type = cleanString(formData.insulation_type);
      if (cleanString(formData.site_notes)) quoteData.site_notes = cleanString(formData.site_notes);
      if (cleanString(formData.structural_notes)) quoteData.structural_notes = cleanString(formData.structural_notes);

      // Add optional number fields only if they have values
      if (cleanOptionalNumber(formData.eave)) quoteData.eave = cleanOptionalNumber(formData.eave);
      if (cleanOptionalNumber(formData.snow_load)) quoteData.snow_load = cleanOptionalNumber(formData.snow_load);
      if (cleanOptionalNumber(formData.wind_load)) quoteData.wind_load = cleanOptionalNumber(formData.wind_load);
      if (cleanOptionalNumber(formData.overhang_front)) quoteData.overhang_front = cleanOptionalNumber(formData.overhang_front);
      if (cleanOptionalNumber(formData.overhang_back)) quoteData.overhang_back = cleanOptionalNumber(formData.overhang_back);
      if (cleanOptionalNumber(formData.overhang_left)) quoteData.overhang_left = cleanOptionalNumber(formData.overhang_left);
      if (cleanOptionalNumber(formData.overhang_right)) quoteData.overhang_right = cleanOptionalNumber(formData.overhang_right);
      if (cleanOptionalNumber(formData.estimated_price)) quoteData.estimated_price = cleanOptionalNumber(formData.estimated_price);

      // Add boolean fields
      quoteData.wainscot_enabled = formData.wainscot_enabled;
      quoteData.overhang_same_all = formData.overhang_same_all;
      quoteData.has_loft = formData.has_loft;
      quoteData.has_porch = formData.has_porch;
      quoteData.has_plumbing = formData.has_plumbing;
      quoteData.has_electrical = formData.has_electrical;
      quoteData.has_hvac = formData.has_hvac;

      // Add metadata
      if (profile?.id) quoteData.created_by = profile.id;
      if (status === 'submitted' && !existingQuote?.submitted_at) {
        quoteData.submitted_at = new Date().toISOString();
      }

      console.log('Saving quote with data:', quoteData);

      if (currentQuoteId) {
        // Update existing quote
        quoteData.updated_at = new Date().toISOString();
        const { error } = await supabase
          .from('quotes')
          .update(quoteData)
          .eq('id', currentQuoteId);

        if (error) {
          console.error('Error updating quote:', error);
          console.error('Error code:', error.code);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
          toast.error(`Failed to update quote: ${error.message}`);
          return;
        }
        toast.success(status === 'draft' ? 'Draft saved successfully' : 'Quote updated successfully');
        onSuccess();
      } else {
        // Create new quote
        const { data, error } = await supabase
          .from('quotes')
          .insert(quoteData)
          .select()
          .single();

        if (error) {
          console.error('Error creating quote:', error);
          console.error('Error code:', error.code);
          console.error('Error details:', error.details);
          console.error('Error hint:', error.hint);
          console.error('Quote data that failed:', quoteData);
          toast.error(`Failed to create quote: ${error.message}${error.hint ? ' - ' + error.hint : ''}`);
          return;
        }

        // Generate quote number
        const quoteNumber = `Q${new Date().getFullYear()}-${String(data.id).slice(0, 6).toUpperCase()}`;
        const { error: updateError } = await supabase
          .from('quotes')
          .update({ quote_number: quoteNumber })
          .eq('id', data.id);

        if (updateError) {
          console.error('Error updating quote number:', updateError);
        }

        // Update the current quote ID so subsequent saves update instead of creating new
        setCurrentQuoteId(data.id);
        setExistingQuote(data);
        
        toast.success(status === 'draft' ? `Draft saved successfully - Quote #${quoteNumber}` : 'Quote created successfully');
      }
    } catch (error: any) {
      console.error('Error saving quote (catch block):', error);
      toast.error(`Failed to save quote: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertToJob() {
    if (!quoteId) return;

    try {
      setSaving(true);

      // Create job from quote
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert({
          name: formData.project_name,
          client_name: formData.customer_name,
          address: formData.customer_address || '',
          description: `Building: ${formData.width}' × ${formData.length}'\n${formData.site_notes || ''}`,
          status: 'active',
          created_by: profile?.id,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Update quote with job reference
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({
          status: 'won',
          job_id: jobData.id,
          converted_at: new Date().toISOString(),
        })
        .eq('id', quoteId);

      if (quoteError) throw quoteError;

      toast.success('Quote converted to active job!');
      onSuccess();
    } catch (error: any) {
      console.error('Error converting quote:', error);
      toast.error('Failed to convert quote to job');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading quote...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center justify-between sticky top-0 bg-background z-10 py-2 border-b">
        <div className="text-sm text-muted-foreground">
          {existingQuote?.status && (
            <span className="capitalize">{existingQuote.status} Quote</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            Save Draft
          </Button>
          {formData.status === 'draft' && (
            <Button onClick={handleSubmit} disabled={saving}>
              <Send className="w-4 h-4 mr-2" />
              Submit for Estimating
            </Button>
          )}
          {existingQuote && existingQuote.status === 'estimated' && !existingQuote.job_id && (
            <Button onClick={handleConvertToJob} disabled={saving} className="bg-green-600 hover:bg-green-700">
              <Briefcase className="w-4 h-4 mr-2" />
              Convert to Job
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Form Fields */}
        <div className="space-y-6">
          {/* Project Info */}
          <Card>
            <CardHeader>
              <CardTitle>Project Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Project Name *</Label>
                  <Input
                    value={formData.project_name}
                    onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                    placeholder="Enter project name"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Customer Name *</Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Enter customer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={formData.customer_address}
                    onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                    placeholder="Enter site address"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Building Dimensions */}
          <Card>
            <CardHeader>
              <CardTitle>Building Dimensions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Width (ft)</Label>
                  <Input
                    type="number"
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Length (ft)</Label>
                  <Input
                    type="number"
                    value={formData.length}
                    onChange={(e) => setFormData({ ...formData, length: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eave (ft)</Label>
                  <Input
                    type="number"
                    value={formData.eave}
                    onChange={(e) => setFormData({ ...formData, eave: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pitch</Label>
                  <Select value={formData.pitch} onValueChange={(value) => setFormData({ ...formData, pitch: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select pitch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3/12">3/12</SelectItem>
                      <SelectItem value="4/12">4/12</SelectItem>
                      <SelectItem value="5/12">5/12</SelectItem>
                      <SelectItem value="6/12">6/12</SelectItem>
                      <SelectItem value="7/12">7/12</SelectItem>
                      <SelectItem value="8/12">8/12</SelectItem>
                      <SelectItem value="10/12">10/12</SelectItem>
                      <SelectItem value="12/12">12/12</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Truss</Label>
                  <Input
                    value={formData.truss}
                    onChange={(e) => setFormData({ ...formData, truss: e.target.value })}
                    placeholder="Truss type"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Foundation & Floor */}
          <Card>
            <CardHeader>
              <CardTitle>Foundation & Floor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Foundation Type</Label>
                  <Select 
                    value={formData.foundation_type} 
                    onValueChange={(value) => setFormData({ ...formData, foundation_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concrete">Concrete</SelectItem>
                      <SelectItem value="gravel">Gravel</SelectItem>
                      <SelectItem value="pier">Pier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Floor</Label>
                  <Select 
                    value={formData.floor_type} 
                    onValueChange={(value) => setFormData({ ...formData, floor_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select floor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concrete">Concrete</SelectItem>
                      <SelectItem value="wood">Wood</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Soffit</Label>
                  <Select 
                    value={formData.soffit_type} 
                    onValueChange={(value) => setFormData({ ...formData, soffit_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select soffit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="steel">Steel</SelectItem>
                      <SelectItem value="vinyl">Vinyl</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Structure & Design */}
          <Card>
            <CardHeader>
              <CardTitle>Structure & Design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Snow Load (psf)</Label>
                  <Input
                    type="number"
                    value={formData.snow_load}
                    onChange={(e) => setFormData({ ...formData, snow_load: Number(e.target.value) })}
                    placeholder="20"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Wind Load (mph)</Label>
                  <Input
                    type="number"
                    value={formData.wind_load}
                    onChange={(e) => setFormData({ ...formData, wind_load: Number(e.target.value) })}
                    placeholder="90"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Building Use</Label>
                  <Input
                    value={formData.building_use}
                    onChange={(e) => setFormData({ ...formData, building_use: e.target.value })}
                    placeholder="Storage, Garage, etc."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Exterior Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Exterior Colors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Roof Material</Label>
                  <Input
                    value={formData.roof_material}
                    onChange={(e) => setFormData({ ...formData, roof_material: e.target.value })}
                    placeholder="Steel, Shingles, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Roof Color</Label>
                  <Input
                    value={formData.roof_color}
                    onChange={(e) => setFormData({ ...formData, roof_color: e.target.value })}
                    placeholder="Color name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trim Color</Label>
                  <Input
                    value={formData.trim_color}
                    onChange={(e) => setFormData({ ...formData, trim_color: e.target.value })}
                    placeholder="Color name"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 pt-6">
                    <Checkbox
                      id="wainscot"
                      checked={formData.wainscot_enabled}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, wainscot_enabled: checked as boolean })
                      }
                    />
                    <Label htmlFor="wainscot" className="cursor-pointer">
                      Include Wainscot
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overhang */}
          <Card>
            <CardHeader>
              <CardTitle>Overhang</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="overhang_same"
                  checked={formData.overhang_same_all}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, overhang_same_all: checked as boolean })
                  }
                />
                <Label htmlFor="overhang_same" className="cursor-pointer">
                  Same on all sides
                </Label>
              </div>
              {formData.overhang_same_all ? (
                <div className="space-y-2">
                  <Label>Overhang (inches)</Label>
                  <Input
                    type="number"
                    value={formData.overhang_front}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setFormData({ 
                        ...formData, 
                        overhang_front: value,
                        overhang_back: value,
                        overhang_left: value,
                        overhang_right: value,
                      });
                    }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Front (inches)</Label>
                    <Input
                      type="number"
                      value={formData.overhang_front}
                      onChange={(e) => setFormData({ ...formData, overhang_front: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Back (inches)</Label>
                    <Input
                      type="number"
                      value={formData.overhang_back}
                      onChange={(e) => setFormData({ ...formData, overhang_back: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Left (inches)</Label>
                    <Input
                      type="number"
                      value={formData.overhang_left}
                      onChange={(e) => setFormData({ ...formData, overhang_left: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Right (inches)</Label>
                    <Input
                      type="number"
                      value={formData.overhang_right}
                      onChange={(e) => setFormData({ ...formData, overhang_right: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Insulation */}
          <Card>
            <CardHeader>
              <CardTitle>Insulation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Insulation Type</Label>
                <Textarea
                  value={formData.insulation_type}
                  onChange={(e) => setFormData({ ...formData, insulation_type: e.target.value })}
                  placeholder="Interior partitions, ceiling, etc."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Special Features */}
          <Card>
            <CardHeader>
              <CardTitle>Special Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="loft"
                    checked={formData.has_loft}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, has_loft: checked as boolean })
                    }
                  />
                  <Label htmlFor="loft" className="cursor-pointer">
                    Loft
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="porch"
                    checked={formData.has_porch}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, has_porch: checked as boolean })
                    }
                  />
                  <Label htmlFor="porch" className="cursor-pointer">
                    Porch
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Utilities */}
          <Card>
            <CardHeader>
              <CardTitle>Utilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="plumbing"
                    checked={formData.has_plumbing}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, has_plumbing: checked as boolean })
                    }
                  />
                  <Label htmlFor="plumbing" className="cursor-pointer">
                    Plumbing
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="electrical"
                    checked={formData.has_electrical}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, has_electrical: checked as boolean })
                    }
                  />
                  <Label htmlFor="electrical" className="cursor-pointer">
                    Electrical
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hvac"
                    checked={formData.has_hvac}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, has_hvac: checked as boolean })
                    }
                  />
                  <Label htmlFor="hvac" className="cursor-pointer">
                    HVAC
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Site/Sketch Notes</Label>
                <Textarea
                  value={formData.site_notes}
                  onChange={(e) => setFormData({ ...formData, site_notes: e.target.value })}
                  placeholder="Site-specific notes and observations"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Structural Notes</Label>
                <Textarea
                  value={formData.structural_notes}
                  onChange={(e) => setFormData({ ...formData, structural_notes: e.target.value })}
                  placeholder="Structural requirements and considerations"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Estimated Price (for office only) */}
          {existingQuote && (
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Estimated Price</Label>
                  <Input
                    type="number"
                    value={formData.estimated_price || ''}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      estimated_price: e.target.value ? Number(e.target.value) : null 
                    })}
                    placeholder="Enter estimated price"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="estimated">Estimated</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Floor Plan Builder */}
        <div className="lg:sticky lg:top-6 h-fit">
          <FloorPlanBuilder
            width={formData.width}
            length={formData.length}
            quoteId={currentQuoteId}
          />
        </div>
      </div>
    </div>
  );
}
