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
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

      // Fetch latest revision URL for each document (resilient: try current_version then latest by version)
      const documentsWithUrls = await Promise.all(
        (data || []).map(async (doc: any) => {
          let fileUrl: string | null = null;
          const { data: byVersion } = await supabase
            .from('job_document_revisions')
            .select('file_url')
            .eq('document_id', doc.id)
            .eq('version_number', doc.current_version)
            .maybeSingle();
          if (byVersion?.file_url) {
            fileUrl = byVersion.file_url;
          } else {
            const { data: latest } = await supabase
              .from('job_document_revisions')
              .select('file_url')
              .eq('document_id', doc.id)
              .order('version_number', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (latest?.file_url) fileUrl = latest.file_url;
          }
          // Use signed URL for job-files storage so private buckets work in iframe/new tab
          let latest_file_url: string | null = fileUrl;
          if (fileUrl && fileUrl.includes('/job-files/')) {
            const after = fileUrl.split('/job-files/')[1];
            const path = after ? after.replace(/\?.*$/, '').trim() : null;
            if (path) {
              const { data: signed } = await supabase.storage.from('job-files').createSignedUrl(path, 60 * 60);
              if (signed?.signedUrl) latest_file_url = signed.signedUrl;
            }
          }
          return {
            ...doc,
            latest_file_url,
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
  /** Same bucket as job documents — one JSON file per job so all users see the same links */
  const VIEWER_LINKS_FILE_PATH = (id: string) => `${id}/viewer-links.json`;

  function loadViewerLinksFromLocalStorage(): JobViewerLink[] {
    try {
      const raw = localStorage.getItem(VIEWER_LINKS_STORAGE_KEY(jobId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as JobViewerLink[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveViewerLinksToLocalStorage(links: JobViewerLink[]) {
    try {
      localStorage.setItem(VIEWER_LINKS_STORAGE_KEY(jobId), JSON.stringify(links));
    } catch (e) {
      console.warn('Could not save viewer links to localStorage', e);
    }
  }

  /** Load viewer links from Supabase Storage (shared for all users, like documents) */
  async function loadViewerLinksFromSupabaseStorage(): Promise<JobViewerLink[] | null> {
    try {
      const { data: blob, error } = await supabase.storage.from('job-files').download(VIEWER_LINKS_FILE_PATH(jobId));
      if (error || !blob) return null;
      const text = await blob.text();
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return null;
      const links = parsed.filter(
        (x): x is JobViewerLink =>
          x != null && typeof x === 'object' && typeof (x as JobViewerLink).id === 'string' && typeof (x as JobViewerLink).label === 'string' && typeof (x as JobViewerLink).url === 'string'
      );
      return links.map((l, i) => ({ ...l, order_index: typeof l.order_index === 'number' ? l.order_index : i }));
    } catch {
      return null;
    }
  }

  /** Save viewer links to Supabase Storage so all users see them (like documents) */
  async function saveViewerLinksToSupabaseStorage(links: JobViewerLink[]): Promise<boolean> {
    try {
      const body = JSON.stringify(links);
      const { error } = await supabase.storage.from('job-files').upload(VIEWER_LINKS_FILE_PATH(jobId), body, {
        contentType: 'application/json',
        upsert: true,
      });
      return !error;
    } catch {
      return false;
    }
  }

  async function loadViewerLinks() {
    try {
      // 1) Prefer Storage (same as documents) — shared for all users, no SQL script needed
      const fromStorage = await loadViewerLinksFromSupabaseStorage();
      if (fromStorage !== null) {
        setViewerLinks(fromStorage);
        return;
      }
      // 2) Optional: table job_viewer_links (if script was run)
      const { data: fromDb, error } = await supabase
        .from('job_viewer_links')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index', { ascending: true });
      if (!error && fromDb && fromDb.length > 0) {
        setViewerLinks(fromDb as JobViewerLink[]);
        return;
      }
      // 3) Migrate localStorage to Storage so other users see them
      const fromLocal = loadViewerLinksFromLocalStorage();
      if (fromLocal.length > 0) {
        const ok = await saveViewerLinksToSupabaseStorage(fromLocal);
        if (ok) {
          saveViewerLinksToLocalStorage([]);
          setViewerLinks(fromLocal);
          return;
        }
      }
      setViewerLinks(fromLocal);
    } catch (err: any) {
      console.error('Error loading viewer links:', err);
      const fromLocal = loadViewerLinksFromLocalStorage();
      setViewerLinks(fromLocal);
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
      const maxOrder = viewerLinks.reduce((m, l) => Math.max(m, l.order_index), -1);
      let newList: JobViewerLink[];
      if (editingLinkId) {
        const idx = viewerLinks.findIndex((l) => l.id === editingLinkId);
        if (idx < 0) {
          toast.error('Could not find link to update.');
          return;
        }
        newList = viewerLinks.map((l) => (l.id === editingLinkId ? { ...l, label, url } : l));
      } else {
        newList = [
          ...viewerLinks,
          { id: crypto.randomUUID(), job_id: jobId, label, url, order_index: maxOrder + 1 },
        ];
      }
      // Save to Storage first (shared for all users, like documents)
      const stored = await saveViewerLinksToSupabaseStorage(newList);
      if (stored) {
        setViewerLinks(newList);
        setManageLinkLabel('');
        setManageLinkUrl('');
        setEditingLinkId(null);
        toast.success(editingLinkId ? 'Link updated' : 'Link added');
        setSavingLink(false);
        return;
      }
      // Fallback: try job_viewer_links table if it exists
      if (editingLinkId) {
        const { error } = await supabase.from('job_viewer_links').update({ label, url, updated_at: new Date().toISOString() }).eq('id', editingLinkId);
        if (!error) {
          await loadViewerLinks();
          setManageLinkLabel('');
          setManageLinkUrl('');
          setEditingLinkId(null);
          toast.success('Link updated');
          setSavingLink(false);
          return;
        }
      } else {
        const { error } = await supabase.from('job_viewer_links').insert({ job_id: jobId, label, url, order_index: maxOrder + 1 });
        if (!error) {
          await loadViewerLinks();
          setManageLinkLabel('');
          setManageLinkUrl('');
          setEditingLinkId(null);
          toast.success('Link added');
          setSavingLink(false);
          return;
        }
      }
      // Last resort: localStorage (device-only)
      saveViewerLinksToLocalStorage(newList);
      setViewerLinks(newList);
      setManageLinkLabel('');
      setManageLinkUrl('');
      setEditingLinkId(null);
      toast.success('Link saved on this device.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save link');
    } finally {
      setSavingLink(false);
    }
  }

  async function deleteViewerLink(id: string) {
    const newList = viewerLinks.filter((l) => l.id !== id);
    if (selectedViewerLink?.id === id) {
      setSelectedViewerLink(null);
      setViewMode('grid');
    }
    try {
      // Prefer Storage (shared for all users)
      const stored = await saveViewerLinksToSupabaseStorage(newList);
      if (stored) {
        setViewerLinks(newList);
        toast.success('Link removed');
        return;
      }
      const { error } = await supabase.from('job_viewer_links').delete().eq('id', id);
      if (!error) {
        await loadViewerLinks();
        toast.success('Link removed');
        return;
      }
      throw new Error(error.message);
    } catch {
      saveViewerLinksToLocalStorage(newList);
      setViewerLinks(newList);
      toast.success('Link removed.');
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
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(selectedDoc.latest_file_url!, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in new tab
                  </Button>
                  <Button onClick={downloadDocument} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </>
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
                  <div className="h-full flex flex-col min-h-[300px]">
                    <iframe
                      src={selectedDoc.latest_file_url}
                      className="w-full flex-1 min-h-[280px] border-0"
                      title={selectedDoc.name}
                    />
                    <div className="px-3 py-2 bg-slate-100 border-t flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        Document not displaying? Open it in a new tab to view or download.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={() => window.open(selectedDoc.latest_file_url!, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Open in new tab
                      </Button>
                    </div>
                  </div>
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
