import { createContext, useContext } from 'react';

export type SetProposalToolbarContent = (content: React.ReactNode) => void;

export const JobDetailProposalToolbarContext = createContext<SetProposalToolbarContent | null>(null);

export function useProposalToolbar() {
  return useContext(JobDetailProposalToolbarContext);
}
