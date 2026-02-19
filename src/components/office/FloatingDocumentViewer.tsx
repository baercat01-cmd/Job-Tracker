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
} from 'lucide-react';
import { toast } from 'sonner';

interface JobDocument {
  id: string;
  name: string;
  category: string;
  current_version: number;
  latest_file_url?: string;
  created_at: string;
}

interface FloatingDocumentViewerProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
}

export function FloatingDocumentViewer({ jobId, open, onClose }: FloatingDocumentViewerProps) {
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [selectedDoc, setSelectedDoc] = useState<JobDocument | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'viewer'>('grid');

  useEffect(() => {
    if (open) {
      loadDocuments();
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

  function backToGrid() {
    setSelectedDocId('');
    setSelectedDoc(null);
    setViewMode('grid');
  }

  if (!open) return null;

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
                {viewMode === 'viewer' && (
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
                  {viewMode === 'grid' && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Grid3x3 className="w-4 h-4" />
                      <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
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
              {viewMode === 'grid' ? (
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
    );
  }

  // Default view - floating panel (right side)
  return (
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
            {viewMode === 'viewer' && (
              <Button
                onClick={backToGrid}
                variant="outline"
                size="sm"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            <div className="flex-1">
              {viewMode === 'viewer' && selectedDoc && (
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium text-sm truncate">{selectedDoc.name}</span>
                  <Badge variant="outline" className="text-xs">{selectedDoc.category}</Badge>
                </div>
              )}
              {viewMode === 'grid' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Grid3x3 className="w-4 h-4" />
                  <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
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
          {viewMode === 'grid' ? (
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
  );
}
