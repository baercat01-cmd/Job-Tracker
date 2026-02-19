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

  useEffect(() => {
    if (open) {
      loadDocuments();
    }
  }, [jobId, open]);

  useEffect(() => {
    if (selectedDocId) {
      const doc = documents.find(d => d.id === selectedDocId);
      setSelectedDoc(doc || null);
    } else {
      setSelectedDoc(null);
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
      window.open(selectedDoc.latest_file_url, '_blank');
    }
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
            {/* Document selector */}
            <div className="p-4 border-b bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a document to view..." />
                    </SelectTrigger>
                    <SelectContent>
                      {documents.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            <span>{doc.name}</span>
                            <Badge variant="outline" className="ml-2">
                              {doc.category}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedDoc?.latest_file_url && (
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

            {/* Document viewer */}
            <div className="flex-1 bg-slate-100 overflow-auto">
              {!selectedDoc ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      Select a document to view
                    </p>
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

        {/* Document selector */}
        <div className="p-4 border-b bg-slate-50 flex-shrink-0">
          <Select value={selectedDocId} onValueChange={setSelectedDocId}>
            <SelectTrigger>
              <SelectValue placeholder="Select document..." />
            </SelectTrigger>
            <SelectContent>
              {documents.map((doc) => (
                <SelectItem key={doc.id} value={doc.id}>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="truncate">{doc.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDoc?.latest_file_url && (
            <Button
              onClick={downloadDocument}
              variant="outline"
              size="sm"
              className="w-full mt-2"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
        </div>

        {/* Document viewer */}
        <CardContent className="flex-1 p-0 overflow-auto bg-slate-100">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading documents...</p>
              </div>
            </div>
          ) : !selectedDoc ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-6">
                <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-2">No document selected</p>
                <p className="text-sm text-muted-foreground">
                  {documents.length === 0
                    ? 'No documents available for this job'
                    : 'Select a document from the dropdown above'}
                </p>
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
        </CardContent>
      </Card>
    </div>
  );
}
