import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Upload,
  History,
  FileUp,
  Trash2,
  Clock,
  User,
  FolderPlus,
  X,
  Plus,
  Eye,
  EyeOff,
  Edit2,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface JobDocument {
  id: string;
  job_id: string;
  name: string;
  category: string;
  current_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  visible_to_crew: boolean;
  latest_file_url?: string;
}

interface DocumentRevision {
  id: string;
  document_id: string;
  version_number: number;
  file_url: string;
  revision_description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  uploader_name?: string;
}

interface PendingUpload {
  file: File;
  id: string;
  name: string;
  category: string;
  visible_to_crew: boolean;
}

interface JobDocumentsProps {
  job: Job;
  onUpdate: () => void;
}

const DEFAULT_CATEGORIES = [
  'Drawings',
  'Specifications',
  'Materials',
  'Purchase Orders',
  'Plans',
  'Site Documents',
  'Other',
];

export function JobDocuments({ job, onUpdate }: JobDocumentsProps) {
  const { profile } = useAuth();
  const isOffice = profile?.role === 'office';

  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Category management
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);

  // Upload mode
  const [uploadMode, setUploadMode] = useState<'new' | 'revision' | 'bulk' | null>(null);

  // Bulk upload state
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New document state
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('');
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [newDocNotes, setNewDocNotes] = useState('');

  // Revision state
  const [selectedDocForRevision, setSelectedDocForRevision] = useState('');
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionDescription, setRevisionDescription] = useState('');

  // Revision log
  const [showRevisionLog, setShowRevisionLog] = useState(false);
  const [revisionLogDocId, setRevisionLogDocId] = useState('');
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);

  // Delete
  const [deletingDoc, setDeletingDoc] = useState<JobDocument | null>(null);

  // Upload loading
  const [uploading, setUploading] = useState(false);
  
  // Edit mode for documents
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  
  // Document viewer state
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    loadDocuments();
    loadCategories();
  }, [job.id]);

  async function loadCategories() {
    try {
      // Get unique categories from existing documents for this job
      const { data, error } = await supabase
        .from('job_documents')
        .select('category')
        .eq('job_id', job.id);

      if (error) throw error;

      // Extract unique categories
      const uniqueCategories = new Set<string>(DEFAULT_CATEGORIES);
      (data || []).forEach((doc: any) => {
        if (doc.category) {
          uniqueCategories.add(doc.category);
        }
      });

      setCategories(Array.from(uniqueCategories).sort());
    } catch (error: any) {
      console.error('Error loading categories:', error);
    }
  }

  async function loadDocuments() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('job_documents')
        .select('*')
        .eq('job_id', job.id)
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

  async function loadRevisions(documentId: string) {
    try {
      const { data: revisionsData, error: revisionsError } = await supabase
        .from('job_document_revisions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false });

      if (revisionsError) throw revisionsError;

      // Get uploader names
      const uploaderIds = [...new Set(revisionsData?.map(r => r.uploaded_by).filter(Boolean))];

      if (uploaderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('id, username')
          .in('id', uploaderIds);

        const profileMap = new Map(profilesData?.map(p => [p.id, p.username]) || []);

        const revisionsWithNames = (revisionsData || []).map(r => ({
          ...r,
          uploader_name: r.uploaded_by ? profileMap.get(r.uploaded_by) : null,
        }));

        setRevisions(revisionsWithNames);
      } else {
        setRevisions(revisionsData || []);
      }
    } catch (error: any) {
      console.error('Error loading revisions:', error);
      toast.error('Failed to load revision history');
    }
  }

  function openRevisionLog(documentId: string) {
    setRevisionLogDocId(documentId);
    loadRevisions(documentId);
    setShowRevisionLog(true);
  }

  function openNewDocument() {
    setUploadMode('new');
    setNewDocName('');
    setNewDocCategory('');
    setNewDocFile(null);
    setNewDocNotes('');
  }

  function openRevisionUpload() {
    setUploadMode('revision');
    setSelectedDocForRevision('');
    setRevisionFile(null);
    setRevisionDescription('');
  }

  function openBulkUpload() {
    setUploadMode('bulk');
    setPendingUploads([]);
  }

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
    handleFiles(files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  }

  function handleFiles(files: File[]) {
    const newUploads: PendingUpload[] = files.map(file => ({
      file,
      id: Math.random().toString(36).substring(7),
      name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      category: DEFAULT_CATEGORIES[0],
      visible_to_crew: false, // Default to hidden from crew
    }));

    setPendingUploads(prev => [...prev, ...newUploads]);
  }

  function removePendingUpload(id: string) {
    setPendingUploads(prev => prev.filter(u => u.id !== id));
  }

  function updatePendingUpload(id: string, updates: Partial<PendingUpload>) {
    setPendingUploads(prev => prev.map(u => 
      u.id === id ? { ...u, ...updates } : u
    ));
  }

  async function processBulkUploads() {
    if (pendingUploads.length === 0) {
      toast.error('No files to upload');
      return;
    }

    try {
      setUploading(true);
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const upload of pendingUploads) {
        try {
          console.log('Uploading file:', upload.name, 'Size:', upload.file.size, 'bytes');
          
          // Check file size (50 MB limit)
          if (upload.file.size > 52428800) {
            throw new Error(`File size (${(upload.file.size / 1024 / 1024).toFixed(2)} MB) exceeds 50 MB limit`);
          }

          // Upload file to storage
          const fileExt = upload.file.name.split('.').pop();
          const timestamp = Date.now();
          const fileName = `${job.id}/documents/${timestamp}_${upload.file.name}`;

          console.log('Uploading to path:', fileName);

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('job-files')
            .upload(fileName, upload.file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Storage upload error:', uploadError);
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          console.log('Upload successful, getting public URL...');

          const { data: { publicUrl } } = supabase.storage
            .from('job-files')
            .getPublicUrl(fileName);

          console.log('Public URL:', publicUrl);

          // Create document record
          const { data: docData, error: docError } = await supabase
            .from('job_documents')
            .insert({
              job_id: job.id,
              name: upload.name.trim(),
              category: upload.category,
              current_version: 1,
              visible_to_crew: upload.visible_to_crew,
              created_by: profile?.id,
            })
            .select()
            .single();

          if (docError) {
            console.error('Document creation error:', docError);
            throw new Error(`Database error: ${docError.message}`);
          }

          console.log('Document record created:', docData.id);

          // Create first revision (v1)
          const { error: revError } = await supabase
            .from('job_document_revisions')
            .insert({
              document_id: docData.id,
              version_number: 1,
              file_url: publicUrl,
              revision_description: 'Initial upload',
              uploaded_by: profile?.id,
            });

          if (revError) {
            console.error('Revision creation error:', revError);
            throw new Error(`Revision error: ${revError.message}`);
          }

          console.log('✓ Successfully uploaded:', upload.name);
          successCount++;
        } catch (error: any) {
          console.error(`Failed to upload ${upload.name}:`, error);
          errors.push(`${upload.name}: ${error.message || 'Unknown error'}`);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}`);
      }
      if (failCount > 0) {
        toast.error(
          `Failed to upload ${failCount} document${failCount > 1 ? 's' : ''}`,
          { 
            description: errors.length > 0 ? errors.slice(0, 3).join('\n') : undefined,
            duration: 10000 
          }
        );
        console.error('Upload errors:', errors);
      }

      if (successCount > 0) {
        setUploadMode(null);
        setPendingUploads([]);
        loadDocuments();
        loadCategories();
        onUpdate();
      }
    } catch (error: any) {
      console.error('Bulk upload error:', error);
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`, { duration: 10000 });
    } finally {
      setUploading(false);
    }
  }

  function startEditDocument(doc: JobDocument) {
    setEditingDocId(doc.id);
    setEditName(doc.name);
    setEditCategory(doc.category);
  }

  async function saveDocumentEdits(docId: string) {
    try {
      const { error } = await supabase
        .from('job_documents')
        .update({
          name: editName.trim(),
          category: editCategory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);

      if (error) throw error;

      toast.success('Document updated');
      setEditingDocId(null);
      loadDocuments();
    } catch (error: any) {
      console.error('Error updating document:', error);
      toast.error('Failed to update document');
    }
  }

  async function toggleCrewVisibility(docId: string, currentValue: boolean) {
    try {
      const { error } = await supabase
        .from('job_documents')
        .update({
          visible_to_crew: !currentValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);

      if (error) throw error;

      toast.success(!currentValue ? 'Document is now visible to crew' : 'Document hidden from crew');
      loadDocuments();
    } catch (error: any) {
      console.error('Error toggling visibility:', error);
      toast.error('Failed to update visibility');
    }
  }

  async function uploadNewDocument() {
    if (!isOffice) {
      toast.error('Only office staff can upload documents');
      return;
    }

    if (!newDocName.trim() || !newDocCategory || !newDocFile) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setUploading(true);

      const fileExt = newDocFile.name.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${job.id}/documents/${timestamp}_${newDocFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(fileName, newDocFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('job-files')
        .getPublicUrl(fileName);

      // Create document record
      const { data: docData, error: docError } = await supabase
        .from('job_documents')
        .insert({
          job_id: job.id,
          name: newDocName.trim(),
          category: newDocCategory,
          current_version: 1,
          visible_to_crew: false, // Default to hidden
          created_by: profile?.id,
        })
        .select()
        .single();

      if (docError) throw docError;

      // Create first revision (v1)
      const { error: revError } = await supabase
        .from('job_document_revisions')
        .insert({
          document_id: docData.id,
          version_number: 1,
          file_url: publicUrl,
          revision_description: newDocNotes.trim() || 'Initial upload',
          uploaded_by: profile?.id,
        });

      if (revError) throw revError;

      toast.success('Document uploaded successfully');
      setUploadMode(null);
      loadDocuments();
      onUpdate();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function uploadRevision() {
    if (!isOffice) {
      toast.error('Only office staff can upload revisions');
      return;
    }

    if (!selectedDocForRevision || !revisionFile || !revisionDescription.trim()) {
      toast.error('Please select document, upload file, and enter revision description');
      return;
    }

    try {
      setUploading(true);

      // Get current document
      const document = documents.find(d => d.id === selectedDocForRevision);
      if (!document) throw new Error('Document not found');

      const newVersion = document.current_version + 1;

      // Upload file to storage
      const fileExt = revisionFile.name.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${job.id}/documents/${timestamp}_v${newVersion}_${revisionFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(fileName, revisionFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('job-files')
        .getPublicUrl(fileName);

      // Create revision record
      const { error: revError } = await supabase
        .from('job_document_revisions')
        .insert({
          document_id: document.id,
          version_number: newVersion,
          file_url: publicUrl,
          revision_description: revisionDescription.trim(),
          uploaded_by: profile?.id,
        });

      if (revError) throw revError;

      // Update document's current version
      const { error: updateError } = await supabase
        .from('job_documents')
        .update({
          current_version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (updateError) throw updateError;

      toast.success(`Document updated to v${newVersion}`);
      setUploadMode(null);
      loadDocuments();
      onUpdate();
    } catch (error: any) {
      console.error('Revision upload error:', error);
      toast.error(`Failed to upload revision: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument() {
    if (!isOffice || !deletingDoc) return;

    try {
      const { error } = await supabase
        .from('job_documents')
        .delete()
        .eq('id', deletingDoc.id);

      if (error) throw error;

      toast.success('Document deleted');
      setDeletingDoc(null);
      loadDocuments();
      loadCategories(); // Refresh categories after deletion
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to delete document');
      console.error(error);
    }
  }

  function addCategory() {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) {
      toast.error('Category name cannot be empty');
      return;
    }

    if (categories.includes(trimmedName)) {
      toast.error('Category already exists');
      return;
    }

    setCategories([...categories, trimmedName].sort());
    setNewCategoryName('');
    toast.success('Category added');
  }

  async function deleteCategory(categoryName: string) {
    // Check if any documents are using this category
    const docsWithCategory = documents.filter(doc => doc.category === categoryName);

    if (docsWithCategory.length > 0) {
      toast.error(`Cannot delete category "${categoryName}" - ${docsWithCategory.length} document(s) are using it`);
      return;
    }

    // Remove from categories list
    setCategories(categories.filter(cat => cat !== categoryName));
    setDeletingCategory(null);
    toast.success('Category deleted');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      {isOffice && (
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button onClick={openBulkUpload} className="gradient-primary">
              <FileUp className="w-4 h-4 mr-2" />
              Bulk Upload
            </Button>
            <Button onClick={openNewDocument} variant="outline">
              <FileUp className="w-4 h-4 mr-2" />
              Upload Single
            </Button>
            <Button onClick={openRevisionUpload} variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Upload Revision
            </Button>
          </div>
          <Button onClick={() => setShowCategoryDialog(true)} variant="outline" size="sm">
            <FolderPlus className="w-4 h-4 mr-2" />
            Manage Categories
          </Button>
        </div>
      )}

      {/* Documents List */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">No documents uploaded yet</p>
            {isOffice && <p className="text-sm">Upload your first document to get started</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const isEditing = editingDocId === doc.id;
            const fileExtension = doc.latest_file_url?.split('.').pop()?.toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '');
            const isPDF = fileExtension === 'pdf';
            
            return (
              <Card 
                key={doc.id} 
                className={`overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${
                  doc.visible_to_crew ? 'border-l-4 border-l-green-500' : ''
                }`}
                onClick={() => doc.latest_file_url && setViewingDocument({ url: doc.latest_file_url, name: doc.name })}
              >
                {/* Document Preview Thumbnail */}
                <div className="relative h-32 bg-slate-100 border-b">
                  {doc.latest_file_url ? (
                    isImage ? (
                      <img
                        src={doc.latest_file_url}
                        alt={doc.name}
                        className="w-full h-full object-cover"
                      />
                    ) : isPDF ? (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
                        <FileText className="w-12 h-12 text-red-600" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                        <FileText className="w-12 h-12 text-blue-600" />
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-200">
                      <FileText className="w-10 h-10 text-slate-400" />
                    </div>
                  )}
                  {/* Overlay with badges */}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Badge className="text-xs bg-primary/90 backdrop-blur-sm">
                      v{doc.current_version}
                    </Badge>
                    {doc.visible_to_crew && (
                      <Badge className="text-xs bg-green-500/90 backdrop-blur-sm text-white">
                        <Eye className="w-3 h-3 mr-1" />
                        Crew
                      </Badge>
                    )}
                  </div>
                </div>
                
                <CardHeader className="pb-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-2 mb-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="text-base font-semibold"
                            placeholder="Document name"
                          />
                          <Select value={editCategory} onValueChange={setEditCategory}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <>
                          <CardTitle className="text-sm mb-1 truncate" title={doc.name}>
                            {doc.name}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {doc.category}
                            </Badge>
                            <span className="text-xs truncate">
                              {new Date(doc.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => saveDocumentEdits(doc.id)}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingDocId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRevisionLog(doc.id);
                            }}
                            title="View history"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          {isOffice && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditDocument(doc);
                                }}
                                title="Edit name and category"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant={doc.visible_to_crew ? "default" : "outline"}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCrewVisibility(doc.id, doc.visible_to_crew);
                                }}
                                title={doc.visible_to_crew ? "Hide from crew" : "Show to crew"}
                              >
                                {doc.visible_to_crew ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <EyeOff className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingDoc(doc);
                                }}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bulk Upload Dialog */}
      <Dialog open={uploadMode === 'bulk'} onOpenChange={() => setUploadMode(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Bulk Upload Documents</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Drag and Drop Zone */}
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                Drag and drop files here
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                or click the button below to browse
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="w-4 h-4 mr-2" />
                Browse Files
              </Button>
            </div>

            {/* Pending Uploads List */}
            {pendingUploads.length > 0 && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">
                    Files to Upload ({pendingUploads.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Categorize and rename before uploading
                  </p>
                </div>
                
                {pendingUploads.map((upload) => (
                  <Card key={upload.id} className="p-3">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {upload.file.name}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Document Name</Label>
                          <Input
                            value={upload.name}
                            onChange={(e) => updatePendingUpload(upload.id, { name: e.target.value })}
                            placeholder="Enter document name"
                            className="h-8 text-sm"
                          />
                        </div>
                        
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={upload.category}
                            onValueChange={(value) => updatePendingUpload(upload.id, { category: value })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={upload.visible_to_crew}
                            onCheckedChange={(checked) => 
                              updatePendingUpload(upload.id, { visible_to_crew: checked })
                            }
                            id={`crew-visible-${upload.id}`}
                          />
                          <Label htmlFor={`crew-visible-${upload.id}`} className="text-xs cursor-pointer">
                            {upload.visible_to_crew ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                Visible to crew
                              </span>
                            ) : (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <EyeOff className="w-3 h-3" />
                                Office only
                              </span>
                            )}
                          </Label>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePendingUpload(upload.id)}
                          className="h-7 text-destructive hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-between">
              <div className="text-sm text-muted-foreground">
                {pendingUploads.length > 0 && (
                  <p>
                    💡 Tip: Documents are hidden from crew by default. Toggle visibility for each file.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setUploadMode(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={processBulkUploads}
                  disabled={uploading || pendingUploads.length === 0}
                  className="gradient-primary"
                >
                  {uploading ? 'Uploading...' : `Upload ${pendingUploads.length} File${pendingUploads.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload New Document Dialog */}
      <Dialog open={uploadMode === 'new'} onOpenChange={() => setUploadMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload New Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-name">Document Name *</Label>
              <Input
                id="doc-name"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="e.g., Site Plan, Truss Layout"
              />
            </div>

            <div>
              <Label htmlFor="doc-category">Category *</Label>
              <Select value={newDocCategory} onValueChange={setNewDocCategory}>
                <SelectTrigger id="doc-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="doc-file">Upload File *</Label>
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
              />
              {newDocFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {newDocFile.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="doc-notes">Initial Notes (Optional)</Label>
              <Textarea
                id="doc-notes"
                value={newDocNotes}
                onChange={(e) => setNewDocNotes(e.target.value)}
                placeholder="Any notes about this document..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUploadMode(null)}>
                Cancel
              </Button>
              <Button
                onClick={uploadNewDocument}
                disabled={uploading}
                className="gradient-primary"
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Revision Dialog */}
      <Dialog open={uploadMode === 'revision'} onOpenChange={() => setUploadMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document Revision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="select-doc">Select Document to Update *</Label>
              <Select
                value={selectedDocForRevision}
                onValueChange={setSelectedDocForRevision}
              >
                <SelectTrigger id="select-doc">
                  <SelectValue placeholder="Choose existing document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.name} (v{doc.current_version}) - {doc.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDocForRevision && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ Will create version {(documents.find(d => d.id === selectedDocForRevision)?.current_version || 0) + 1}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="revision-file">Upload Updated File *</Label>
              <Input
                id="revision-file"
                type="file"
                onChange={(e) => setRevisionFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
              />
              {revisionFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {revisionFile.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="revision-desc">Revision Description *</Label>
              <Textarea
                id="revision-desc"
                value={revisionDescription}
                onChange={(e) => setRevisionDescription(e.target.value)}
                placeholder="What changed in this revision? (Required)"
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be visible to all crew members
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUploadMode(null)}>
                Cancel
              </Button>
              <Button
                onClick={uploadRevision}
                disabled={uploading}
                className="gradient-primary"
              >
                {uploading ? 'Uploading...' : 'Upload Revision'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revision Log Dialog */}
      <Dialog open={showRevisionLog} onOpenChange={setShowRevisionLog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Revision History
            </DialogTitle>
          </DialogHeader>

          {revisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No revision history available
            </div>
          ) : (
            <div className="space-y-3">
              {revisions.map((rev) => (
                <Card key={rev.id} className="overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Badge className="text-sm">Version {rev.version_number}</Badge>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {rev.uploader_name || 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(rev.uploaded_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    {rev.revision_description && (
                      <p className="text-sm mb-3">{rev.revision_description}</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="w-full"
                    >
                      <a href={rev.file_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4 mr-2" />
                        View File
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5" />
              Manage Document Categories
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add New Category */}
            <div className="space-y-2">
              <Label htmlFor="new-category">Add New Category</Label>
              <div className="flex gap-2">
                <Input
                  id="new-category"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Permits, Safety Plans"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                />
                <Button onClick={addCategory} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Current Categories */}
            <div className="space-y-2">
              <Label>Current Categories ({categories.length})</Label>
              <div className="border rounded-lg p-3 max-h-[300px] overflow-y-auto space-y-2">
                {categories.map((category) => {
                  const docCount = documents.filter(doc => doc.category === category).length;
                  const isDefault = DEFAULT_CATEGORIES.includes(category);

                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{category}</span>
                        {docCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {docCount} {docCount === 1 ? 'doc' : 'docs'}
                          </Badge>
                        )}
                        {isDefault && (
                          <Badge variant="outline" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingCategory(category)}
                        disabled={docCount > 0}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                        title={docCount > 0 ? `Cannot delete - ${docCount} document(s) using this category` : 'Delete category'}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Tip: Categories with documents cannot be deleted. Delete or recategorize documents first.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setShowCategoryDialog(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the category "{deletingCategory}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCategory && deleteCategory(deletingCategory)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Document Confirmation */}
      <AlertDialog open={!!deletingDoc} onOpenChange={() => setDeletingDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDoc?.name}"? This will delete all revisions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDocument}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
        <DialogContent className="max-w-6xl max-h-[95vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {viewingDocument?.name}
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewingDocument && window.open(viewingDocument.url, '_blank')}
              >
                Open in New Tab
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6 pt-4">
            {viewingDocument && (() => {
              const fileExtension = viewingDocument.url.split('.').pop()?.toLowerCase();
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '');
              const isPDF = fileExtension === 'pdf';
              
              if (isImage) {
                return (
                  <div className="flex items-center justify-center bg-slate-50 rounded-lg p-4">
                    <img
                      src={viewingDocument.url}
                      alt={viewingDocument.name}
                      className="max-w-full h-auto rounded shadow-lg"
                    />
                  </div>
                );
              } else if (isPDF) {
                return (
                  <iframe
                    src={viewingDocument.url}
                    className="w-full h-[70vh] rounded-lg border"
                    title={viewingDocument.name}
                  />
                );
              } else {
                return (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-2">Preview not available</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      This file type cannot be previewed in the browser
                    </p>
                    <Button
                      onClick={() => viewingDocument && window.open(viewingDocument.url, '_blank')}
                    >
                      Download File
                    </Button>
                  </div>
                );
              }
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
