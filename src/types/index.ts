// ============================================
// CALENDAR TYPES
// ============================================

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
  status?: string;
}

// Shared calendar event type for cross-component consistency
export type SharedCalendarEvent = CalendarEvent;

// ============================================
// USER TYPES
// ============================================

export interface UserProfile {
  id: string;
  username: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
  created_at: string;
  pin_hash: string | null;
  webauthn_credentials: any;
  is_admin: boolean | null;
}

// ============================================
// JOB TYPES
// ============================================

export interface Job {
  id: string;
  job_number: string | null;
  name: string;
  client_name: string;
  address: string;
  description: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  created_by: string | null;
  documents: any;
  updated_at: string;
  components: any;
  estimated_hours: number | null;
  projected_start_date: string | null;
  projected_end_date: string | null;
  is_internal: boolean;
}

export interface JobWithProgress extends Job {
  progress?: number;
  total_components?: number;
  completed_components?: number;
}

// ============================================
// COMPONENT TYPES
// ============================================

export interface Component {
  id: string;
  name: string;
  description: string | null;
  archived: boolean | null;
  created_at: string;
  created_by: string | null;
}

export interface JobComponent {
  id: string;
  name: string;
  description?: string | null;
  order_index?: number;
  is_completed?: boolean;
  completed_at?: string | null;
}

export interface CompletedTask {
  id: string;
  job_id: string;
  component_id: string;
  completed_date: string;
  marked_by: string;
  notes: string | null;
  created_at: string;
}

// ============================================
// TIME TRACKING TYPES
// ============================================

export interface ActiveTimer {
  id: string;
  job_id: string;
  component_id: string | null;
  component_name: string;
  start_time: string;
  crew_count: number;
}

export interface TimeEntry {
  id: string;
  job_id: string;
  component_id: string | null;
  user_id: string;
  start_time: string;
  end_time: string | null;
  total_hours: number | null;
  crew_count: number;
  is_manual: boolean | null;
  is_active: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  worker_names: any;
}

// ============================================
// DAILY LOG TYPES
// ============================================

export interface ComponentWorked {
  component_id: string;
  component_name: string;
  hours_worked: number;
  notes?: string;
}

export interface TimeSummaryEntry {
  user_id: string;
  user_name: string;
  hours_worked: number;
  components: string[];
}

export interface PhotoLogged {
  photo_id: string;
  photo_url: string;
  caption?: string;
  timestamp: string;
}

export interface Issue {
  description: string;
  severity: 'low' | 'medium' | 'high';
  resolved: boolean;
}

export interface MaterialRequest {
  material_name: string;
  quantity: number;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface WeatherDetails {
  temperature?: number;
  conditions?: string;
  precipitation?: string;
}

export interface DailyLog {
  id: string;
  job_id: string;
  log_date: string;
  weather: string | null;
  legacy_work_performed: string | null;
  legacy_issues: string | null;
  legacy_materials: string | null;
  crew_count: number | null;
  client_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  components_worked: ComponentWorked[];
  time_summary: TimeSummaryEntry[];
  photos_logged: PhotoLogged[];
  auto_summary_text: string | null;
  final_notes: string | null;
  issues: Issue[];
  material_requests_structured: MaterialRequest[];
  weather_details: WeatherDetails | null;
}

// ============================================
// TASK TYPES
// ============================================

export interface JobTask {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  task_type: string;
  assigned_to: string | null;
  created_by: string;
  due_date: string | null;
  priority: string;
  status: string;
  blocked_reason: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// DOCUMENT TYPES
// ============================================

export interface DocumentFolder {
  id: string;
  name: string;
  documents: any[];
}