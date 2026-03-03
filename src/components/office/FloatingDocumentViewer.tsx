import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  X,
  Minimize2,
  Maximize2,
  Eye,
  Download,
  ArrowLeft,
  Grid3x3,
  Box,
  Link as LinkIcon,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface JobDocument {
  id: string;
  name: string;
  category: string;
  current_version: number;
  latest_file_url?: string;
  created_at: string;
}

export interface JobViewerLink {
  id: string;
  job_id: string;
  label: string;
  url: string;
  order_index: number;
  created_at?: string;
}

interface FloatingDocumentViewerProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
  /** When true, render in-place (no fixed position) so parent can show alongside proposal; show Back button instead of minimize/fullscreen */
  embed?: boolean;
  /** Label for the back/close button when embed is true */
  backLabel?: string;
  /** Optional single URL to show as a viewer link (legacy; prefer adding links per job via Manage links) */
  sketchUpViewerUrl?: string;
}

export function FloatingDocumentViewer({ jobId, open, onClose, embed = false, backLabel = 'Back to Workbook', sketchUpViewerUrl }: FloatingDocumentViewerProps) {
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [selectedDoc, setSelectedDoc] = useState<JobDocument | null>(null);
  const [viewerLinks, setViewerLinks] = useState<JobViewerLink[]>([]);
  const [selectedViewerLink, setSelectedViewerLink] = useState<JobViewerLink | null>(null);
  const [showManageLinks, setShowManageLinks] = useState(false);
  const [manageLinkLabel, setManageLinkLabel] = useState('');
  const [manageLinkUrl, setManageLinkUrl] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'viewer' | 'sketchup'>('grid');

  useEffect(() => {
    if (open) {
      loadDocuments();
      loadViewerLinks();
    }
  }, [jobId, open]);

  useEffect(() => {
    if (selectedDocId) {
      const doc = documents.find(d => d.id === selectedDocId);
      setSelectedDoc(doc || null);
      setViewMode('viewer');
    } else {
      setSelectedDoc(null);
      setViewMode('grid');
    }
  }, [selectedDocId, documents]);

  async function loadDocuments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('job_documents')
        .select('*')
        .eq('job_id', jobId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Fetch latest revision URL for each document
      const documentsWithUrls = await Promise.all(
        (data || []).map(async (doc: any) => {
          const { data: latestRevision } = await supabase
            .from('job_document_revisions')
            .select('file_url')
            .eq('document_id', doc.id)
            .eq('version_number', doc.current_version)
            .single();

          return {
            ...doc,
            latest_file_url: latestRevision?.file_url || null,
          };
        })
      );

      setDocuments(documentsWithUrls);
    } catch (error: any) {
      console.error('Error loading documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  function downloadDocument() {
    if (selectedDoc?.latest_file_url) {
      const link = document.createElement('a');
      link.href = selectedDoc.latest_file_url;
      link.download = selectedDoc.name;
      link.click();
    }
  }

  function selectDocument(docId: string) {
    setSelectedDocId(docId);
  }

  const VIEWER_LINKS_STORAGE_KEY = (id: string) => `job_viewer_links_${id}`;

  function loadViewerLinksFromStorage(): JobViewerLink[] {
    try {
      const raw = localStorage.getItem(VIEWER_LINKS_STORAGE_KEY(jobId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as JobViewerLink[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveViewerLinksToStorage(links: JobViewerLink[]) {
    try {
      localStorage.setItem(VIEWER_LINKS_STORAGE_KEY(jobId), JSON.stringify(links));
    } catch (e) {
      console.warn('Could not save viewer links to localStorage', e);
    }
  }

  async function loadViewerLinks() {
    try {
      const { data, error } = await supabase
        .from('job_viewer_links')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      const fromDb = (data as JobViewerLink[]) || [];
      if (fromDb.length > 0) {
        setViewerLinks(fromDb);
        return;
      }
      const fromStorage = loadViewerLinksFromStorage();
      setViewerLinks(fromStorage);
    } catch (err: any) {
      console.error('Error loading viewer links:', err);
      const fromStorage = loadViewerLinksFromStorage();
      setViewerLinks(fromStorage);
    }
  }

  function backToGrid() {
    setSelectedDocId('');
    setSelectedDoc(null);
    setSelectedViewerLink(null);
    setViewMode('grid');
  }

  function openViewerLink(link: JobViewerLink) {
    setSelectedViewerLink(link);
    setViewMode('sketchup');
  }

  function openLegacyViewerUrl() {
    const url = (sketchUpViewerUrl ?? (import.meta.env.VITE_SKETCHUP_VIEWER_URL as string) ?? '').trim();
    if (!url) return;
    setSelectedViewerLink({ id: '', job_id: jobId, label: '3D Viewer', url, order_index: 0 });
    setViewMode('sketchup');
  }

  const effectiveViewerLinks = viewerLinks.length > 0 ? viewerLinks : [];
  const legacyViewerUrl = (sketchUpViewerUrl ?? (import.meta.env.VITE_SKETCHUP_VIEWER_URL as string) ?? '').trim();

  /** Normalize viewer URL so iframe loads reliably: trim, ensure protocol, strip default port :443. */
  function normalizeViewerUrl(raw: string): string {
    const s = (raw ?? '').trim();
    if (!s) return '';
    let url = s;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && parsed.port === '443') {
        parsed.port = '';
        return parsed.toString();
      }
      if (parsed.protocol === 'http:' && parsed.port === '80') {
        parsed.port = '';
        return parsed.toString();
      }
      return url;
    } catch {
      return url;
    }
  }

  const currentViewerUrl = normalizeViewerUrl(selectedViewerLink?.url ?? '');

  async function saveViewerLink() {
    const label = manageLinkLabel.trim();
    const url = manageLinkUrl.trim();
    if (!label || !url) {
      toast.error('Label and URL are required');
      return;
    }
    setSavingLink(true);
    try {
      if (editingLinkId) {
        const { error } = await supabase
          .from('job_viewer_links')
          .update({ label, url, updated_at: new Date().toISOString() })
          .eq('id', editingLinkId);
        if (error) throw error;
        toast.success('Link updated');
        setManageLinkLabel('');
        setManageLinkUrl('');
        setEditingLinkId(null);
        await loadViewerLinks();
      } else {
        const maxOrder = viewerLinks.reduce((m, l) => Math.max(m, l.order_index), -1);
        const { error } = await supabase
          .from('job_viewer_links')
          .insert({ job_id: jobId, label, url, order_index: maxOrder + 1 });
        if (error) throw error;
        toast.success('Link added');
        setManageLinkLabel('');
        setManageLinkUrl('');
        setEditingLinkId(null);
        await loadViewerLinks();
      }
    } catch (e: any) {
      const msg = e?.message ?? '';
      const isNetworkOrMissingTable = msg === 'Failed to fetch' || msg.includes('fetch') || msg.includes('does not exist') || msg.includes('relation');
      if (isNetworkOrMissingTable) {
        // Fallback: save to localStorage so the feature still works
        const list = loadViewerLinksFromStorage();
        const maxOrder = list.reduce((m, l) => Math.max(m, l.order_index), -1);
        if (editingLinkId) {
          const idx = list.findIndex((l) => l.id === editingLinkId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], label, url };
            saveViewerLinksToStorage(list);
            setViewerLinks(list);
            setManageLinkLabel('');
            setManageLinkUrl('');
            setEditingLinkId(null);
            toast.success('Link updated (saved locally). Run the SQL script in Supabase to use the database.');
          } else {
            toast.error('Could not find link to update.');
          }
        } else {
          const newLink: JobViewerLink = {
            id: crypto.randomUUID(),
            job_id: jobId,
            label,
            url,
            order_index: maxOrder + 1,
          };
          list.push(newLink);
          saveViewerLinksToStorage(list);
          setViewerLinks(list);
          setManageLinkLabel('');
          setManageLinkUrl('');
          setEditingLinkId(null);
          toast.success('Link saved locally. It will appear in the list. Run scripts/create-job-viewer-links.sql in Supabase to save to the database.');
        }
      } else {
        toast.error(msg || 'Failed to save link');
      }
    } finally {
      setSavingLink(false);
    }
  }

  async function deleteViewerLink(id: string) {
    try {
      const { error } = await supabase.from('job_viewer_links').delete().eq('id', id);
      if (error) throw error;
      if (selectedViewerLink?.id === id) {
        setSelectedViewerLink(null);
        setViewMode('grid');
      }
      toast.success('Link removed');
      await loadViewerLinks();
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg === 'Failed to fetch' || msg.includes('fetch')) {
        const list = loadViewerLinksFromStorage().filter((l) => l.id !== id);
        saveViewerLinksToStorage(list);
        setViewerLinks(list);
        if (selectedViewerLink?.id === id) {
          setSelectedViewerLink(null);
          setViewMode('grid');
        }
        toast.success('Link removed from local list.');
      } else {
        toast.error(msg || 'Failed to delete link');
      }
    }
  }

  function startEditLink(link: JobViewerLink) {
    setEditingLinkId(link.id);
    setManageLinkLabel(link.label);
    setManageLinkUrl(link.url);
  }

  function cancelEditLink() {
    setEditingLinkId(null);
    setManageLinkLabel('');
    setManageLinkUrl('');
  }

  if (!open) return null;

  // In-place embedded view (replaces workbook panel so user sees documents alongside proposal)
  if (embed) {
    return (
      <>
      <div className="flex flex-col h-full min-h-0 w-full">
        <Card className="h-full flex flex-col border-2 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Documents
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {backLabel}
              </Button>
            </div>
          </CardHeader>
          <div className="p-3 border-b bg-slate-50 flex-shrink-0">
            <div className="flex items-center gap-2">
              {(viewMode === 'viewer' || viewMode === 'sketchup') && (
                <Button onClick={backToGrid} variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              )}
              <div className="flex-1 min-w-0">
                {viewMode === 'viewer' && selectedDoc && (
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium text-sm truncate">{selectedDoc.name}</span>
                    <Badge variant="outline" className="text-xs flex-shrink-0">{selectedDoc.category}</Badge>
                  </div>
                )}
                {viewMode === 'sketchup' && selectedViewerLink && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Box className="w-4 h-4" />
                    <span>{selectedViewerLink.label}</span>
                  </div>
                )}
                {viewMode === 'grid' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                    <Grid3x3 className="w-4 h-4" />
                    <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
                    {effectiveViewerLinks.map((link) => (
                      <Button key={link.id} onClick={() => openViewerLink(link)} variant="outline" size="sm" className="h-7 text-xs">
                        <Box className="w-3.5 h-3.5 mr-1" />
                        {link.label}
                      </Button>
                    ))}
                    {legacyViewerUrl && effectiveViewerLinks.length === 0 && (
                      <Button onClick={openLegacyViewerUrl} variant="outline" size="sm" className="h-7 text-xs">
                        <Box className="w-3.5 h-3.5 mr-1" />
                        3D Viewer
                      </Button>
                    )}
                    <Button onClick={() => setShowManageLinks(true)} variant="outline" size="sm" className="h-7 text-xs">
                      <LinkIcon className="w-3.5 h-3.5 mr-1" />
                      Manage links
                    </Button>
                  </div>
                )}
              </div>
              {selectedDoc?.latest_file_url && viewMode === 'viewer' && (
                <Button onClick={downloadDocument} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </div>
          <CardContent className="flex-1 p-0 overflow-auto min-h-0">
            {viewMode === 'sketchup' && currentViewerUrl ? (
              <div className="h-full min-h-[300px] bg-slate-100 flex flex-col">
                <iframe
                  src={currentViewerUrl}
                  className="w-full flex-1 min-h-[280px] border-0"
                  title={selectedViewerLink?.label ?? 'Viewer'}
                  allow="fullscreen"
                  referrerPolicy="no-referrer"
                />
                <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-amber-800">
                    Blank? This site may block embedding. Click to open in a new tab:
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => window.open(currentViewerUrl, '_blank', 'noopener,noreferrer')}>
                    <LinkIcon className="w-3 h-3 mr-1" />
                    Open in new tab
                  </Button>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground text-sm">Loading documents...</p>
                    </div>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground text-sm">No documents available</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {documents.map((doc) => (
                      <Card
                        key={doc.id}
                        className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-400 overflow-hidden"
                        onClick={() => selectDocument(doc.id)}
                      >
                        <div className="flex gap-3">
                          <div className="w-32 h-32 bg-slate-100 relative flex-shrink-0">
                            {doc.latest_file_url ? (
                              <iframe
                                src={doc.latest_file_url}
                                className="w-full h-full border-0 pointer-events-none scale-50 origin-top-left"
                                style={{ width: '200%', height: '200%' }}
                                title={doc.name}
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <FileText className="w-12 h-12 text-muted-foreground opacity-30" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/10" />
                          </div>
                          <div className="flex-1 py-3 pr-3 min-w-0">
                            <p className="font-semibold text-sm truncate mb-1">{doc.name}</p>
                            <Badge variant="outline" className="text-xs mb-2">
                              {doc.category}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              Version {doc.current_version}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full min-h-[300px] bg-slate-100">
                {!selectedDoc ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">No document selected</p>
                    </div>
                  </div>
                ) : !selectedDoc.latest_file_url ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">No file available</p>
                  </div>
                ) : (
                  <iframe
                    src={selectedDoc.latest_file_url}
                    className="w-full h-full min-h-[300px] border-0"
                    title={selectedDoc.name}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={showManageLinks} onOpenChange={setShowManageLinks}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Viewer links
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Add links (e.g. SketchUp 3D, SmartBuild, blueprints) to open in the Documents panel for this job.</p>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input
                placeholder="e.g. SketchUp 3D, SmartBuild"
                value={manageLinkLabel}
                onChange={(e) => setManageLinkLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>URL</Label>
              <Input
                placeholder="https://..."
                value={manageLinkUrl}
                onChange={(e) => setManageLinkUrl(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveViewerLink} disabled={savingLink}>
                {editingLinkId ? 'Update' : 'Add'} link
              </Button>
              {editingLinkId && (
                <Button variant="outline" onClick={cancelEditLink}>Cancel</Button>
              )}
            </div>
          </div>
          <div className="border-t pt-3 mt-3 space-y-2 max-h-48 overflow-y-auto">
            {viewerLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links yet. Add one above.</p>
            ) : (
              viewerLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{link.label}</span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground truncate block hover:underline cursor-pointer">{link.url}</a>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEditLink(link)} className="h-8 w-8 p-0">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteViewerLink(link.id)} className="h-8 w-8 p-0 text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
    );
  }

  // Minimized view - small floating button
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="bg-blue-600 hover:bg-blue-700 shadow-lg"
        >
          <FileText className="w-4 h-4 mr-2" />
          {selectedDoc ? selectedDoc.name : 'Documents'}
          <Maximize2 className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  // Fullscreen view - modal dialog
  if (isFullscreen) {
    return (
      <>
      <Dialog open={true} onOpenChange={() => setIsFullscreen(false)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
          <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Document Viewer
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullscreen(false)}
                  className="text-white hover:bg-white/20"
                >
                  <Minimize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col h-[85vh]">
            {/* Toolbar */}
            <div className="p-4 border-b bg-slate-50">
              <div className="flex items-center gap-3">
                {(viewMode === 'viewer' || viewMode === 'sketchup') && (
                  <Button
                    onClick={backToGrid}
                    variant="outline"
                    size="sm"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Documents
                  </Button>
                )}
                <div className="flex-1">
                  {viewMode === 'viewer' && selectedDoc && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span className="font-medium">{selectedDoc.name}</span>
                      <Badge variant="outline">{selectedDoc.category}</Badge>
                    </div>
                  )}
                  {viewMode === 'sketchup' && selectedViewerLink && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Box className="w-4 h-4" />
                      <span>{selectedViewerLink.label}</span>
                    </div>
                  )}
                  {viewMode === 'grid' && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      <Grid3x3 className="w-4 h-4" />
                      <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
                      {effectiveViewerLinks.map((link) => (
                        <Button key={link.id} onClick={() => openViewerLink(link)} variant="outline" size="sm" className="ml-1">
                          <Box className="w-4 h-4 mr-1" />
                          {link.label}
                        </Button>
                      ))}
                      {legacyViewerUrl && effectiveViewerLinks.length === 0 && (
                        <Button onClick={openLegacyViewerUrl} variant="outline" size="sm" className="ml-1">
                          <Box className="w-4 h-4 mr-1" />
                          3D Viewer
                        </Button>
                      )}
                      <Button onClick={() => setShowManageLinks(true)} variant="outline" size="sm" className="ml-1">
                        <LinkIcon className="w-4 h-4 mr-1" />
                        Manage links
                      </Button>
                    </div>
                  )}
                </div>
                {selectedDoc?.latest_file_url && viewMode === 'viewer' && (
                  <Button
                    onClick={downloadDocument}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {viewMode === 'sketchup' && currentViewerUrl ? (
                <div className="h-full bg-slate-100 flex flex-col">
                  <iframe
                    src={currentViewerUrl}
                    className="w-full flex-1 border-0 min-h-[60vh]"
                    title={selectedViewerLink?.label ?? 'Viewer'}
                    allow="fullscreen"
                    referrerPolicy="no-referrer"
                  />
                  <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-amber-800">
                      Blank? This site may block embedding. Click to open in a new tab:
                    </p>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => window.open(currentViewerUrl, '_blank', 'noopener,noreferrer')}>
                      <LinkIcon className="w-3 h-3 mr-1" />
                      Open in new tab
                    </Button>
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="p-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-muted-foreground">Loading documents...</p>
                      </div>
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No documents available for this job</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {documents.map((doc) => (
                        <Card
                          key={doc.id}
                          className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-blue-400"
                          onClick={() => selectDocument(doc.id)}
                        >
                          <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                            {doc.latest_file_url ? (
                              <iframe
                                src={doc.latest_file_url}
                                className="w-full h-full border-0 pointer-events-none"
                                title={doc.name}
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <FileText className="w-16 h-16 text-muted-foreground opacity-30" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end">
                              <div className="p-3 w-full">
                                <p className="text-white font-semibold text-sm truncate">{doc.name}</p>
                              </div>
                            </div>
                            <div className="absolute top-2 right-2">
                              <Badge className="bg-white/90 text-slate-900 hover:bg-white">
                                {doc.category}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full bg-slate-100">
                  {!selectedDoc ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No document selected</p>
                      </div>
                    </div>
                  ) : !selectedDoc.latest_file_url ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">No file available</p>
                    </div>
                  ) : (
                    <iframe
                      src={selectedDoc.latest_file_url}
                      className="w-full h-full border-0"
                      title={selectedDoc.name}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showManageLinks} onOpenChange={setShowManageLinks}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Viewer links
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Add links (e.g. SketchUp 3D, SmartBuild, blueprints) to open in the Documents panel for this job.</p>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input placeholder="e.g. SketchUp 3D, SmartBuild" value={manageLinkLabel} onChange={(e) => setManageLinkLabel(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>URL</Label>
              <Input placeholder="https://..." value={manageLinkUrl} onChange={(e) => setManageLinkUrl(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveViewerLink} disabled={savingLink}>{editingLinkId ? 'Update' : 'Add'} link</Button>
              {editingLinkId && <Button variant="outline" onClick={cancelEditLink}>Cancel</Button>}
            </div>
          </div>
          <div className="border-t pt-3 mt-3 space-y-2 max-h-48 overflow-y-auto">
            {viewerLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links yet. Add one above.</p>
            ) : (
              viewerLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{link.label}</span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground truncate block hover:underline cursor-pointer">{link.url}</a>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEditLink(link)} className="h-8 w-8 p-0"><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteViewerLink(link.id)} className="h-8 w-8 p-0 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  // Default view - floating panel (right side)
  return (
    <>
    <div className="fixed top-20 right-4 w-[500px] h-[calc(100vh-120px)] z-40 shadow-2xl rounded-lg overflow-hidden border-2 border-blue-500">
      <Card className="h-full flex flex-col">
        {/* Header */}
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documents
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(true)}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(true)}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
                title="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Toolbar */}
        <div className="p-4 border-b bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            {(viewMode === 'viewer' || viewMode === 'sketchup') && (
              <Button
                onClick={backToGrid}
                variant="outline"
                size="sm"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            <div className="flex-1 min-w-0">
              {viewMode === 'viewer' && selectedDoc && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium text-sm truncate">{selectedDoc.name}</span>
                  <Badge variant="outline" className="text-xs">{selectedDoc.category}</Badge>
                </div>
              )}
              {viewMode === 'sketchup' && selectedViewerLink && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Box className="w-4 h-4" />
                  <span>{selectedViewerLink.label}</span>
                </div>
              )}
              {viewMode === 'grid' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  <Grid3x3 className="w-4 h-4" />
                  <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
                  {effectiveViewerLinks.map((link) => (
                    <Button key={link.id} onClick={() => openViewerLink(link)} variant="outline" size="sm" className="h-7 text-xs ml-1">
                      <Box className="w-3.5 h-3.5 mr-1" />
                      {link.label}
                    </Button>
                  ))}
                  {legacyViewerUrl && effectiveViewerLinks.length === 0 && (
                    <Button onClick={openLegacyViewerUrl} variant="outline" size="sm" className="h-7 text-xs ml-1">
                      <Box className="w-3.5 h-3.5 mr-1" />
                      3D Viewer
                    </Button>
                  )}
                  <Button onClick={() => setShowManageLinks(true)} variant="outline" size="sm" className="h-7 text-xs ml-1">
                    <LinkIcon className="w-3.5 h-3.5 mr-1" />
                    Manage links
                  </Button>
                </div>
              )}
            </div>
            {selectedDoc?.latest_file_url && viewMode === 'viewer' && (
              <Button
                onClick={downloadDocument}
                variant="outline"
                size="sm"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <CardContent className="flex-1 p-0 overflow-auto">
          {viewMode === 'sketchup' && currentViewerUrl ? (
            <div className="h-full min-h-[300px] bg-slate-100 flex flex-col">
              <iframe
                src={currentViewerUrl}
                className="w-full flex-1 min-h-[280px] border-0"
                title={selectedViewerLink?.label ?? 'Viewer'}
                allow="fullscreen"
                referrerPolicy="no-referrer"
              />
              <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-amber-800">
                  Blank? This site may block embedding. Click to open in a new tab:
                </p>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => window.open(currentViewerUrl, '_blank', 'noopener,noreferrer')}>
                  <LinkIcon className="w-3 h-3 mr-1" />
                  Open in new tab
                </Button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm">Loading documents...</p>
                  </div>
                </div>
              ) : documents.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground text-sm">No documents available</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {documents.map((doc) => (
                    <Card
                      key={doc.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-blue-400 overflow-hidden"
                      onClick={() => selectDocument(doc.id)}
                    >
                      <div className="flex gap-3">
                        <div className="w-32 h-32 bg-slate-100 relative flex-shrink-0">
                          {doc.latest_file_url ? (
                            <iframe
                              src={doc.latest_file_url}
                              className="w-full h-full border-0 pointer-events-none scale-50 origin-top-left"
                              style={{ width: '200%', height: '200%' }}
                              title={doc.name}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <FileText className="w-12 h-12 text-muted-foreground opacity-30" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/10" />
                        </div>
                        <div className="flex-1 py-3 pr-3 min-w-0">
                          <p className="font-semibold text-sm truncate mb-1">{doc.name}</p>
                          <Badge variant="outline" className="text-xs mb-2">
                            {doc.category}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Version {doc.current_version}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full bg-slate-100">
              {!selectedDoc ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No document selected</p>
                  </div>
                </div>
              ) : !selectedDoc.latest_file_url ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No file available</p>
                </div>
              ) : (
                <iframe
                  src={selectedDoc.latest_file_url}
                  className="w-full h-full border-0"
                  title={selectedDoc.name}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    <Dialog open={showManageLinks} onOpenChange={setShowManageLinks}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Viewer links
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Add links (e.g. SketchUp 3D, SmartBuild, blueprints) to open in the Documents panel for this job.</p>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Label</Label>
            <Input placeholder="e.g. SketchUp 3D, SmartBuild" value={manageLinkLabel} onChange={(e) => setManageLinkLabel(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>URL</Label>
            <Input placeholder="https://..." value={manageLinkUrl} onChange={(e) => setManageLinkUrl(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={saveViewerLink} disabled={savingLink}>{editingLinkId ? 'Update' : 'Add'} link</Button>
            {editingLinkId && <Button variant="outline" onClick={cancelEditLink}>Cancel</Button>}
          </div>
        </div>
        <div className="border-t pt-3 mt-3 space-y-2 max-h-48 overflow-y-auto">
          {viewerLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet. Add one above.</p>
          ) : (
            viewerLinks.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{link.label}</span>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground truncate block hover:underline cursor-pointer">{link.url}</a>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => startEditLink(link)} className="h-8 w-8 p-0"><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteViewerLink(link.id)} className="h-8 w-8 p-0 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
