export type CalendarEventType = 
  | 'meeting' 
  | 'delivery' 
  | 'inspection' 
  | 'deadline' 
  | 'other' 
  | 'task_completed' 
  | 'material_order' 
  | 'material_delivery' 
  | 'material_pull' 
  | 'task_deadline' 
  | 'subcontractor' 
  | 'material_pickup';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string; // The database uses this
  date?: string;       // Mapping helper for UI
  event_type: CalendarEventType;
  type?: CalendarEventType; // Mapping helper for UI
  job_id: string | null;
  jobId?: string;           // Mapping helper for UI
  jobName?: string;
  jobColor?: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Metadata for different event types
  priority?: 'low' | 'medium' | 'high';
  materialId?: string;
  subcontractorName?: string;
  subcontractorPhone?: string;
  assignedUserName?: string;
}