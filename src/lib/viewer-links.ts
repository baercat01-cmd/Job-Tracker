import type { SupabaseClient } from '@supabase/supabase-js';

/** Path in job-files bucket (same as documents) — one JSON file per job, shared for all users */
export function getViewerLinksFilePath(jobId: string): string {
  return `${jobId}/viewer-links.json`;
}

export interface ViewerLinkItem {
  id: string;
  label: string;
  url: string;
}

/**
 * Load viewer links for a job. Uses Storage first (shared for all users, like documents),
 * then falls back to job_viewer_links table if it exists.
 */
export async function loadViewerLinksForJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<ViewerLinkItem[]> {
  try {
    const { data: blob, error } = await supabase.storage
      .from('job-files')
      .download(getViewerLinksFilePath(jobId));
    if (!error && blob) {
      const text = await blob.text();
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        const links = parsed.filter(
          (x): x is ViewerLinkItem =>
            x != null &&
            typeof x === 'object' &&
            typeof (x as ViewerLinkItem).id === 'string' &&
            typeof (x as ViewerLinkItem).label === 'string' &&
            typeof (x as ViewerLinkItem).url === 'string'
        );
        return links;
      }
    }
  } catch (_) {}
  try {
    const { data } = await supabase
      .from('job_viewer_links')
      .select('id, label, url')
      .eq('job_id', jobId)
      .order('order_index', { ascending: true });
    if (data?.length) return data as ViewerLinkItem[];
  } catch (_) {}
  return [];
}
