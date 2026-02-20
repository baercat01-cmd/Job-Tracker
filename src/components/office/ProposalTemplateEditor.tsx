import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, Eye, RotateCcw, Settings, Type, Layout, FileText } from 'lucide-react';

interface TemplateSettings {
  id?: string;
  name: string;
  is_default: boolean;
  
  // Page settings
  page_margin_top: number;
  page_margin_bottom: number;
  page_margin_left: number;
  page_margin_right: number;
  
  // Body settings
  body_padding_top: number;
  body_padding_bottom: number;
  body_padding_left: number;
  body_padding_right: number;
  body_font_size: number;
  body_line_height: number;
  
  // Section spacing
  section_margin_top: number;
  section_margin_bottom: number;
  section_padding_bottom: number;
  section_min_height: number;
  
  // Title settings
  proposal_title_size: number;
  section_title_size: number;
  
  // Custom text
  intro_text: string;
  payment_text: string;
  acceptance_text: string;
  
  // Company info
  company_name: string;
  company_address_1: string;
  company_address_2: string;
  company_phone: string;
  company_fax: string;
  company_email: string;
  company_logo_url: string;
}

interface ProposalTemplateEditorProps {
  open: boolean;
  onClose: () => void;
}

const defaultSettings: TemplateSettings = {
  name: 'Default Template',
  is_default: true,
  page_margin_top: 0.75,
  page_margin_bottom: 0.75,
  page_margin_left: 0.5,
  page_margin_right: 0.5,
  body_padding_top: 50,
  body_padding_bottom: 60,
  body_padding_left: 30,
  body_padding_right: 30,
  body_font_size: 11,
  body_line_height: 1.3,
  section_margin_top: 12,
  section_margin_bottom: 6,
  section_padding_bottom: 4,
  section_min_height: 60,
  proposal_title_size: 32,
  section_title_size: 12,
  intro_text: 'We hereby submit specifications and estimates for: Thanks for requesting a Martin Builder building quotation. We propose to furnish material, labor and equipment as described below:',
  payment_text: 'Payment to be made as follows: 20% Down, 60% COD, 20% Final',
  acceptance_text: 'The above prices, specifications and conditions are satisfactory and are hereby accepted. You are authorized to do the work as specified. Payment will be made as outlined above.',
  company_name: 'Martin Builder',
  company_address_1: '27608-A CR 36',
  company_address_2: 'Goshen, IN 46526',
  company_phone: '574-862-4448',
  company_fax: '574-862-1548',
  company_email: 'office@martinbuilder.net',
  company_logo_url: 'https://cdn-ai.onspace.ai/onspace/files/4ZzeFr2RKnB7oAxZwNpsZR/MB_Logo_Green_192x64_12.9kb.png',
};

