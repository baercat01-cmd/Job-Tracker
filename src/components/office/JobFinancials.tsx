// Temporary stub - file being restored
import type { Job } from '@/types';

export function JobFinancials({ job }: { job: Job }) {
  return (
    <div className="p-8 text-center">
      <p className="text-lg text-muted-foreground">
        JobFinancials component is being restored. Please wait a moment and refresh.
      </p>
      <p className="text-sm text-muted-foreground mt-2">
        Job ID: {job.id}
      </p>
    </div>
  );
}
