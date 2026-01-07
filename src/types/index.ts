export type UserRole = 'crew' | 'office' | 'payroll';

export interface UserProfile {
  id: string;
  username: string | null;
  email: string;
  role: 'crew' | 'office' | 'payroll'; // Must be exactly 'crew', 'office', or 'payroll'
  phone: string | null;
  created_at: string;
  pin_hash?: string | null;
  webauthn_credentials?: any[] | null;
  is_admin?: boolean;
}

export interface Component {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  created_by: string | null;
}

export interface DocumentFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number;
  createdAt: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  files: DocumentFile[];
}

export interface JobComponent {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface Job {
  id: string;
  name: string;
  client_name: string;
  address: string;
  description: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  documents: DocumentFolder[];
  components: JobComponent[];
  notes: string | null;
  status: 'quoting' | 'active' | 'completed' | 'on_hold' | 'archived';
  created_at: string;
  updated_at: string;
  created_by: string | null;
  job_number?: string; // Legacy field, will be removed
  estimated_hours?: number;

  projected_start_date?: string | null; // When job becomes visible to field crew
  projected_end_date?: string | null; // Projected completion date
}

export interface JobAssignment {
  id: string;
  job_id: string;
  user_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface TimeEntry {
  id: string;
  job_id: string;
  component_id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  total_hours: number | null;
  crew_count: number;
  is_manual: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryWithDetails extends TimeEntry {
  component_name?: string;
  job_number?: string;
  user_name?: string;
}

export interface WeatherDetails {
  temp: string;
  conditions: string;
  wind?: string;
  precipitation?: string;
}

export interface ComponentWorked {
  id: string;
  name: string;
  hours: number;
}

export interface TimeSummaryEntry {
  componentName: string;
  totalHours: number;
  method: 'timer' | 'manual';
  crewCount: number;
  uploadedBy: string;
}

export interface PhotoLogged {
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  componentId?: string;
  componentName?: string;
}

export interface Issue {
  description: string;
  reportedBy: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface MaterialRequest {
  item: string;
  quantity: string;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface DailyLog {
  id: string;
  job_id: string;
  log_date: string;
  weather: string | null; // Legacy text field
  weather_details: WeatherDetails | null;
  crew_count: number | null;
  components_worked: ComponentWorked[];
  time_summary: TimeSummaryEntry[];
  photos_logged: PhotoLogged[];
  issues: Issue[];
  material_requests_structured: MaterialRequest[];
  auto_summary_text: string | null;
  final_notes: string | null;
  client_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Legacy fields
  legacy_work_performed?: string | null;
  legacy_issues?: string | null;
  legacy_materials?: string | null;
}

export interface Photo {
  id: string;
  job_id: string;
  daily_log_id: string | null;
  component_id: string | null;
  photo_url: string;
  photo_date: string;
  gps_lat: number | null;
  gps_lng: number | null;
  timestamp: string;
  uploaded_by: string;
  caption: string | null;
  created_at: string;
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

export interface ActiveTimer {
  id: string;
  job_id: string;
  component_id: string;
  component_name: string;
  start_time: string;
  crew_count: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_type: 'meeting' | 'delivery' | 'inspection' | 'deadline' | 'other';
  job_id: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
