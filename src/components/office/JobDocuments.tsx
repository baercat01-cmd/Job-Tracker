import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { FolderPlus, Upload, FileText, Trash2, Download, ExternalLink, Edit2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import type { Job, DocumentFolder, DocumentFile } from '@/types';

interface JobDocumentsProps {
  job: Job;
  onUpdate: () => void;
}

export function JobDocuments({ job, onUpdate }: JobDocumentsProps) {
  const { profile } = useAuth();
  const isOffice = profile?.role === 'office';
  
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadingTo, setUploadingTo] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<{ folderId: string; fileId: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [renamingFile, setRenamingFile] = useState<{ folderId: string; fileId: string; name: string } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const documents: DocumentFolder[] = Array.isArray(job.documents) ? job.documents : [];

  async function createFolder() {
    if (!isOffice) {
      toast.error('Only office staff can create folders');
      return;
    }

    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    try {
      const newFolder: DocumentFolder = {
        id: crypto.randomUUID(),
        name: newFolderName.trim(),
        files: [],
      };

      const updatedDocuments = [...documents, newFolder];

      const { error } = await supabase
        .from('jobs')
        .update({ 
          documents: updatedDocuments,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolder(false);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to create folder');
      console.error(error);
    }
  }

  async function renameFolder() {
    if (!isOffice || !renamingFolder) return;

    try {
      const updatedDocuments = documents.map(folder =>
        folder.id === renamingFolder.id
          ? { ...folder, name: renamingFolder.name }
          : folder
      );

      const { error } = await supabase
        .from('jobs')
        .update({ 
          documents: updatedDocuments,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('Folder renamed');
      setRenamingFolder(null);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to rename folder');
      console.error(error);
    }
  }

  async function renameFile() {
    if (!isOffice || !renamingFile) return;

    if (!renamingFile.name.trim()) {
      toast.error('File name cannot be empty');
      return;
    }

    try {
      const updatedDocuments = documents.map(folder =>
        folder.id === renamingFile.folderId
          ? {
              ...folder,
              files: folder.files.map(file =>
                file.id === renamingFile.fileId
                  ? { ...file, name: renamingFile.name.trim() }
                  : file
              )
            }
          : folder
      );

      const { error } = await supabase
        .from('jobs')
        .update({ 
          documents: updatedDocuments,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('File renamed');
      setRenamingFile(null);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to rename file');
      console.error(error);
    }
  }

  async function uploadFile(folderId: string, file: File) {
    if (!isOffice) {
      toast.error('Only office staff can upload files');
      return;
    }

    console.log('📤 Starting file upload:', file.name);
    setUploadingTo(folderId);

    try {
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const fileName = `${job.id}/${folderId}/${timestamp}_${file.name}`;

      console.log('📁 Uploading to storage:', fileName);
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('job-files')
        .upload(fileName, file);

      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError);
        throw uploadError;
      }
      console.log('✅ Storage upload successful:', uploadData);

      const { data: { publicUrl } } = supabase.storage
        .from('job-files')
        .getPublicUrl(fileName);

      console.log('🔗 Public URL:', publicUrl);

      const newFile: DocumentFile = {
        id: crypto.randomUUID(),
        name: file.name,
        url: publicUrl,
        type: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };

      console.log('📝 Creating new file entry:', newFile);

      const updatedDocuments = documents.map(folder =>
        folder.id === folderId
          ? { ...folder, files: [...folder.files, newFile] }
          : folder
      );

      console.log('💾 Updating database with documents:', updatedDocuments);

      const { error: dbError, data: dbData } = await supabase
        .from('jobs')
        .update({ 
          documents: updatedDocuments,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)
        .select();

      if (dbError) {
        console.error('❌ Database update error:', dbError);
        throw dbError;
      }
      console.log('✅ Database updated successfully:', dbData);

      toast.success('File uploaded successfully');
      console.log('🔄 Calling onUpdate callback');
      onUpdate();
    } catch (error: any) {
      console.error('❌ Upload failed:', error);
      toast.error(`Failed to upload: ${error.message || 'Unknown error'}`);
    } finally {
      setUploadingTo(null);
    }
  }

  async function deleteFile(folderId: string, fileId: string) {
    if (!isOffice) return;

    try {
      const updatedDocuments = documents.map(folder =>
        folder.id === folderId
          ? { ...folder, files: folder.files.filter(f => f.id !== fileId) }
          : folder
      );

      const { error } = await supabase
        .from('jobs')
        .update({ 
          documents: updatedDocuments,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('File deleted');
      setDeletingFile(null);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to delete file');
      console.error(error);
    }
  }

  async function deleteFolder(folderId: string) {
    if (!isOffice) return;

    try {
      const updatedDocuments = documents.filter(f => f.id !== folderId);

      const { error } = await supabase
        .from('jobs')
        .update({ 
          documents: updatedDocuments,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('Folder deleted');
      setDeletingFolder(null);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to delete folder');
      console.error(error);
    }
  }

  // Drag and drop handlers
  function handleDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (isOffice) {
      setDragOverFolder(folderId);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
  }

  function handleDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);

    if (!isOffice) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Upload all dropped files
    files.forEach(file => uploadFile(folderId, file));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          Job Documents
        </h3>
        {isOffice && (
          <Button onClick={() => setShowNewFolder(true)} size="sm" variant="outline">
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No document folders yet</p>
            {isOffice && <p className="text-sm mt-1">Create a folder to organize job documents</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((folder) => (
            <Card 
              key={folder.id}
              className={`transition-all ${dragOverFolder === folder.id ? 'ring-2 ring-primary bg-primary/5' : ''}`}
              onDragOver={(e) => handleDragOver(e, folder.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-primary" />
                    {folder.name}
                  </CardTitle>
                  {isOffice && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRenamingFolder({ id: folder.id, name: folder.name })}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingFolder(folder.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {isOffice && dragOverFolder === folder.id && (
                  <div className="border-2 border-dashed border-primary rounded-lg p-4 text-center text-primary text-sm font-medium bg-primary/5 mb-2">
                    <Upload className="w-6 h-6 mx-auto mb-1" />
                    Drop files here to upload
                  </div>
                )}
                {folder.files.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    {isOffice ? 'Drop files here or use the input below' : 'No files in this folder'}
                  </p>
                ) : (
                  folder.files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={file.url} download>
                            <Download className="w-3 h-3" />
                          </a>
                        </Button>
                        {isOffice && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRenamingFile({ folderId: folder.id, fileId: file.id, name: file.name })}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingFile({ folderId: folder.id, fileId: file.id })}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isOffice && (
                  <div className="relative">
                    <Input
                      type="file"
                      className="cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadFile(folder.id, file);
                      }}
                      disabled={uploadingTo === folder.id}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    />
                    {uploadingTo === folder.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Document Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Drawings, Specs, Purchase Orders"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createFolder();
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewFolder(false)}>
                Cancel
              </Button>
              <Button onClick={createFolder}>Create Folder</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renamingFolder} onOpenChange={() => setRenamingFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-folder">Folder Name</Label>
              <Input
                id="rename-folder"
                value={renamingFolder?.name || ''}
                onChange={(e) => setRenamingFolder(prev => prev ? { ...prev, name: e.target.value } : null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameFolder();
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRenamingFolder(null)}>
                Cancel
              </Button>
              <Button onClick={renameFolder}>Rename</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename File Dialog */}
      <Dialog open={!!renamingFile} onOpenChange={() => setRenamingFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-file">File Name</Label>
              <Input
                id="rename-file"
                value={renamingFile?.name || ''}
                onChange={(e) => setRenamingFile(prev => prev ? { ...prev, name: e.target.value } : null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameFile();
                }}
                placeholder="Enter new file name"
              />
              <p className="text-xs text-muted-foreground">
                Include the file extension (e.g., .pdf, .jpg, .docx)
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRenamingFile(null)}>
                Cancel
              </Button>
              <Button onClick={renameFile}>Rename</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete File Confirmation */}
      <AlertDialog open={!!deletingFile} onOpenChange={() => setDeletingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFile && deleteFile(deletingFile.folderId, deletingFile.fileId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={!!deletingFolder} onOpenChange={() => setDeletingFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this folder and all its files? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFolder && deleteFolder(deletingFolder)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
