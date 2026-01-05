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
  ExternalLink
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
  
  // Revision log
  const [showRevisionLog, setShowRevisionLog] = useState(false);
  const [revisionLogDoc, setRevisionLogDoc] = useState<JobDocument | null>(null);
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);

  useEffect(() => {
    loadDocuments();
  }, [job.id, userId]);

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

  async function loadRevisions(document: JobDocument) {
    try {
      const { data: revisionsData, error: revisionsError } = await supabase
        .from('job_document_revisions')
        .select('*')
        .eq('document_id', document.id)
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

  async function openRevisionLog(document: JobDocument) {
    setRevisionLogDoc(document);
    await loadRevisions(document);
    setShowRevisionLog(true);
    
    // Mark latest revision as viewed
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

  async function viewDocument(revision: DocumentRevision) {
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
      if (revisionLogDoc && revision.version_number === revisionLogDoc.current_version) {
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
                    {hasNewRevision && (
                      <Badge className="bg-red-500 text-white shrink-0 animate-pulse">
                        NEW
                      </Badge>
                    )}
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
            
            <CardContent className="pt-0">
              <Button
                onClick={() => openRevisionLog(doc)}
                className={`w-full h-12 text-base ${hasNewRevision ? 'gradient-primary shadow-md' : ''}`}
                variant={hasNewRevision ? 'default' : 'outline'}
              >
                {hasNewRevision ? (
                  <>
                    <AlertCircle className="w-5 h-5 mr-2" />
                    VIEW UPDATED DOCUMENT
                  </>
                ) : (
                  <>
                    <History className="w-5 h-5 mr-2" />
                    View Document & History
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {/* Revision Log Dialog */}
      <Dialog open={showRevisionLog} onOpenChange={setShowRevisionLog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {revisionLogDoc?.name}
            </DialogTitle>
            {revisionLogDoc && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                <Badge variant="outline">{revisionLogDoc.category}</Badge>
                <Badge className="bg-primary/10 text-primary">
                  Current: v{revisionLogDoc.current_version}
                </Badge>
              </div>
            )}
          </DialogHeader>
          
          {revisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No versions available
            </div>
          ) : (
            <div className="space-y-3">
              {revisions.map((rev, index) => {
                const isLatest = index === 0;
                
                return (
                  <Card 
                    key={rev.id} 
                    className={`overflow-hidden ${isLatest ? 'border-primary border-2' : ''}`}
                  >
                    <CardHeader className={`pb-3 ${isLatest ? 'bg-primary/5' : 'bg-muted/30'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={isLatest ? 'bg-primary' : ''}>
                            Version {rev.version_number}
                          </Badge>
                          {isLatest && (
                            <Badge variant="outline" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
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
                    <CardContent className="pt-3 space-y-3">
                      {rev.revision_description && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm font-medium mb-1">What Changed:</p>
                          <p className="text-sm text-muted-foreground">
                            {rev.revision_description}
                          </p>
                        </div>
                      )}
                      <Button
                        variant={isLatest ? 'default' : 'outline'}
                        size="lg"
                        onClick={() => viewDocument(rev)}
                        className="w-full"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {isLatest ? 'Open Current Version' : `Open v${rev.version_number}`}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => setShowRevisionLog(false)}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
