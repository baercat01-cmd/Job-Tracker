import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  FileText, 
  History, 
  Clock, 
  User,
  ChevronDown,
  ChevronRight,
  Eye
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

interface DocumentsViewProps {
  job: Job;
  userId: string;
}

export function DocumentsView({ job, userId }: DocumentsViewProps) {
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [unviewedDocs, setUnviewedDocs] = useState<Set<string>>(new Set());
  
  // Revision data per document
  const [documentRevisions, setDocumentRevisions] = useState<Record<string, DocumentRevision[]>>({});
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDocuments();
  }, [job.id, userId]);

  useEffect(() => {
    // Load all revisions when documents are loaded
    documents.forEach(doc => {
      loadRevisions(doc.id);
    });
  }, [documents]);

  async function loadDocuments() {
    try {
      setLoading(true);
      
      // Load documents - ONLY show crew-visible documents
      const { data: docsData, error: docsError } = await supabase
        .from('job_documents')
        .select('*')
        .eq('job_id', job.id)
        .eq('visible_to_crew', true)
        .order('updated_at', { ascending: false });

      if (docsError) throw docsError;

      const docs = docsData || [];
      setDocuments(docs);

      // Check which documents have unviewed revisions
      const unviewed = new Set<string>();
      
      for (const doc of docs) {
        // Get latest revision
        const { data: latestRevision } = await supabase
          .from('job_document_revisions')
          .select('id')
          .eq('document_id', doc.id)
          .eq('version_number', doc.current_version)
          .single();

        if (latestRevision) {
          // Check if user has viewed this revision
          const { data: viewRecord } = await supabase
            .from('document_views')
            .select('id')
            .eq('revision_id', latestRevision.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!viewRecord) {
            unviewed.add(doc.id);
          }
        }
      }

      setUnviewedDocs(unviewed);
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

        setDocumentRevisions(prev => ({
          ...prev,
          [documentId]: revisionsWithNames
        }));
      } else {
        setDocumentRevisions(prev => ({
          ...prev,
          [documentId]: revisionsData || []
        }));
      }
    } catch (error: any) {
      console.error('Error loading revisions:', error);
    }
  }

  function toggleDocumentExpansion(documentId: string) {
    setExpandedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  }

  async function markDocumentAsViewed(document: JobDocument) {
    try {
      const { data: latestRevision } = await supabase
        .from('job_document_revisions')
        .select('id')
        .eq('document_id', document.id)
        .eq('version_number', document.current_version)
        .single();

      if (latestRevision) {
        await supabase
          .from('document_views')
          .upsert({
            revision_id: latestRevision.id,
            document_id: document.id,
            user_id: userId,
          }, {
            onConflict: 'revision_id,user_id'
          });

        // Remove from unviewed set
        setUnviewedDocs(prev => {
          const newSet = new Set(prev);
          newSet.delete(document.id);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error marking document as viewed:', error);
    }
  }

  async function viewDocument(revision: DocumentRevision, document: JobDocument) {
    // Open document
    window.open(revision.file_url, '_blank');
    
    // Mark as viewed
    try {
      await supabase
        .from('document_views')
        .upsert({
          revision_id: revision.id,
          document_id: revision.document_id,
          user_id: userId,
        }, {
          onConflict: 'revision_id,user_id'
        });

      // Remove from unviewed if this was the latest version
      if (revision.version_number === document.current_version) {
        setUnviewedDocs(prev => {
          const newSet = new Set(prev);
          newSet.delete(revision.document_id);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error marking document as viewed:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading documents...</div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No documents available</p>
          <p className="text-sm mt-1">Documents will appear here when office staff uploads them</p>
        </CardContent>
      </Card>
    );
  }

  const isImageUrl = (url: string) => /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);

  return (
    <div className="space-y-2 sm:space-y-3">
      {documents.map((doc) => {
        const hasNewRevision = unviewedDocs.has(doc.id);
        const revisions = documentRevisions[doc.id] || [];
        const latestRevision = revisions[0];
        const pastRevisions = revisions.slice(1);
        const isExpanded = expandedDocuments.has(doc.id);
        const fileUrl = latestRevision?.file_url;

        return (
          <div key={doc.id} className="space-y-0">
            {/* Main card: thumbnail left, name/version/tags right, fully clickable */}
            <button
              type="button"
              onClick={() => {
                if (latestRevision) {
                  viewDocument(latestRevision, doc);
                  markDocumentAsViewed(doc);
                }
              }}
              className={`w-full text-left rounded-lg border bg-card text-card-foreground shadow-sm hover:bg-muted/50 active:bg-muted transition-colors flex items-stretch gap-3 p-2 sm:p-3 min-h-[72px] ${
                hasNewRevision ? 'border-primary ring-1 ring-primary/20' : 'border-border'
              }`}
            >
              {/* Thumbnail / preview - left */}
              <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                {fileUrl && isImageUrl(fileUrl) ? (
                  <img
                    src={fileUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground" />
                )}
              </div>
              {/* Name, version, tags - right */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm sm:text-base truncate">{doc.name}</span>
                  {hasNewRevision && (
                    <Badge className="bg-destructive/90 text-destructive-foreground text-[10px] px-1.5 py-0 shrink-0">
                      New
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="secondary" className="text-[10px] sm:text-xs font-normal">
                    v{doc.current_version}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] sm:text-xs font-normal">
                    {doc.category}
                  </Badge>
                </div>
              </div>
            </button>

            {/* Past versions - compact expandable */}
            {pastRevisions.length > 0 && (
              <div className="mt-1 ml-1 sm:ml-2 border-l-2 border-muted pl-2 sm:pl-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDocumentExpansion(doc.id);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Past versions ({pastRevisions.length})
                </button>
                {isExpanded && (
                  <div className="space-y-1.5 pt-1">
                    {pastRevisions.map((rev) => (
                      <div
                        key={rev.id}
                        className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-muted/40 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[10px] shrink-0">v{rev.version_number}</Badge>
                          <span className="text-muted-foreground truncate">
                            {rev.uploader_name || 'Unknown'} · {new Date(rev.uploaded_at).toLocaleDateString()}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            viewDocument(rev, doc);
                          }}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
