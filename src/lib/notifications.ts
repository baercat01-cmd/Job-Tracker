import { supabase } from './supabase';

interface CreateNotificationParams {
  jobId: string;
  createdBy: string;
  type: 'daily_log' | 'photos' | 'material_request' | 'issue' | 'note' | 'material_status' | 'document_revision' | 'task_completed' | 'time_entry';
  brief: string;
  referenceId?: string;
  referenceData?: any;
}

/**
 * Create a notification for office staff about crew activity
 */
export async function createNotification({
  jobId,
  createdBy,
  type,
  brief,
  referenceId,
  referenceData,
}: CreateNotificationParams): Promise<void> {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        job_id: jobId,
        created_by: createdBy,
        type,
        brief,
        reference_id: referenceId || null,
        reference_data: referenceData || null,
        is_read: false,
      });

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }

    console.log('✅ Notification created:', { type, brief });
  } catch (error) {
    console.error('Failed to create notification:', error);
    // Don't throw - notifications shouldn't break the main flow
  }
}

/**
 * Get brief summary for daily log
 */
export function getDailyLogBrief(logData: any): string {
  const parts: string[] = [];
  
  if (logData.components_worked?.length > 0) {
    const componentNames = logData.components_worked.map((c: any) => c.name).join(', ');
    parts.push(`Worked on: ${componentNames}`);
  }
  
  if (logData.crew_count) {
    parts.push(`${logData.crew_count} crew members`);
  }
  
  if (logData.final_notes) {
    const notePreview = logData.final_notes.substring(0, 100);
    parts.push(notePreview + (logData.final_notes.length > 100 ? '...' : ''));
  }
  
  return parts.join(' • ') || 'Daily log submitted';
}

/**
 * Get brief summary for photos
 */
export function getPhotosBrief(count: number, caption?: string): string {
  const photoText = `${count} photo${count > 1 ? 's' : ''} uploaded`;
  if (caption) {
    return `${photoText} - ${caption.substring(0, 80)}${caption.length > 80 ? '...' : ''}`;
  }
  return photoText;
}

/**
 * Get brief summary for material requests
 */
export function getMaterialRequestBrief(requests: any[]): string {
  if (requests.length === 0) return 'Material request submitted';
  
  const items = requests.slice(0, 3).map((r: any) => `${r.item} (${r.quantity})`).join(', ');
  const moreText = requests.length > 3 ? ` and ${requests.length - 3} more` : '';
  
  return `Requested: ${items}${moreText}`;
}

/**
 * Get brief summary for issues
 */
export function getIssueBrief(issues: any[]): string {
  if (issues.length === 0) return 'Issue reported';
  
  const firstIssue = issues[0];
  const description = firstIssue.description.substring(0, 100);
  const moreText = issues.length > 1 ? ` (and ${issues.length - 1} more)` : '';
  
  return `${firstIssue.severity.toUpperCase()}: ${description}${description.length >= 100 ? '...' : ''}${moreText}`;
}

/**
 * Get brief summary for material status change
 */
export function getMaterialStatusBrief(materialName: string, oldStatus: string, newStatus: string): string {
  const statusLabels: Record<string, string> = {
    not_ordered: 'Not Ordered',
    ordered: 'Ordered',
    at_shop: 'At Shop',
    at_job: 'At Job',
    installed: 'Installed',
    missing: 'Missing',
  };
  
  return `${materialName}: ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`;
}

/**
 * Get brief summary for document revision
 */
export function getDocumentRevisionBrief(docName: string, versionNumber: number, description?: string): string {
  let brief = `${docName} updated to v${versionNumber}`;
  if (description) {
    brief += ` - ${description.substring(0, 80)}${description.length > 80 ? '...' : ''}`;
  }
  return brief;
}