export function ProposalTemplateEditor({ open, onClose }: ProposalTemplateEditorProps) {
  const [settings, setSettings] = useState<TemplateSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('proposal_template_settings')
        .select('*')
        .eq('is_default', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings(data as TemplateSettings);
      }
    } catch (error: any) {
      console.error('Error loading template settings:', error);
      toast.error('Failed to load template settings');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      if (settings.id) {
        const { error } = await supabase
          .from('proposal_template_settings')
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('proposal_template_settings')
          .insert([{
            ...settings,
            is_default: true,
          }]);

        if (error) throw error;
      }

      toast.success('Template settings saved successfully');
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving template settings:', error);
      toast.error('Failed to save template settings');
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      setSettings({ ...defaultSettings, id: settings.id });
      toast.info('Settings reset to defaults. Click Save to apply.');
    }
  }

  function generatePreviewHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              line-height: ${settings.body_line_height}; 
              color: #000; 
              max-width: 940px; 
              margin: 0 auto; 
              padding: ${settings.body_padding_top}px ${settings.body_padding_right}px ${settings.body_padding_bottom}px ${settings.body_padding_left}px; 
              font-size: ${settings.body_font_size}pt;
            }
            .header-row { display: flex; justify-content: space-between; margin-bottom: 15px; }
            .company-logo { width: 192px; height: auto; margin-bottom: 10px; }
            .company-address { font-size: ${settings.body_font_size}pt; margin-bottom: 3px; }
            .proposal-title { font-size: ${settings.proposal_title_size}pt; font-weight: bold; margin-bottom: 5px; }
            .section-title { 
              font-weight: bold; 
              font-size: ${settings.section_title_size}pt;
              margin-top: ${settings.section_margin_top}px; 
              margin-bottom: ${settings.section_margin_bottom}px;
            }
            .section-wrapper {
              page-break-inside: avoid;
              margin-bottom: 8px;
              min-height: ${settings.section_min_height}px;
              padding-bottom: ${settings.section_padding_bottom}px;
            }
            .intro-text { margin: 20px 0; font-size: ${settings.body_font_size}pt; line-height: 1.6; }
            @page {
              margin: ${settings.page_margin_top}in ${settings.page_margin_right}in ${settings.page_margin_bottom}in ${settings.page_margin_left}in;
              size: letter;
            }
          </style>
        </head>
        <body>
          <div class="header-row">
            <div>
              <img src="${settings.company_logo_url}" alt="${settings.company_name}" class="company-logo" />
              <div class="company-address">${settings.company_address_1}</div>
              <div class="company-address">${settings.company_address_2}</div>
              <div class="company-address">Phone: ${settings.company_phone}</div>
              <div class="company-address">Fax: ${settings.company_fax}</div>
              <div class="company-address">Email: ${settings.company_email}</div>
            </div>
            <div style="text-align: right;">
              <div class="proposal-title">Proposal</div>
              <p style="font-size: ${settings.body_font_size}pt;">Date: ${new Date().toLocaleDateString()}</p>
              <p style="font-size: ${settings.body_font_size}pt;">Proposal #: SAMPLE-001</p>
            </div>
          </div>
          
          <div style="border: 1px solid #000; padding: 10px; margin: 15px 0;">
            <p><strong>Customer:</strong> Sample Customer Name</p>
            <p><strong>Address:</strong> 123 Sample Street, Sample City, ST 12345</p>
            <p><strong>Project:</strong> Sample Building Project</p>
          </div>
          
          <p class="intro-text">${settings.intro_text}</p>
          
          <div class="section-wrapper">
            <div class="section-title">Main Building</div>
            <p style="margin-left: 15px; color: #333;">72' × 116' pole building with 20' sidewalls and 5:12 roof pitch</p>
          </div>
          
          <div class="section-wrapper">
            <div class="section-title">Roof System</div>
            <p style="margin-left: 15px; color: #333;">Standing seam metal roof in black, includes ice/water shield and ventilation</p>
          </div>
          
          <div class="section-wrapper">
            <div class="section-title">Doors & Windows</div>
            <p style="margin-left: 15px; color: #333;">16' × 14' overhead doors and assorted window openings</p>
          </div>
          
          <div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border: 2px solid #333;">
            <p style="margin-bottom: 10px;"><strong>Subtotal:</strong> $125,000.00</p>
            <p style="margin-bottom: 10px;"><strong>Sales Tax (7%):</strong> $8,750.00</p>
            <p style="font-size: ${settings.body_font_size + 2}pt;"><strong>GRAND TOTAL: $133,750.00</strong></p>
          </div>
          
          <p style="margin-top: 20px; font-size: ${settings.body_font_size}pt;">${settings.payment_text}</p>
          
          <div style="margin-top: 30px;">
            <p style="margin-bottom: 15px;"><strong>Acceptance of Proposal</strong></p>
            <p style="margin-bottom: 20px; font-size: ${settings.body_font_size - 1}pt;">${settings.acceptance_text}</p>
          </div>
        </body>
      </html>
    `;
  }

  function openPreview() {
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(generatePreviewHTML());
      previewWindow.document.close();
    }
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading template settings...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Proposal Template Editor
          </DialogTitle>
          <DialogDescription>
            Customize the appearance and content of your proposal PDFs. Changes will apply to all future proposals.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="layout" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="layout" className="flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Layout & Spacing
            </TabsTrigger>
            <TabsTrigger value="typography" className="flex items-center gap-2">
              <Type className="w-4 h-4" />
              Typography
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Text Content
            </TabsTrigger>
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Company Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layout" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Page Margins (inches)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Top Margin</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={settings.page_margin_top}
                    onChange={(e) => setSettings({ ...settings, page_margin_top: parseFloat(e.target.value) || 0.75 })}
                  />
                </div>
                <div>
                  <Label>Bottom Margin</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={settings.page_margin_bottom}
                    onChange={(e) => setSettings({ ...settings, page_margin_bottom: parseFloat(e.target.value) || 0.75 })}
                  />
                </div>
                <div>
                  <Label>Left Margin</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={settings.page_margin_left}
                    onChange={(e) => setSettings({ ...settings, page_margin_left: parseFloat(e.target.value) || 0.5 })}
                  />
                </div>
                <div>
                  <Label>Right Margin</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={settings.page_margin_right}
                    onChange={(e) => setSettings({ ...settings, page_margin_right: parseFloat(e.target.value) || 0.5 })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Body Padding (pixels)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Top Padding</Label>
                  <Input
                    type="number"
                    value={settings.body_padding_top}
                    onChange={(e) => setSettings({ ...settings, body_padding_top: parseInt(e.target.value) || 50 })}
                  />
                </div>
                <div>
                  <Label>Bottom Padding</Label>
                  <Input
                    type="number"
                    value={settings.body_padding_bottom}
                    onChange={(e) => setSettings({ ...settings, body_padding_bottom: parseInt(e.target.value) || 60 })}
                  />
                </div>
                <div>
                  <Label>Left Padding</Label>
                  <Input
                    type="number"
                    value={settings.body_padding_left}
                    onChange={(e) => setSettings({ ...settings, body_padding_left: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div>
                  <Label>Right Padding</Label>
                  <Input
                    type="number"
                    value={settings.body_padding_right}
                    onChange={(e) => setSettings({ ...settings, body_padding_right: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Section Spacing (pixels)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Section Top Margin</Label>
                  <Input
                    type="number"
                    value={settings.section_margin_top}
                    onChange={(e) => setSettings({ ...settings, section_margin_top: parseInt(e.target.value) || 12 })}
                  />
                </div>
                <div>
                  <Label>Section Bottom Margin</Label>
                  <Input
                    type="number"
                    value={settings.section_margin_bottom}
                    onChange={(e) => setSettings({ ...settings, section_margin_bottom: parseInt(e.target.value) || 6 })}
                  />
                </div>
                <div>
                  <Label>Section Padding Bottom</Label>
                  <Input
                    type="number"
                    value={settings.section_padding_bottom}
                    onChange={(e) => setSettings({ ...settings, section_padding_bottom: parseInt(e.target.value) || 4 })}
                  />
                </div>
                <div>
                  <Label>Section Min Height</Label>
                  <Input
                    type="number"
                    value={settings.section_min_height}
                    onChange={(e) => setSettings({ ...settings, section_min_height: parseInt(e.target.value) || 60 })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="typography" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Font Sizes (points)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Body Font Size</Label>
                  <Input
                    type="number"
                    value={settings.body_font_size}
                    onChange={(e) => setSettings({ ...settings, body_font_size: parseInt(e.target.value) || 11 })}
                  />
                </div>
                <div>
                  <Label>Body Line Height</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.body_line_height}
                    onChange={(e) => setSettings({ ...settings, body_line_height: parseFloat(e.target.value) || 1.3 })}
                  />
                </div>
                <div>
                  <Label>Proposal Title Size</Label>
                  <Input
                    type="number"
                    value={settings.proposal_title_size}
                    onChange={(e) => setSettings({ ...settings, proposal_title_size: parseInt(e.target.value) || 32 })}
                  />
                </div>
                <div>
                  <Label>Section Title Size</Label>
                  <Input
                    type="number"
                    value={settings.section_title_size}
                    onChange={(e) => setSettings({ ...settings, section_title_size: parseInt(e.target.value) || 12 })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Introduction Text</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.intro_text}
                  onChange={(e) => setSettings({ ...settings, intro_text: e.target.value })}
                  rows={3}
                  placeholder="Introductory text that appears before the work sections..."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Terms</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.payment_text}
                  onChange={(e) => setSettings({ ...settings, payment_text: e.target.value })}
                  rows={2}
                  placeholder="Payment terms text..."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acceptance Text</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.acceptance_text}
                  onChange={(e) => setSettings({ ...settings, acceptance_text: e.target.value })}
                  rows={3}
                  placeholder="Proposal acceptance agreement text..."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="company" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Company Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Company Name</Label>
                  <Input
                    value={settings.company_name}
                    onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Address Line 1</Label>
                  <Input
                    value={settings.company_address_1}
                    onChange={(e) => setSettings({ ...settings, company_address_1: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Address Line 2</Label>
                  <Input
                    value={settings.company_address_2}
                    onChange={(e) => setSettings({ ...settings, company_address_2: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={settings.company_phone}
                      onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Fax</Label>
                    <Input
                      value={settings.company_fax}
                      onChange={(e) => setSettings({ ...settings, company_fax: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={settings.company_email}
                    onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <Input
                    value={settings.company_logo_url}
                    onChange={(e) => setSettings({ ...settings, company_logo_url: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={resetToDefaults}
              className="text-orange-600 hover:text-orange-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button
              variant="outline"
              onClick={openPreview}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Template
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
