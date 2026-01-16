
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, Briefcase, User, Home } from 'lucide-react';
import { FloorPlanBuilder } from '@/components/office/FloorPlanBuilder';
import { useAuth } from '@/hooks/useAuth';

interface QuoteData {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  project_name: string;
  width: number;
  length: number;
  eave: number;
  pitch: string;
  truss: string;
  foundation_type: string;
  floor_type: string;
  soffit_type: string;
  snow_load: number;
  wind_load: number;
  building_use: string;
  roof_material: string;
  roof_color: string;
  trim_color: string;
  wainscot_enabled: boolean;
  overhang_same_all: boolean;
  overhang_front: number;
  overhang_back: number;
  overhang_left: number;
  overhang_right: number;
  insulation_type: string;
  has_loft: boolean;
  has_porch: boolean;
  has_plumbing: boolean;
  has_electrical: boolean;
  has_hvac: boolean;
  site_notes: string;
  structural_notes: string;
  status: string;
  estimated_price: number | null;
}

export function QuoteIntakePage() {
  const { quoteId } = useParams<{ quoteId?: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingQuote, setExistingQuote] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('customer');
  
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
    truss: '',
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
      navigate('/office?tab=quotes');
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
    if (!formData.customer_name || !formData.project_name) {
      toast.error('Please fill in customer name and project name');
      setActiveTab('customer');
      return;
    }

    setSaving(true);

    try {
      const quoteData = {
        ...formData,
        status,
        created_by: profile?.id,
        updated_at: new Date().toISOString(),
        ...(status === 'submitted' && !existingQuote?.submitted_at && {
          submitted_at: new Date().toISOString(),
        }),
      };

      if (quoteId) {
        const { error } = await supabase
          .from('quotes')
          .update(quoteData)
          .eq('id', quoteId);

        if (error) throw error;
        toast.success('Quote updated successfully');
      } else {
        const { data, error } = await supabase
          .from('quotes')
          .insert(quoteData)
          .select()
          .single();

        if (error) throw error;

        const quoteNumber = `Q${new Date().getFullYear()}-${String(data.id).slice(0, 6).toUpperCase()}`;
        await supabase
          .from('quotes')
          .update({ quote_number: quoteNumber })
          .eq('id', data.id);

        toast.success('Quote created successfully');
        navigate(`/office/quotes/${data.id}`);
      }
    } catch (error: any) {
      console.error('Error saving quote:', error);
      toast.error('Failed to save quote');
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertToJob() {
    if (!quoteId) return;

    try {
      setSaving(true);

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
      navigate('/office?tab=jobs');
    } catch (error: any) {
      console.error('Error converting quote:', error);
      toast.error('Failed to convert quote to job');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-muted-foreground">Loading quote...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/office?tab=quotes')}
                className="rounded-none"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Quotes
              </Button>
              <div className="border-l border-slate-300 pl-4">
                <h1 className="text-xl font-bold text-green-900">
                  {quoteId ? 'Edit Quote' : 'New Quote'}
                </h1>
                {formData.project_name && (
                  <p className="text-sm text-black">{formData.project_name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {existingQuote?.status && (
                <span className="text-sm text-muted-foreground capitalize px-3 py-1 bg-slate-100 rounded-none border border-slate-300">
                  {existingQuote.status}
                </span>
              )}
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saving}
                className="rounded-none border-slate-300"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Draft
              </Button>
              {formData.status === 'draft' && (
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="rounded-none bg-green-900 hover:bg-green-800"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Submit for Estimating
                </Button>
              )}
              {existingQuote && existingQuote.status === 'estimated' && !existingQuote.job_id && (
                <Button
                  onClick={handleConvertToJob}
                  disabled={saving}
                  className="rounded-none bg-blue-600 hover:bg-blue-700"
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  Convert to Job
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-white border-2 border-slate-300 rounded-none">
            <TabsTrigger value="customer" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
              <User className="w-4 h-4 mr-2" />
              Customer Info
            </TabsTrigger>
            <TabsTrigger value="building" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
              <Home className="w-4 h-4 mr-2" />
              Building Details
            </TabsTrigger>
            <TabsTrigger value="floorplan" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
              <Home className="w-4 h-4 mr-2" />
              Floor Plan
            </TabsTrigger>
          </TabsList>

          {/* Customer Info Tab */}
          <TabsContent value="customer">
            <Card className="rounded-none border-2 border-slate-300">
              <CardHeader>
                <CardTitle>Customer Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Project Name *</Label>
                    <Input
                      value={formData.project_name}
                      onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                      placeholder="Enter project name"
                      className="rounded-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Name *</Label>
                    <Input
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder="Enter customer name"
                      className="rounded-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                      placeholder="customer@example.com"
                      className="rounded-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      type="tel"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="rounded-none"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Site Address</Label>
                    <Input
                      value={formData.customer_address}
                      onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                      placeholder="Enter site address"
                      className="rounded-none"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Building Details Tab - Combined with Floor Plan */}
          <TabsContent value="building">
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              {/* Left Column - Forms (3/5 width) */}
              <div className="xl:col-span-3 space-y-6">
                {/* Building Dimensions */}
                <Card className="rounded-none border-2 border-slate-300">
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
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Length (ft)</Label>
                        <Input
                          type="number"
                          value={formData.length}
                          onChange={(e) => setFormData({ ...formData, length: Number(e.target.value) })}
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Eave (ft)</Label>
                        <Input
                          type="number"
                          value={formData.eave}
                          onChange={(e) => setFormData({ ...formData, eave: Number(e.target.value) })}
                          className="rounded-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pitch</Label>
                        <Select value={formData.pitch} onValueChange={(value) => setFormData({ ...formData, pitch: value })}>
                          <SelectTrigger className="rounded-none">
                            <SelectValue />
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
                          className="rounded-none"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Foundation & Floor */}
                <Card className="rounded-none border-2 border-slate-300">
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
                          <SelectTrigger className="rounded-none">
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
                          <SelectTrigger className="rounded-none">
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
                          <SelectTrigger className="rounded-none">
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
                <Card className="rounded-none border-2 border-slate-300">
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
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Wind Load (mph)</Label>
                        <Input
                          type="number"
                          value={formData.wind_load}
                          onChange={(e) => setFormData({ ...formData, wind_load: Number(e.target.value) })}
                          placeholder="90"
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Building Use</Label>
                        <Input
                          value={formData.building_use}
                          onChange={(e) => setFormData({ ...formData, building_use: e.target.value })}
                          placeholder="Storage, Garage, etc."
                          className="rounded-none"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Exterior Colors & Finishes */}
                <Card className="rounded-none border-2 border-slate-300">
                  <CardHeader>
                    <CardTitle>Exterior Colors & Finishes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Roof Material</Label>
                        <Input
                          value={formData.roof_material}
                          onChange={(e) => setFormData({ ...formData, roof_material: e.target.value })}
                          placeholder="Steel, Shingles, etc."
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Roof Color</Label>
                        <Input
                          value={formData.roof_color}
                          onChange={(e) => setFormData({ ...formData, roof_color: e.target.value })}
                          placeholder="Color name"
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Trim Color</Label>
                        <Input
                          value={formData.trim_color}
                          onChange={(e) => setFormData({ ...formData, trim_color: e.target.value })}
                          placeholder="Color name"
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2 flex items-end">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="wainscot"
                            checked={formData.wainscot_enabled}
                            onCheckedChange={(checked) => setFormData({ ...formData, wainscot_enabled: checked as boolean })}
                          />
                          <Label htmlFor="wainscot" className="cursor-pointer">Include Wainscot</Label>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t">
                      <div className="flex items-center space-x-2 mb-3">
                        <Checkbox
                          id="overhang_same"
                          checked={formData.overhang_same_all}
                          onCheckedChange={(checked) => setFormData({ ...formData, overhang_same_all: checked as boolean })}
                        />
                        <Label htmlFor="overhang_same" className="cursor-pointer font-semibold">Overhang - Same on all sides</Label>
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
                            className="rounded-none"
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
                              className="rounded-none"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Back (inches)</Label>
                            <Input
                              type="number"
                              value={formData.overhang_back}
                              onChange={(e) => setFormData({ ...formData, overhang_back: Number(e.target.value) })}
                              className="rounded-none"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Left (inches)</Label>
                            <Input
                              type="number"
                              value={formData.overhang_left}
                              onChange={(e) => setFormData({ ...formData, overhang_left: Number(e.target.value) })}
                              className="rounded-none"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Right (inches)</Label>
                            <Input
                              type="number"
                              value={formData.overhang_right}
                              onChange={(e) => setFormData({ ...formData, overhang_right: Number(e.target.value) })}
                              className="rounded-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t">
                      <Label className="font-semibold">Insulation</Label>
                      <Textarea
                        value={formData.insulation_type}
                        onChange={(e) => setFormData({ ...formData, insulation_type: e.target.value })}
                        placeholder="Interior partitions, ceiling, etc."
                        rows={3}
                        className="rounded-none mt-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Special Features & Utilities */}
                <Card className="rounded-none border-2 border-slate-300">
                  <CardHeader>
                    <CardTitle>Special Features & Utilities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Special Features</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="loft"
                              checked={formData.has_loft}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_loft: checked as boolean })}
                            />
                            <Label htmlFor="loft" className="cursor-pointer">Loft</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="porch"
                              checked={formData.has_porch}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_porch: checked as boolean })}
                            />
                            <Label htmlFor="porch" className="cursor-pointer">Porch</Label>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Utilities</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="plumbing"
                              checked={formData.has_plumbing}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_plumbing: checked as boolean })}
                            />
                            <Label htmlFor="plumbing" className="cursor-pointer">Plumbing</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="electrical"
                              checked={formData.has_electrical}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_electrical: checked as boolean })}
                            />
                            <Label htmlFor="electrical" className="cursor-pointer">Electrical</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="hvac"
                              checked={formData.has_hvac}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_hvac: checked as boolean })}
                            />
                            <Label htmlFor="hvac" className="cursor-pointer">HVAC</Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card className="rounded-none border-2 border-slate-300">
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
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Structural Notes</Label>
                      <Textarea
                        value={formData.structural_notes}
                        onChange={(e) => setFormData({ ...formData, structural_notes: e.target.value })}
                        placeholder="Structural requirements and considerations"
                        rows={3}
                        className="rounded-none"
                      />
                    </div>
                  </CardContent>
                </Card>

                {existingQuote && (
                  <Card className="rounded-none border-2 border-slate-300">
                    <CardHeader>
                      <CardTitle>Pricing & Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
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
                            className="rounded-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select 
                            value={formData.status} 
                            onValueChange={(value) => setFormData({ ...formData, status: value })}
                          >
                            <SelectTrigger className="rounded-none">
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
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right Column - Floor Plan (2/5 width) */}
              <div className="xl:col-span-2 xl:sticky xl:top-24 h-fit">
                <FloorPlanBuilder
                  width={formData.width}
                  length={formData.length}
                  quoteId={quoteId}
                />
              </div>
            </div>
          </TabsContent>

          {/* Floor Plan Tab */}
          <TabsContent value="floorplan">
            <FloorPlanBuilder
              width={formData.width}
              length={formData.length}
              quoteId={quoteId}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
