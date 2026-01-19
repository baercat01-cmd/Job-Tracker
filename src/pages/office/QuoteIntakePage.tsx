
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, Briefcase, User, Home, ChevronDown, ChevronRight } from 'lucide-react';
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
  building_use: string;
  roof_color: string;
  trim_color: string;
  wainscot_enabled: boolean;
  overhang_same_all: boolean;
  overhang_front: number;
  overhang_back: number;
  overhang_left: number;
  overhang_right: number;
  insulation_type: string;
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
    building_use: '',
    roof_color: '',
    trim_color: '',
    wainscot_enabled: false,
    overhang_same_all: true,
    overhang_front: 12,
    overhang_back: 12,
    overhang_left: 12,
    overhang_right: 12,
    insulation_type: '',
    has_plumbing: false,
    has_electrical: false,
    has_hvac: false,
    site_notes: '',
    structural_notes: '',
    status: 'draft',
    estimated_price: null,
  });

  // Collapsible sections state
  const [openSections, setOpenSections] = useState({
    dimensions: true,
    foundation: true,
    structure: true,
    colors: true,
    utilities: true,
    notes: true,
    pricing: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections({ ...openSections, [section]: !openSections[section] });
  };

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
        building_use: data.building_use || '',
        roof_color: data.roof_color || '',
        trim_color: data.trim_color || '',
        wainscot_enabled: data.wainscot_enabled || false,
        overhang_same_all: data.overhang_same_all !== false,
        overhang_front: data.overhang_front || 12,
        overhang_back: data.overhang_back || 12,
        overhang_left: data.overhang_left || 12,
        overhang_right: data.overhang_right || 12,
        insulation_type: data.insulation_type || '',
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
    const savedQuoteId = await saveQuote('submitted');
    if (savedQuoteId) {
      // After submitting, create a job in quoting status
      await createJobFromQuote(savedQuoteId);
    }
  }

  async function saveQuote(status: string): Promise<string | null> {
    if (!formData.customer_name || !formData.project_name) {
      toast.error('Please fill in customer name and project name');
      setActiveTab('customer');
      return null;
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
        return quoteId;
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
        
        // Return the ID instead of navigating immediately
        return data.id;
      }
    } catch (error: any) {
      console.error('Error saving quote:', error);
      toast.error('Failed to save quote');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createJobFromQuote(quoteIdToUse: string) {
    if (!quoteIdToUse) return;

    try {
      // Check if job already exists for this quote
      const { data: existingJobData } = await supabase
        .from('quotes')
        .select('job_id')
        .eq('id', quoteIdToUse)
        .single();

      if (existingJobData?.job_id) {
        // Job already exists, just navigate to it
        toast.success('Quote submitted for estimating');
        navigate('/office?tab=jobs');
        return;
      }

      // Create a new job with quoting status
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert({
          name: formData.project_name,
          client_name: formData.customer_name,
          address: formData.customer_address || '',
          description: `Building: ${formData.width}' × ${formData.length}'\n${formData.site_notes || ''}`,
          status: 'quoting',
          created_by: profile?.id,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Link the quote to the job
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({ job_id: jobData.id })
        .eq('id', quoteIdToUse);

      if (quoteError) throw quoteError;

      toast.success('Quote submitted for estimating and added to Jobs (Quoting status)');
      navigate('/office?tab=jobs');
    } catch (error: any) {
      console.error('Error creating job from quote:', error);
      toast.error('Quote saved but failed to create job record');
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
      <main className="container mx-auto px-2 py-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
            {/* Top Bar - Key Dimensions */}
            <div className="bg-white border-2 border-slate-300 p-2 mb-2 rounded-none">
              <div className="grid grid-cols-6 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold">Width</Label>
                  <Input
                    type="number"
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: Number(e.target.value) })}
                    className="rounded-none h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold">Length</Label>
                  <Input
                    type="number"
                    value={formData.length}
                    onChange={(e) => setFormData({ ...formData, length: Number(e.target.value) })}
                    className="rounded-none h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold">Eave</Label>
                  <Input
                    type="number"
                    value={formData.eave}
                    onChange={(e) => setFormData({ ...formData, eave: Number(e.target.value) })}
                    className="rounded-none h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold">Pitch</Label>
                  <Select value={formData.pitch} onValueChange={(value) => setFormData({ ...formData, pitch: value })}>
                    <SelectTrigger className="rounded-none h-7 text-xs">
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
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold">Building Use</Label>
                  <Input
                    value={formData.building_use}
                    onChange={(e) => setFormData({ ...formData, building_use: e.target.value })}
                    placeholder="Storage, Garage"
                    className="rounded-none h-7 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold">Insulation</Label>
                  <Select 
                    value={formData.insulation_type} 
                    onValueChange={(value) => setFormData({ ...formData, insulation_type: value })}
                  >
                    <SelectTrigger className="rounded-none h-7 text-xs">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="fiberglass">Fiberglass</SelectItem>
                      <SelectItem value="spray_foam">Spray Foam</SelectItem>
                      <SelectItem value="blown_in">Blown-In</SelectItem>
                      <SelectItem value="rigid_foam">Rigid Foam</SelectItem>
                      <SelectItem value="reflective">Reflective</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-2 h-[calc(100vh-14rem)]">
              {/* Left Column - Fixed Floor Plan (Desktop) */}
              <div className="hidden xl:block xl:h-full xl:overflow-hidden flex flex-col">
                <FloorPlanBuilder
                  width={formData.width}
                  length={formData.length}
                  quoteId={quoteId}
                />
              </div>

              {/* Right Column - Collapsible Forms */}
              <div className="space-y-1 overflow-y-auto xl:h-full pr-1">
                {/* Overhang Section */}
                <Collapsible open={openSections.dimensions} onOpenChange={() => toggleSection('dimensions')}>
                  <Card className="rounded-none border-2 border-slate-300">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-semibold">Overhang</CardTitle>
                        {openSections.dimensions ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-1.5 py-1.5 px-2">
                        <div className="flex items-center space-x-1.5 mb-1">
                          <Checkbox
                            id="overhang_same"
                            checked={formData.overhang_same_all}
                            onCheckedChange={(checked) => setFormData({ ...formData, overhang_same_all: checked as boolean })}
                            className="h-3 w-3"
                          />
                          <Label htmlFor="overhang_same" className="cursor-pointer font-semibold text-[10px]">Same all sides</Label>
                        </div>
                        {formData.overhang_same_all ? (
                          <div className="space-y-0.5">
                            <Label className="text-[10px]">Overhang (in)</Label>
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
                              className="rounded-none h-7 text-xs"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Front</Label>
                              <Input
                                type="number"
                                value={formData.overhang_front}
                                onChange={(e) => setFormData({ ...formData, overhang_front: Number(e.target.value) })}
                                className="rounded-none h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Back</Label>
                              <Input
                                type="number"
                                value={formData.overhang_back}
                                onChange={(e) => setFormData({ ...formData, overhang_back: Number(e.target.value) })}
                                className="rounded-none h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Left</Label>
                              <Input
                                type="number"
                                value={formData.overhang_left}
                                onChange={(e) => setFormData({ ...formData, overhang_left: Number(e.target.value) })}
                                className="rounded-none h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Right</Label>
                              <Input
                                type="number"
                                value={formData.overhang_right}
                                onChange={(e) => setFormData({ ...formData, overhang_right: Number(e.target.value) })}
                                className="rounded-none h-7 text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Foundation & Floor */}
                <Collapsible open={openSections.foundation} onOpenChange={() => toggleSection('foundation')}>
                  <Card className="rounded-none border-2 border-slate-300">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-semibold">Foundation & Floor</CardTitle>
                        {openSections.foundation ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-1.5 py-1.5 px-2">
                        <div className="grid grid-cols-1 gap-1.5">
                          <div className="space-y-0.5">
                            <Label className="text-[10px]">Foundation</Label>
                            <Select 
                              value={formData.foundation_type} 
                              onValueChange={(value) => setFormData({ ...formData, foundation_type: value })}
                            >
                              <SelectTrigger className="rounded-none h-7 text-xs">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="concrete">Concrete</SelectItem>
                                <SelectItem value="gravel">Gravel</SelectItem>
                                <SelectItem value="pier">Pier</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px]">Floor</Label>
                            <Select 
                              value={formData.floor_type} 
                              onValueChange={(value) => setFormData({ ...formData, floor_type: value })}
                            >
                              <SelectTrigger className="rounded-none h-7 text-xs">
                                <SelectValue placeholder="Select floor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="concrete">Concrete</SelectItem>
                                <SelectItem value="wood">Wood</SelectItem>
                                <SelectItem value="none">None</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px]">Soffit</Label>
                            <Select 
                              value={formData.soffit_type} 
                              onValueChange={(value) => setFormData({ ...formData, soffit_type: value })}
                            >
                              <SelectTrigger className="rounded-none h-7 text-xs">
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
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Structure & Design */}
                <Collapsible open={openSections.structure} onOpenChange={() => toggleSection('structure')}>
                  <Card className="rounded-none border-2 border-slate-300">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-semibold">Structure</CardTitle>
                        {openSections.structure ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-1.5 py-1.5 px-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Truss</Label>
                          <Input
                            value={formData.truss}
                            onChange={(e) => setFormData({ ...formData, truss: e.target.value })}
                            placeholder="Type"
                            className="rounded-none h-7 text-xs"
                          />
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Exterior Colors & Finishes */}
                <Collapsible open={openSections.colors} onOpenChange={() => toggleSection('colors')}>
                  <Card className="rounded-none border-2 border-slate-300">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-semibold">Colors & Finishes</CardTitle>
                        {openSections.colors ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-1.5 py-1.5 px-2">
                        <div className="grid grid-cols-1 gap-1.5">
                          <div className="space-y-0.5">
                            <Label className="text-[10px]">Roof Color</Label>
                            <Input
                              value={formData.roof_color}
                              onChange={(e) => setFormData({ ...formData, roof_color: e.target.value })}
                              placeholder="Color"
                              className="rounded-none h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <Label className="text-[10px]">Trim Color</Label>
                            <Input
                              value={formData.trim_color}
                              onChange={(e) => setFormData({ ...formData, trim_color: e.target.value })}
                              placeholder="Color"
                              className="rounded-none h-7 text-xs"
                            />
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Checkbox
                              id="wainscot"
                              checked={formData.wainscot_enabled}
                              onCheckedChange={(checked) => setFormData({ ...formData, wainscot_enabled: checked as boolean })}
                              className="h-3 w-3"
                            />
                            <Label htmlFor="wainscot" className="cursor-pointer text-[10px]">Include Wainscot</Label>
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Utilities */}
                <Collapsible open={openSections.utilities} onOpenChange={() => toggleSection('utilities')}>
                  <Card className="rounded-none border-2 border-slate-300">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-semibold">Utilities</CardTitle>
                        {openSections.utilities ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-1 py-1.5 px-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center space-x-1.5">
                            <Checkbox
                              id="plumbing"
                              checked={formData.has_plumbing}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_plumbing: checked as boolean })}
                              className="h-3 w-3"
                            />
                            <Label htmlFor="plumbing" className="cursor-pointer text-[10px]">Plumbing</Label>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Checkbox
                              id="electrical"
                              checked={formData.has_electrical}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_electrical: checked as boolean })}
                              className="h-3 w-3"
                            />
                            <Label htmlFor="electrical" className="cursor-pointer text-[10px]">Electrical</Label>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Checkbox
                              id="hvac"
                              checked={formData.has_hvac}
                              onCheckedChange={(checked) => setFormData({ ...formData, has_hvac: checked as boolean })}
                              className="h-3 w-3"
                            />
                            <Label htmlFor="hvac" className="cursor-pointer text-[10px]">HVAC</Label>
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Notes */}
                <Collapsible open={openSections.notes} onOpenChange={() => toggleSection('notes')}>
                  <Card className="rounded-none border-2 border-slate-300">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-semibold">Notes</CardTitle>
                        {openSections.notes ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-1.5 py-1.5 px-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Site Notes</Label>
                          <Textarea
                            value={formData.site_notes}
                            onChange={(e) => setFormData({ ...formData, site_notes: e.target.value })}
                            placeholder="Site notes"
                            rows={2}
                            className="rounded-none text-xs"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Structural</Label>
                          <Textarea
                            value={formData.structural_notes}
                            onChange={(e) => setFormData({ ...formData, structural_notes: e.target.value })}
                            placeholder="Structural notes"
                            rows={2}
                            className="rounded-none text-xs"
                          />
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {existingQuote && (
                  <Collapsible open={openSections.pricing} onOpenChange={() => toggleSection('pricing')}>
                    <Card className="rounded-none border-2 border-slate-300">
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="py-1 px-2 flex flex-row items-center justify-between">
                          <CardTitle className="text-xs font-semibold">Pricing & Status</CardTitle>
                          {openSections.pricing ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-1.5 py-1.5 px-2">
                          <div className="grid grid-cols-1 gap-1.5">
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Price</Label>
                              <Input
                                type="number"
                                value={formData.estimated_price || ''}
                                onChange={(e) => setFormData({ 
                                  ...formData, 
                                  estimated_price: e.target.value ? Number(e.target.value) : null 
                                })}
                                placeholder="Price"
                                className="rounded-none h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px]">Status</Label>
                              <Select 
                                value={formData.status} 
                                onValueChange={(value) => setFormData({ ...formData, status: value })}
                              >
                                <SelectTrigger className="rounded-none h-7 text-xs">
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
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )}
              </div>
            </div>

            {/* Mobile: Floor Plan Below */}
            <div className="xl:hidden mt-2">
              <FloorPlanBuilder
                width={formData.width}
                length={formData.length}
                quoteId={quoteId}
              />
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
