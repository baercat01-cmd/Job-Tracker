
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Plus
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
  const [uploadMode, setUploadMode] = useState<'new' | 'revision' | null>(null);

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
      setDocuments(data || []);
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

      // Upload file to storage
      // It's safer to check if newDocFile exists before accessing its properties
      // although the check above already covers this for the `if (!newDocFile)` case.
      // TypeScript might still complain if not explicitly handled here.
      if (!newDocFile) {
          throw new Error("File not selected for upload.");
      }
      const fileExt = newDocFile.name.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${job.id}/documents/${timestamp}_${newDocFile.name}`;

      const { error: uploadError, data: uploadData } = await supabase.storage
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
      // Similar check for revisionFile as newDocFile
      if (!revisionFile) {
          throw new Error("File not selected for revision upload.");
      }
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
            <Button onClick={openNewDocument} className="gradient-primary">
              <FileUp className="w-4 h-4 mr-2" />
              Upload New Document
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
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-base mb-1">{doc.name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {doc.category}
                      </Badge>
                      <Badge className="text-xs bg-primary/10 text-primary">
                        v{doc.current_version}
                      </Badge>
                      <span className="text-xs">
                        Updated {new Date(doc.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRevisionLog(doc.id)}
                    >
                      <History className="w-4 h-4 mr-1" />
                      History
                    </Button>
                    {isOffice && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingDoc(doc)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

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
                        )} {/* This is where the syntax error was likely reported */}
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
    </div>
  );
}
