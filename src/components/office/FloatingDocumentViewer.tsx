import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
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
  Upload,
  FolderPlus,
  Folder,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface JobDocumentFolder {
  id: string;
  job_id: string;
  name: string;
  parent_id: string | null;
  order_index: number;
}

interface JobDocument {
  id: string;
  name: string;
  category: string;
  current_version: number;
  latest_file_url?: string;
  created_at: string;
  folder_id?: string | null;
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

const DEFAULT_DOC_CATEGORIES = ['Drawings', 'Specifications', 'Materials', 'Purchase Orders', 'Plans', 'Site Documents', 'Other'];

export function FloatingDocumentViewer({ jobId, open, onClose, embed = false, backLabel = 'Back to Workbook', sketchUpViewerUrl }: FloatingDocumentViewerProps) {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [folders, setFolders] = useState<JobDocumentFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
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
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** When false, job_viewer_links table is missing or inaccessible — links are device-only until script is run */
  const [viewerLinksDbAvailable, setViewerLinksDbAvailable] = useState(true);

  useEffect(() => {
    if (open) {
      loadDocuments();
      loadViewerLinks();
      loadFolders();
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

  async function loadFolders() {
    try {
      const { data, error } = await supabase
        .from('job_document_folders')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      setFolders((data as JobDocumentFolder[]) || []);
    } catch {
      setFolders([]);
    }
  }

  const documentsInFolder = selectedFolderId === null
    ? documents
    : documents.filter((d) => (d as any).folder_id === selectedFolderId);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFilesUpload(files);
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) handleFilesUpload(files);
    e.target.value = '';
  }
  async function handleFilesUpload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    let success = 0;
    try {
      for (const file of files) {
        try {
          if (file.size > 50 * 1024 * 1024) {
            toast.error(`Skipped ${file.name}: over 50 MB`);
            continue;
          }
          const path = `${jobId}/documents/${Date.now()}_${file.name}`;
          const { error: upErr } = await supabase.storage.from('job-files').upload(path, file, { cacheControl: '3600', upsert: false });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage.from('job-files').getPublicUrl(path);
          const name = file.name.replace(/\.[^/.]+$/, '') || file.name;
          const insertPayload: Record<string, unknown> = {
            job_id: jobId,
            name,
            category: DEFAULT_DOC_CATEGORIES[0],
            current_version: 1,
            visible_to_crew: false,
            created_by: profile?.id ?? null,
          };
          if (selectedFolderId != null) insertPayload.folder_id = selectedFolderId;
          const { data: docData, error: docErr } = await supabase
            .from('job_documents')
            .insert(insertPayload)
            .select()
            .single();
          if (docErr) throw docErr;
          const { error: revErr } = await supabase
            .from('job_document_revisions')
            .insert({
              document_id: docData.id,
              version_number: 1,
              file_url: publicUrl,
              revision_description: 'Initial upload',
              uploaded_by: profile?.id ?? null,
            });
          if (revErr) throw revErr;
          success++;
        } catch (err: any) {
          console.error('Upload error:', err);
          toast.error(`${file.name}: ${err?.message || 'Upload failed'}`);
        }
      }
      if (success > 0) {
        toast.success(`Uploaded ${success} file(s)`);
        await loadDocuments();
      }
    } finally {
      setUploading(false);
    }
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const { error } = await supabase
        .from('job_document_folders')
        .insert({ job_id: jobId, name, order_index: folders.length });
      if (error) throw error;
      toast.success('Folder created');
      setShowNewFolderDialog(false);
      setNewFolderName('');
      await loadFolders();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create folder');
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
      setViewerLinksDbAvailable(true);
      const fromDb = (data as JobViewerLink[]) || [];
      if (fromDb.length > 0) {
        setViewerLinks(fromDb);
        return;
      }
      // DB empty: try to migrate any localStorage links into DB so other users can see them
      const fromStorage = loadViewerLinksFromStorage();
      if (fromStorage.length > 0) {
        let migrated = 0;
        for (let i = 0; i < fromStorage.length; i++) {
          const { error: insertErr } = await supabase.from('job_viewer_links').insert({
            job_id: jobId,
            label: fromStorage[i].label,
            url: fromStorage[i].url,
            order_index: fromStorage[i].order_index ?? i,
          });
          if (!insertErr) migrated++;
        }
        if (migrated > 0) {
          saveViewerLinksToStorage([]);
          toast.success(`${migrated} link(s) saved to the database so your team can see them.`);
          const { data: after } = await supabase.from('job_viewer_links').select('*').eq('job_id', jobId).order('order_index', { ascending: true });
          setViewerLinks((after as JobViewerLink[]) || []);
          return;
        }
      }
      setViewerLinks(fromStorage);
    } catch (err: any) {
      console.error('Error loading viewer links:', err);
      setViewerLinksDbAvailable(false);
      const fromStorage = loadViewerLinksFromStorage();
      setViewerLinks(fromStorage);
      const msg = err?.message ?? '';
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('fetch')) {
        toast.info('Links are stored in the database so all users see them. Run scripts/create-job-viewer-links.sql in Supabase SQL Editor.', { duration: 6000 });
      }
    }
  }

  function backToGrid() {
    setSelectedDocId('');
    setSelectedDoc(null);
    setSelectedViewerLink(null);
    setViewMode('grid');
  }

  /** Hosts that block iframe embedding; open these in a new tab instead of the proxy frame. */
  const OPEN_IN_NEW_TAB_HOST_PATTERNS = [
    /postframesolver\.azurewebsites\.net/i,
    /\.azurewebsites\.net/i,
    /smartbuild/i,
  ];

  function shouldOpenViewerInNewTab(url: string): boolean {
    try {
      const parsed = new URL((url || '').trim().replace(/^\/\//, 'https://'));
      const host = parsed.hostname;
      return OPEN_IN_NEW_TAB_HOST_PATTERNS.some((re) => re.test(host));
    } catch {
      return false;
    }
  }

  function openViewerLink(link: JobViewerLink) {
    const url = (link?.url ?? '').trim();
    if (!url) return;
    const normalized = normalizeViewerUrl(url);
    if (shouldOpenViewerInNewTab(normalized)) {
      window.open(normalized, '_blank', 'noopener,noreferrer');
      toast.info(`"${link.label}" opened in a new tab (this link can't be shown in the document view).`);
      return;
    }
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
            toast.success('Link updated on this device only. To share with your team, run scripts/create-job-viewer-links.sql in Supabase SQL Editor.', { duration: 6000 });
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
          toast.success('Link saved on this device only. To share with your team, run scripts/create-job-viewer-links.sql in Supabase SQL Editor.', { duration: 6000 });
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
          {!viewerLinksDbAvailable && (
            <Alert className="mx-3 mt-2 border-blue-300 bg-blue-50 text-blue-900">
              <AlertDescription>
                Other users cannot see viewer links until the database table exists. In Supabase Dashboard go to <strong>SQL Editor</strong> and run: <code className="text-xs bg-blue-100 px-1 rounded">scripts/create-job-viewer-links.sql</code>. Then reload this page.
              </AlertDescription>
            </Alert>
          )}
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
              <div
                className="p-4 flex flex-col gap-3 min-h-0"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    variant={selectedFolderId === null ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedFolderId(null)}
                  >
                    All
                  </Button>
                  {folders.map((f) => (
                    <Button
                      key={f.id}
                      variant={selectedFolderId === f.id ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setSelectedFolderId(f.id)}
                    >
                      <Folder className="w-3 h-3 mr-1" />
                      {f.name}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowNewFolderDialog(true)}>
                    <FolderPlus className="w-3 h-3 mr-1" />
                    New folder
                  </Button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="w-3 h-3 mr-1" />
                    {uploading ? 'Uploading...' : 'Upload files'}
                  </Button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground text-sm">Loading documents...</p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-lg border-2 border-dashed flex-1 min-h-[120px] transition-colors ${
                      isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                    }`}
                  >
                    {documentsInFolder.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-1">
                          {isDragging ? 'Drop files here' : 'Drag and drop files here, or use Upload files'}
                        </p>
                        <p className="text-xs text-muted-foreground">Documents are stored for the job and visible to your team</p>
                      </div>
                    ) : (
                      <div className="p-2 grid grid-cols-1 gap-3">
                        {documentsInFolder.map((doc) => (
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
          <p className="text-sm text-muted-foreground">Add links (e.g. SketchUp, SmartBuild) for this job. Links are stored in the database so all other users see them. If your team doesn’t see these links, run scripts/create-job-viewer-links.sql in Supabase SQL Editor once.
          {!viewerLinksDbAvailable && (
            <span className="mt-2 block text-sm font-medium text-amber-700">Other users cannot see links until an admin runs <code className="text-xs bg-amber-100 px-1 rounded">scripts/create-job-viewer-links.sql</code> in Supabase SQL Editor.</span>
          )}
          </p>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input
                placeholder="e.g. SketchUp, SmartBuild"
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
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Folder name</Label>
            <Input
              placeholder="e.g. Drawings, Invoices"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>Cancel</Button>
              <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
            </div>
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
                <div className="p-4 flex flex-col gap-3" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant={selectedFolderId === null ? 'default' : 'outline'} size="sm" onClick={() => setSelectedFolderId(null)}>All</Button>
                    {folders.map((f) => (
                      <Button key={f.id} variant={selectedFolderId === f.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedFolderId(f.id)}>
                        <Folder className="w-3 h-3 mr-1" />{f.name}
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setShowNewFolderDialog(true)}><FolderPlus className="w-3 h-3 mr-1" />New folder</Button>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Upload className="w-3 h-3 mr-1" />{uploading ? 'Uploading...' : 'Upload files'}
                    </Button>
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-muted-foreground">Loading documents...</p>
                      </div>
                    </div>
                  ) : documentsInFolder.length === 0 ? (
                    <div className={`flex items-center justify-center py-12 rounded-lg border-2 border-dashed ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}>
                      <div className="text-center">
                        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">{isDragging ? 'Drop files here' : 'No documents in this folder. Drag and drop or use Upload files.'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {documentsInFolder.map((doc) => (
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
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Folder name</Label>
            <Input placeholder="e.g. Drawings, Invoices" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createFolder()} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>Cancel</Button>
              <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
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
          <p className="text-sm text-muted-foreground">Add links (e.g. SketchUp, SmartBuild) for this job. Links are stored in the database so all other users see them. If your team doesn’t see these links, run scripts/create-job-viewer-links.sql in Supabase SQL Editor once.
          {!viewerLinksDbAvailable && (
            <span className="mt-2 block text-sm font-medium text-amber-700">Other users cannot see links until an admin runs <code className="text-xs bg-amber-100 px-1 rounded">scripts/create-job-viewer-links.sql</code> in Supabase SQL Editor.</span>
          )}
          </p>
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

        {!viewerLinksDbAvailable && (
          <Alert className="mx-4 mt-2 border-blue-300 bg-blue-50 text-blue-900">
            <AlertDescription>
              Other users cannot see viewer links until the database table exists. In Supabase Dashboard go to <strong>SQL Editor</strong> and run: <code className="text-xs bg-blue-100 px-1 rounded">scripts/create-job-viewer-links.sql</code>. Then reload this page.
            </AlertDescription>
          </Alert>
        )}

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
            <div className="p-4 flex flex-col gap-3" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={selectedFolderId === null ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setSelectedFolderId(null)}>All</Button>
                {folders.map((f) => (
                  <Button key={f.id} variant={selectedFolderId === f.id ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setSelectedFolderId(f.id)}>
                    <Folder className="w-3 h-3 mr-1" />{f.name}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewFolderDialog(true)}><FolderPlus className="w-3 h-3 mr-1" />New folder</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="w-3 h-3 mr-1" />{uploading ? 'Uploading...' : 'Upload files'}
                </Button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm">Loading documents...</p>
                  </div>
                </div>
              ) : documentsInFolder.length === 0 ? (
                <div className={`flex items-center justify-center py-12 rounded-lg border-2 border-dashed ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}>
                  <div className="text-center">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground text-sm">{isDragging ? 'Drop files here' : 'No documents. Drag and drop or use Upload files.'}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {documentsInFolder.map((doc) => (
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
    <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Folder name</Label>
          <Input placeholder="e.g. Drawings, Invoices" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createFolder()} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
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
        <p className="text-sm text-muted-foreground">Add links (e.g. SketchUp, SmartBuild) for this job. Links are stored in the database so all other users see them. If your team doesn’t see these links, run scripts/create-job-viewer-links.sql in Supabase SQL Editor once.
        {!viewerLinksDbAvailable && (
          <span className="mt-2 block text-sm font-medium text-amber-700">Other users cannot see links until an admin runs <code className="text-xs bg-amber-100 px-1 rounded">scripts/create-job-viewer-links.sql</code> in Supabase SQL Editor.</span>
        )}
        </p>
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
