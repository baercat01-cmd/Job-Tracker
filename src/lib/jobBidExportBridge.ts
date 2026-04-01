import { toast } from 'sonner';

let openBidSpecDialog: (() => void) | null = null;

/** JobFinancials registers this so the job shell can open the bid-spec PDF dialog. */
export function registerJobBidSpecExporter(fn: (() => void) | null) {
  openBidSpecDialog = fn;
}

/** Opens Export Proposal dialog with Bid spec (subcontractors) selected — from job header / toolbar. */
export function requestJobBidSpecExport() {
  if (typeof openBidSpecDialog === 'function') {
    openBidSpecDialog();
    return;
  }
  toast.error('Proposal workspace is still loading. Wait a moment, or open Proposal & Materials and try again.');
}
