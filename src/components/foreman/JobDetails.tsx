import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, FolderOpen, MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
import type { Job, DocumentFolder } from '@/types';

interface JobDetailsProps {
  job: Job;
  onBack: () => void;
}

export function JobDetails({ job, onBack }: JobDetailsProps) {
  const { profile } = useAuth();
  const documents: DocumentFolder[] = Array.isArray(job.documents) ? job.documents : [];

  return (
    <div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No documents available</p>
            <p className="text-sm mt-1">Documents will appear here when office staff uploads them</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {documents.map((folder) => (
            <Card key={folder.id} className="overflow-hidden">
              <CardHeader className="bg-muted/50 pb-4">
                <CardTitle className="text-xl flex items-center gap-3">
                  <FolderOpen className="w-6 h-6 text-primary" />
                  {folder.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {folder.files.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">No files in this folder</p>
                ) : (
                  <div className="space-y-2">
                    {folder.files.map((file) => (
                      <a
                        key={file.id}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 hover:border-primary transition-all touch-target group"
                      >
                        <div className="flex-shrink-0">
                          <FileText className="w-8 h-8 text-primary group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-base group-hover:text-primary transition-colors truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Tap to open
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
