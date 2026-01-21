
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
  
  // Config options from database
  const [configOptions, setConfigOptions] = useState<Record<string, string[]>>({});
  const [loadingOptions, setLoadingOptions] = useState(true);
  
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
    loadConfigOptions();
    if (quoteId) {
      setCurrentQuoteId(quoteId);
      loadQuote();
    }
  }, [quoteId]);

  async function loadConfigOptions() {
    try {
      setLoadingOptions(true);
      const { data, error } = await supabase
        .from('quote_config_options')
        .select('category, value')
        .eq('active', true)
        .order('order_index', { ascending: true });

      if (error) throw error;

      // Group options by category
      const grouped: Record<string, string[]> = {};
      (data || []).forEach((option: any) => {
        if (!grouped[option.category]) {
          grouped[option.category] = [];
        }
        grouped[option.category].push(option.value);
      });

      setConfigOptions(grouped);
    } catch (error: any) {
      console.error('Error loading config options:', error);
      toast.error('Failed to load form options');
    } finally {
      setLoadingOptions(false);
    }
  }

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

  async function handleSaveDraft(e: React.MouseEvent) {
    // CRITICAL: Prevent default FIRST to block page reload
    e.preventDefault();
    e.stopPropagation();
    await saveQuote('draft');
  }

  async function handleSubmit(e: React.MouseEvent) {
    // CRITICAL: Prevent default FIRST to block page reload
    e.preventDefault();
    e.stopPropagation();
    await saveQuote('submitted');
  }

  async function saveQuote(status: string) {
    console.log('🔷 saveQuote called with status:', status);
    console.log('🔷 Current formData:', formData);
    console.log('🔷 Current quoteId:', currentQuoteId);
    console.log('🔷 Current profile:', profile);
    
    // Save scroll position before any state changes
    const scrollY = window.scrollY;
    
    // Validate user session FIRST
    if (!profile?.id) {
      console.error('❌ Cannot save quote: User profile not loaded or no user ID');
      toast.error('Unable to save: User session not found. Please refresh and try again.');
      return;
    }
    
    setSaving(true);

    try {
      // Helper to clean string values - returns null if empty
      const cleanStr = (val: any): string | null => {
        if (val === null || val === undefined) return null;
        const trimmed = String(val).trim();
        return trimmed === '' ? null : trimmed;
      };

      // Helper to clean number values - NEVER returns NaN
      const cleanNum = (val: any, required: boolean = false): number | null => {
        // Handle empty/null/undefined
        if (val === null || val === undefined || val === '') {
          return required ? 0 : null;
        }
        
        // Convert to number
        const num = Number(val);
        
        // Check for NaN and return default
        if (isNaN(num) || !isFinite(num)) {
          console.warn(`⚠️ Invalid number value: ${val}, using ${required ? 0 : 'null'}`);
          return required ? 0 : null;
        }
        
        return num;
      };

      // Validate required fields FIRST
      const width = cleanNum(formData.width, true) || 30; // Default to 30 if invalid
      const length = cleanNum(formData.length, true) || 40; // Default to 40 if invalid
      
      console.log('🔷 Sanitized width:', width, 'type:', typeof width);
      console.log('🔷 Sanitized length:', length, 'type:', typeof length);
      
      if (width <= 0) {
        console.error('❌ Invalid width:', width);
        toast.error('Please enter a valid building width (must be greater than 0)');
        setSaving(false);
        return;
      }
      
      if (length <= 0) {
        console.error('❌ Invalid length:', length);
        toast.error('Please enter a valid building length (must be greater than 0)');
        setSaving(false);
        return;
      }
      
      console.log('✅ Width and length validation passed');

      // Build quote data with ONLY valid values
      const quoteData: any = {
        // Required fields - MUST have valid values
        width: width, // Already validated as number > 0
        length: length, // Already validated as number > 0
        status: cleanStr(status) || 'draft',
      };

      // If updating existing quote, include the ID
      if (currentQuoteId) {
        quoteData.id = currentQuoteId;
      }

      // DO NOT include quote_number - let database handle it

      // Optional string fields
      const customerName = cleanStr(formData.customer_name);
      if (customerName) quoteData.customer_name = customerName;
      
      const customerEmail = cleanStr(formData.customer_email);
      if (customerEmail) quoteData.customer_email = customerEmail;
      
      const customerPhone = cleanStr(formData.customer_phone);
      if (customerPhone) quoteData.customer_phone = customerPhone;
      
      const customerAddress = cleanStr(formData.customer_address);
      if (customerAddress) quoteData.customer_address = customerAddress;
      
      const projectName = cleanStr(formData.project_name);
      if (projectName) quoteData.project_name = projectName;
      
      // Dimensions (use cleanNum with required=false to get null for empty values)
      const eave = cleanNum(formData.eave, false);
      if (eave !== null) quoteData.eave = eave;
      
      const pitch = cleanStr(formData.pitch);
      if (pitch) quoteData.pitch = pitch;
      
      const truss = cleanStr(formData.truss);
      if (truss) quoteData.truss = truss;
      
      // Foundation & Floor
      const foundationType = cleanStr(formData.foundation_type);
      if (foundationType) quoteData.foundation_type = foundationType;
      
      const floorType = cleanStr(formData.floor_type);
      if (floorType) quoteData.floor_type = floorType;
      
      const soffitType = cleanStr(formData.soffit_type);
      if (soffitType) quoteData.soffit_type = soffitType;
      
      // Structure (allow 0 values)
      const snowLoad = cleanNum(formData.snow_load, false);
      if (snowLoad !== null) quoteData.snow_load = snowLoad;
      
      const windLoad = cleanNum(formData.wind_load, false);
      if (windLoad !== null) quoteData.wind_load = windLoad;
      
      const buildingUse = cleanStr(formData.building_use);
      if (buildingUse) quoteData.building_use = buildingUse;
      
      // Exterior
      const roofMaterial = cleanStr(formData.roof_material);
      if (roofMaterial) quoteData.roof_material = roofMaterial;
      
      const roofColor = cleanStr(formData.roof_color);
      if (roofColor) quoteData.roof_color = roofColor;
      
      const trimColor = cleanStr(formData.trim_color);
      if (trimColor) quoteData.trim_color = trimColor;
      
      quoteData.wainscot_enabled = Boolean(formData.wainscot_enabled);
      
      // Overhang (allow 0 values)
      quoteData.overhang_same_all = Boolean(formData.overhang_same_all);
      const overhangFront = cleanNum(formData.overhang_front, false);
      if (overhangFront !== null) quoteData.overhang_front = overhangFront;
      
      const overhangBack = cleanNum(formData.overhang_back, false);
      if (overhangBack !== null) quoteData.overhang_back = overhangBack;
      
      const overhangLeft = cleanNum(formData.overhang_left, false);
      if (overhangLeft !== null) quoteData.overhang_left = overhangLeft;
      
      const overhangRight = cleanNum(formData.overhang_right, false);
      if (overhangRight !== null) quoteData.overhang_right = overhangRight;
      
      // Insulation
      const insulationType = cleanStr(formData.insulation_type);
      if (insulationType) quoteData.insulation_type = insulationType;
      
      // Features (always include as boolean)
      quoteData.has_loft = Boolean(formData.has_loft);
      quoteData.has_porch = Boolean(formData.has_porch);
      quoteData.has_plumbing = Boolean(formData.has_plumbing);
      quoteData.has_electrical = Boolean(formData.has_electrical);
      quoteData.has_hvac = Boolean(formData.has_hvac);
      
      // Notes
      const siteNotes = cleanStr(formData.site_notes);
      if (siteNotes) quoteData.site_notes = siteNotes;
      
      const structuralNotes = cleanStr(formData.structural_notes);
      if (structuralNotes) quoteData.structural_notes = structuralNotes;
      
      // Price (allow 0 values)
      const estimatedPrice = cleanNum(formData.estimated_price, false);
      if (estimatedPrice !== null) quoteData.estimated_price = estimatedPrice;

      // Metadata - profile.id is already validated at the top
      quoteData.created_by = profile.id;
      
      if (status === 'submitted' && !existingQuote?.submitted_at) {
        quoteData.submitted_at = new Date().toISOString();
      }

      console.log('💾 Attempting to save quote...');
      console.log('📋 Form data:', formData);
      console.log('📤 Sending to database:', quoteData);
      console.log('📤 JSON stringified:', JSON.stringify(quoteData, null, 2));
      console.log('📤 Width type:', typeof quoteData.width, 'value:', quoteData.width);
      console.log('📤 Length type:', typeof quoteData.length, 'value:', quoteData.length);
      console.log('📤 Status type:', typeof quoteData.status, 'value:', quoteData.status);
      console.log('📤 Has ID:', !!quoteData.id, 'ID value:', quoteData.id);
      console.log('📤 Created by:', quoteData.created_by);
      
      // Validate ALL values to ensure no NaN or invalid types
      for (const [key, value] of Object.entries(quoteData)) {
        if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
          console.error(`❌ Invalid number in quoteData[${key}]:`, value);
          toast.error(`Invalid value for ${key}. Please check your input.`);
          setSaving(false);
          return;
        }
      }

      // Use upsert with explicit conflict resolution on 'id'
      const { data, error } = await supabase
        .from('quotes')
        .upsert(quoteData, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        // Log FULL error details for debugging
        console.error('❌ ========== SUPABASE ERROR ==========');
        console.error('❌ Error Object:', error);
        console.error('❌ Error Message:', error.message);
        console.error('❌ Error Code:', error.code);
        console.error('❌ Error Details:', error.details);
        console.error('❌ Error Hint:', error.hint);
        console.error('❌ Full Error JSON:', JSON.stringify(error, null, 2));
        console.error('❌ Data that was sent:', JSON.stringify(quoteData, null, 2));
        console.error('❌ ====================================');
        
        // Parse error response to get more details
        let userMessage = 'Failed to save quote';
        
        if (error.code === '23502') {
          // NOT NULL violation
          const columnMatch = error.message.match(/column "([^"]+)"/i);
          const columnName = columnMatch ? columnMatch[1] : 'unknown';
          userMessage = `Missing required field: ${columnName}. Please fill in all required information.`;
          console.error(`❌ NULL constraint violation on column: ${columnName}`);
        } else if (error.code === '23505') {
          // Unique violation
          userMessage = 'A quote with this information already exists';
          console.error('❌ Unique constraint violation');
        } else if (error.code === '22P02') {
          // Invalid input syntax
          userMessage = 'Invalid data format - please check all numeric fields';
          console.error('❌ Invalid input syntax for type');
        } else if (error.code === '42501') {
          // Permission denied
          userMessage = 'Permission denied - please check your access rights';
          console.error('❌ Permission denied');
        } else if (error.code === '42703') {
          // Undefined column
          userMessage = 'Database schema mismatch - please contact support';
          console.error('❌ Column does not exist in table');
        } else if (error.message) {
          userMessage = `Database error: ${error.message}`;
          if (error.hint) {
            userMessage += ` (Hint: ${error.hint})`;
          }
        }
        
        toast.error(userMessage, { duration: 10000 });
        setSaving(false);
        return;
      }

      console.log('✅ Quote saved successfully:', data);
      console.log('✅ Returned quote ID:', data.id);

      // CRITICAL: Update currentQuoteId IMMEDIATELY after first save
      // This ensures subsequent saves UPDATE instead of INSERT
      if (!currentQuoteId && data.id) {
        console.log('🆕 First save detected - setting currentQuoteId to:', data.id);
        setCurrentQuoteId(data.id);
        
        // Generate sequential quote number for new quotes
        const quoteNumber = await generateQuoteNumber();
        const { error: updateError } = await supabase
          .from('quotes')
          .update({ quote_number: quoteNumber })
          .eq('id', data.id);

        if (updateError) {
          console.error('⚠️ Error updating quote number:', updateError);
        } else {
          console.log('✅ Quote number generated:', quoteNumber);
        }

        // Optimistic update: Update local state immediately BEFORE showing toast
        setExistingQuote({ ...data, quote_number: quoteNumber });
        setFormData(prev => ({ ...prev, status: data.status }));
        
        // Restore scroll position BEFORE toast
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        
        toast.success(`Draft saved - Quote #${quoteNumber}`, {
          duration: 2000,
          position: 'bottom-right'
        });
      } else {
        console.log('📝 Update existing quote:', currentQuoteId);
        
        // Optimistic update: Update local state immediately BEFORE showing toast
        setExistingQuote(prev => ({ ...prev, ...data }));
        setFormData(prev => ({ ...prev, status: data.status }));
        
        // Restore scroll position BEFORE toast
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        
        toast.success(status === 'draft' ? 'Draft saved' : 'Quote updated', {
          duration: 2000,
          position: 'bottom-right'
        });
      }

      // Only call onSuccess if we're submitting (not just saving draft)
      // This prevents navigation for draft saves
      if (status !== 'draft') {
        // Wait a moment for the user to see the toast before navigating
        setTimeout(() => onSuccess(), 500);
      }
    } catch (error: any) {
      console.error('❌ CATCH ERROR:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error stack:', error.stack);
      toast.error(`Error: ${error.message || 'Unknown error occurred'}`, { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }

  async function generateQuoteNumber(): Promise<string> {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // Format: YYYYMMDD
      const datePrefix = `Q-${dateStr}-`;

      // Get the highest quote number for today
      const { data: quotes, error } = await supabase
        .from('quotes')
        .select('quote_number')
        .like('quote_number', `${datePrefix}%`)
        .order('quote_number', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching quote numbers:', error);
        // Fallback to simple format if query fails
        return `${datePrefix}001`;
      }

      let nextNumber = 1;
      if (quotes && quotes.length > 0) {
        // Extract the sequence number from the last quote
        const lastQuoteNumber = quotes[0].quote_number;
        const lastSequence = lastQuoteNumber.split('-').pop();
        if (lastSequence) {
          nextNumber = parseInt(lastSequence, 10) + 1;
        }
      }

      // Format with leading zeros (001, 002, etc.)
      const sequenceStr = String(nextNumber).padStart(3, '0');
      return `${datePrefix}${sequenceStr}`;
    } catch (error) {
      console.error('Error generating quote number:', error);
      // Fallback format
      const timestamp = Date.now().toString().slice(-6);
      return `Q-${timestamp}`;
    }
  }

  async function handleConvertToJob(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!quoteId) return;

    // Save scroll position
    const scrollY = window.scrollY;

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

      // Optimistic update
      setExistingQuote(prev => ({ ...prev, status: 'won', job_id: jobData.id }));
      setFormData(prev => ({ ...prev, status: 'won' }));

      toast.success('Quote converted to active job!');
      
      // Restore scroll position before navigation
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
      });
      
      onSuccess();
    } catch (error: any) {
      console.error('Error converting quote:', error);
      toast.error('Failed to convert quote to job');
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingOptions) {
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
                      {(configOptions.pitch || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Truss Type</Label>
                  <Select value={formData.truss} onValueChange={(value) => setFormData({ ...formData, truss: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select truss type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(configOptions.truss_type || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      {(configOptions.foundation_type || []).map((option) => (
                        <SelectItem key={option} value={option.toLowerCase()}>{option}</SelectItem>
                      ))}
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
                      {(configOptions.floor_type || []).map((option) => (
                        <SelectItem key={option} value={option.toLowerCase()}>{option}</SelectItem>
                      ))}
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
                      {(configOptions.soffit_type || []).map((option) => (
                        <SelectItem key={option} value={option.toLowerCase()}>{option}</SelectItem>
                      ))}
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
                  <Select value={formData.building_use} onValueChange={(value) => setFormData({ ...formData, building_use: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select use" />
                    </SelectTrigger>
                    <SelectContent>
                      {(configOptions.building_use || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={formData.roof_material} onValueChange={(value) => setFormData({ ...formData, roof_material: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {(configOptions.roof_material || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Roof Color</Label>
                  <Select value={formData.roof_color} onValueChange={(value) => setFormData({ ...formData, roof_color: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      {(configOptions.roof_color || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trim Color</Label>
                  <Select value={formData.trim_color} onValueChange={(value) => setFormData({ ...formData, trim_color: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      {(configOptions.trim_color || []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Select value={formData.insulation_type} onValueChange={(value) => setFormData({ ...formData, insulation_type: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select insulation type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(configOptions.insulation_type || []).map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
