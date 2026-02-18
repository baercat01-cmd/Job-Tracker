
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-query';
import React, { FC, useState } from 'react';
import { JobFinancialsTab } from './JobFinancialsTab';
import { JobFinancialsInvoiceDetails } from './JobFinancialsInvoiceDetails';

interface JobFinancialsProps {}

export const JobFinancials: FC<JobFinancialsProps> = () => {
  return (
    <div className='flex flex-col'>
      <JobFinancialsTab />
      <JobFinancialsInvoiceDetails />
    </div>
  );
};
