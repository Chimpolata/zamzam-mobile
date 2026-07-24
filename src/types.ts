export type Role = 'super_admin' | 'admin' | 'sheikh'
export type FeedbackCategory = 'bug' | 'suggestion' | 'other'
export type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'not_an_issue'

export interface FeedbackReport {
  id: number
  reporter_user_id: number | null
  reporter_username: string
  tahfiz_id: number | null
  tahfiz_name: string | null
  category: FeedbackCategory
  title: string
  description: string
  page_url: string | null
  status: FeedbackStatus
  resolution_note: string | null
  reviewer_username: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface Membership {
  id: number
  tahfiz_id: number
  tahfiz_name: string
  tahfiz_status: 'pending' | 'active' | 'rejected' | 'suspended'
  role: 'admin' | 'sheikh'
  sheikh_id: number | null
}

export interface User {
  id: number
  username: string
  role: Role
  global_role: Role
  tahfiz_id: number | null
  default_tahfiz_id: number | null
  memberships: Membership[]
}

export interface Session {
  id: number
  tahfiz_id: number
  date: string
  is_confirmed: boolean
  version: number
  reopened_at: string | null
}

export interface Student {
  id: number
  tahfiz_id: number
  name: string
  phone: string | null
  profile_pic: string | null
  status: string
  sheikh_id: number | null
  sort_order: number
}

export interface Attendance {
  id: number
  tahfiz_id: number
  session_id: number
  student_id: number
  sheikh_id: number | null
  status: string
  notes: string | null
  revision: number
  updated_at: string
}

export interface QuranProgress {
  id: number
  tahfiz_id: number
  session_id: number
  student_id: number
  sheikh_id: number | null
  category: 'new_memorization' | 'recent_revision' | 'old_revision' | 'test'
  range_type: 'surah_ayah' | 'page'
  from_surah: number | null
  from_ayah: number | null
  to_surah: number | null
  to_ayah: number | null
  from_page: number | null
  to_page: number | null
  quality_score: number
  mistakes: number
  notes: string | null
  next_assignment: string | null
  revision: number
  updated_at: string
}

export interface Bootstrap {
  schema_version: number
  cursor: number
  server_time: string
  tahfiz: {
    id: number
    name: string
    attendance_statuses: string[]
    progress_tracking_enabled: boolean
    week_start_day: number
    month_start_day: number
  }
  sheikhs: Array<{ id: number; tahfiz_id: number; name: string; phone: string | null }>
  students: Student[]
  sessions: Session[]
  attendance: Attendance[]
  quran_progress: QuranProgress[]
}

export interface OutboxMutation {
  mutation_id: string
  tahfiz_id: number
  device_id: string
  entity_type: 'attendance' | 'quran_progress'
  entity_key: string
  base_revision: number
  values: Record<string, unknown>
  client_changed_at: string
}

export interface SyncConflict {
  id: number
  tahfiz_id: number
  mutation_id: string
  entity_type: string
  entity_key: string
  code: string
  local: Record<string, unknown>
  server: Record<string, unknown> | null
  created_at: string
}
