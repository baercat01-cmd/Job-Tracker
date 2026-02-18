import { FC } from 'react';

interface JobFinancialsProps {
  job?: any;
}

export const JobFinancials: FC<JobFinancialsProps> = ({ job }) => {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Job Financials</h2>
      <p className="text-muted-foreground">
        Financial details for {job?.name || 'this job'} will be displayed here.
      </p>
    </div>
  );
};
