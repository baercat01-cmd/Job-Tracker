import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Upload, Download, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  description: string | null;
  uploaded_at: string;
}

interface DocumentsTabProps {
  vehicleId: string;
}

export function DocumentsTab({ vehicleId }: DocumentsTabProps) {
  const { user } = useFleetAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [vehicleId]);

  async function loadDocuments() {
    try {
      const { data, error } = await supabase
        .from('vehicle_documents')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${vehicleId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('vehicle-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-documents')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('vehicle_documents').insert({
        vehicle_id: vehicleId,
        file_name: file.name,
        file_path: publicUrl,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user?.username || 'unknown',
      });

      if (dbError) throw dbError;

      toast.success('Document uploaded');
      loadDocuments();
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;

    try {
      const { error: dbError } = await supabase
        .from('vehicle_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      toast.success('Document deleted');
      loadDocuments();
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
    }
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-600">Loading documents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Documents</h3>
        <label>
          <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-black" disabled={uploading} asChild>
            <span>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload'}
            </span>
          </Button>
          <input type="file" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No documents</p>
            <p className="text-sm text-slate-500 mb-4">Upload registration, insurance, manuals, etc.</p>
            <label>
              <Button variant="outline" className="border-2 border-yellow-600 text-yellow-700 hover:bg-yellow-50" asChild>
                <span>
                  <Plus className="w-4 h-4 mr-2" />
                  Upload Document
                </span>
              </Button>
              <input type="file" onChange={handleFileUpload} className="hidden" />
            </label>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>•</span>
                      <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(doc.file_path, '_blank')}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
