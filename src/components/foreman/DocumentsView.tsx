import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertCircle,
  ExternalLink,
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
      
      // Load documents
      const { data: docsData, error: docsError } = await supabase
        .from('job_documents')
        .select('*')
        .eq('job_id', job.id)
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

  return (
    <div className="space-y-3">
      {/* Documents List */}
      {documents.map((doc) => {
        const hasNewRevision = unviewedDocs.has(doc.id);
        const revisions = documentRevisions[doc.id] || [];
        const latestRevision = revisions[0];
        const pastRevisions = revisions.slice(1);
        const isExpanded = expandedDocuments.has(doc.id);
        
        return (
          <Card 
            key={doc.id} 
            className={`${hasNewRevision ? 'border-primary border-2 shadow-lg' : ''}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <FileText className={`w-6 h-6 ${hasNewRevision ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <CardTitle className="text-base leading-tight">
                      {doc.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasNewRevision && (
                        <Badge className="bg-red-500 text-white animate-pulse">
                          NEW
                        </Badge>
                      )}
                      {pastRevisions.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDocumentExpansion(doc.id)}
                          className="h-6 w-6 p-0 hover:bg-muted"
                          title="View past versions"
                        >
                          <History className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {doc.category}
                    </Badge>
                    <Badge className="text-xs bg-primary/10 text-primary">
                      v{doc.current_version}
                    </Badge>
                    <span className="text-muted-foreground">
                      Updated {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0 space-y-3">
              {/* Current Version - Most Accessible */}
              {latestRevision && (
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      viewDocument(latestRevision, doc);
                      markDocumentAsViewed(doc);
                    }}
                    className={`w-full h-12 text-base ${hasNewRevision ? 'gradient-primary shadow-md' : ''}`}
                    variant={hasNewRevision ? 'default' : 'default'}
                  >
                    {hasNewRevision ? (
                      <>
                        <AlertCircle className="w-5 h-5 mr-2" />
                        VIEW UPDATED DOCUMENT
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-5 h-5 mr-2" />
                        Open Document
                      </>
                    )}
                  </Button>
                  
                  {latestRevision.revision_description && (
                    <div className="p-2 bg-muted/50 rounded-lg border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Latest update:</p>
                      <p className="text-xs">
                        {latestRevision.revision_description}
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Past Versions - Collapsible */}
              {pastRevisions.length > 0 && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleDocumentExpansion(doc.id)}
                    className="w-full h-9 text-xs"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Hide Past Versions ({pastRevisions.length})
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-4 h-4 mr-2" />
                        View Past Versions ({pastRevisions.length})
                      </>
                    )}
                  </Button>
                  
                  {/* Expanded Past Versions */}
                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t">
                      {pastRevisions.map((rev) => (
                        <div
                          key={rev.id}
                          className="p-3 bg-muted/30 rounded-lg border space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              Version {rev.version_number}
                            </Badge>
                            <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {rev.uploader_name || 'Unknown'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(rev.uploaded_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          
                          {rev.revision_description && (
                            <div className="text-xs text-muted-foreground">
                              {rev.revision_description}
                            </div>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => viewDocument(rev, doc)}
                            className="w-full h-8 text-xs"
                          >
                            <Eye className="w-3 h-3 mr-2" />
                            Open v{rev.version_number}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
