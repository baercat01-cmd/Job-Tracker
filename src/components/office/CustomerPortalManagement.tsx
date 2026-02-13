import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Copy, ExternalLink, Plus, Trash2, Share2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';

interface CustomerPortalLink {
  id: string;
  job_id: string;
  access_token: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  is_active: boolean;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
}

interface CustomerPortalManagementProps {
  job: Job;
}

export function CustomerPortalManagement({ job }: CustomerPortalManagementProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [portalLinks, setPortalLinks] = useState<CustomerPortalLink[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Form state
  const [customerName, setCustomerName] = useState(job.client_name || '');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');

  useEffect(() => {
    loadPortalLinks();
  }, [job.id]);

  async function loadPortalLinks() {
    try {
      const { data, error } = await supabase
        .from('customer_portal_access')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPortalLinks(data || []);
    } catch (error: any) {
      console.error('Error loading portal links:', error);
      toast.error('Failed to load portal links');
    } finally {
      setLoading(false);
    }
  }

  function generateAccessToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  async function createPortalLink() {
    if (!customerName) {
      toast.error('Please enter customer name');
      return;
    }

    try {
      const token = generateAccessToken();
      
      let expiresAt = null;
      if (expiresInDays) {
        const days = parseInt(expiresInDays);
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + days);
        expiresAt = expireDate.toISOString();
      }

      const { data, error } = await supabase
        .from('customer_portal_access')
        .insert([{
          job_id: job.id,
          access_token: token,
          customer_name: customerName,
          customer_email: customerEmail || null,
          customer_phone: customerPhone || null,
          is_active: true,
          expires_at: expiresAt,
          created_by: profile?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Portal link created successfully');
      setShowCreateDialog(false);
      resetForm();
      await loadPortalLinks();

      // Auto-copy the link
      const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
      navigator.clipboard.writeText(portalUrl);
      toast.success('Link copied to clipboard!');
    } catch (error: any) {
      console.error('Error creating portal link:', error);
      toast.error('Failed to create portal link');
    }
  }

  function resetForm() {
    setCustomerName(job.client_name || '');
    setCustomerEmail('');
    setCustomerPhone('');
    setExpiresInDays('');
  }

  async function toggleLinkStatus(linkId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('customer_portal_access')
        .update({ is_active: !currentStatus })
        .eq('id', linkId);

      if (error) throw error;
      toast.success(`Link ${!currentStatus ? 'activated' : 'deactivated'}`);
      await loadPortalLinks();
    } catch (error: any) {
      console.error('Error toggling link status:', error);
      toast.error('Failed to update link status');
    }
  }

  async function deleteLink(linkId: string) {
    if (!confirm('Delete this portal access link? The customer will no longer be able to access the portal with this link.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customer_portal_access')
        .delete()
        .eq('id', linkId);

      if (error) throw error;
      toast.success('Link deleted');
      await loadPortalLinks();
    } catch (error: any) {
      console.error('Error deleting link:', error);
      toast.error('Failed to delete link');
    }
  }

  function copyPortalLink(token: string) {
    const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
    navigator.clipboard.writeText(portalUrl);
    setCopied(token);
    toast.success('Link copied to clipboard!');
    
    setTimeout(() => setCopied(null), 2000);
  }

  function openPortalLink(token: string) {
    const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
    window.open(portalUrl, '_blank');
  }

  if (loading) {
    return <div className="text-center py-4">Loading portal links...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Customer Portal Access</h3>
          <p className="text-sm text-muted-foreground">
            Create shareable links for customers to view project details, payments, and photos
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Portal Link
        </Button>
      </div>

      {portalLinks.length > 0 ? (
        <div className="space-y-3">
          {portalLinks.map((link) => {
            const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
            const portalUrl = `${window.location.origin}/customer-portal?token=${link.access_token}`;

            return (
              <Card key={link.id} className={!link.is_active || isExpired ? 'opacity-60' : ''}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{link.customer_name}</h4>
                        {link.is_active && !isExpired ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            Active
                          </Badge>
                        ) : isExpired ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700">
                            Inactive
                          </Badge>
                        )}
                      </div>

                      {link.customer_email && (
                        <p className="text-sm text-muted-foreground">{link.customer_email}</p>
                      )}
                      {link.customer_phone && (
                        <p className="text-sm text-muted-foreground">{link.customer_phone}</p>
                      )}

                      <div className="mt-3 p-3 bg-slate-50 rounded-lg font-mono text-xs break-all">
                        {portalUrl}
                      </div>

                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>Created: {new Date(link.created_at).toLocaleDateString()}</span>
                        {link.expires_at && (
                          <span>Expires: {new Date(link.expires_at).toLocaleDateString()}</span>
                        )}
                        {link.last_accessed_at && (
                          <span>Last accessed: {new Date(link.last_accessed_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyPortalLink(link.access_token)}
                      >
                        {copied === link.access_token ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPortalLink(link.access_token)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleLinkStatus(link.id, link.is_active)}
                      >
                        {link.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteLink(link.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Share2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No customer portal links created yet</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Portal Link
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Portal Link Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Customer Portal Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer Name *</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div>
              <Label>Customer Email (Optional)</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <Label>Customer Phone (Optional)</Label>
              <Input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <Label>Link Expires In (Days)</Label>
              <Input
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="Leave empty for no expiration"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty for a link that never expires
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> The customer will be able to view the proposal, payment history, schedule, documents, and photos for this project.
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={createPortalLink} className="flex-1">
                Create Portal Link
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
