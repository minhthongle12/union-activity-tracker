// ============================================================
// Enum types
// ============================================================

export type UserRole = 'admin' | 'user';

export type PeriodStatus = 'draft' | 'active' | 'closed' | 'archived';

export type OrgPeriodStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'closed';

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'revision_requested'
  | 'verified';

export type BonusStatus =
  | 'draft'
  | 'submitted'
  | 'revision_requested'
  | 'approved'
  | 'rejected';

export type EvidenceType = 'doc1' | 'doc2' | 'link3';

export type ReviewActionType = 'verified' | 'revision_requested' | 'reopened';

// ============================================================
// Row types
// ============================================================

/** Đơn vị / tổ chức */
export interface Organization {
  id: string;
  code: string;
  name: string;
  description: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInsert {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
}

export interface OrganizationUpdate {
  code?: string;
  name?: string;
  description?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
}

/** Hồ sơ người dùng */
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  organization_id?: string | null;
  is_active?: boolean;
}

export interface ProfileUpdate {
  username?: string;
  display_name?: string;
  role?: UserRole;
  organization_id?: string | null;
  is_active?: boolean;
}

/** Danh mục tiêu chí */
export interface CriteriaCategory {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  sort_order: number | null;
  created_at: string;
}

export interface CriteriaCategoryInsert {
  id?: string;
  code?: string | null;
  name: string;
  description?: string | null;
  sort_order?: number | null;
}

export interface CriteriaCategoryUpdate {
  code?: string | null;
  name?: string;
  description?: string | null;
  sort_order?: number | null;
}

/** Thư viện tiêu chí chính */
export interface CriterionLibrary {
  id: string;
  category_id: string | null;
  code: string;
  title: string;
  description: string | null;
  scoring_guidelines: string | null;
  max_score: number;
  req_doc1: boolean;
  req_doc2: boolean;
  req_link3: boolean;
  responsible_unit: string | null;
  deadline: string | null;
  sort_order: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CriterionLibraryInsert {
  id?: string;
  category_id?: string | null;
  code: string;
  title: string;
  description?: string | null;
  scoring_guidelines?: string | null;
  max_score: number;
  req_doc1?: boolean;
  req_doc2?: boolean;
  req_link3?: boolean;
  responsible_unit?: string | null;
  deadline?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

export interface CriterionLibraryUpdate {
  category_id?: string | null;
  code?: string;
  title?: string;
  description?: string | null;
  scoring_guidelines?: string | null;
  max_score?: number;
  req_doc1?: boolean;
  req_doc2?: boolean;
  req_link3?: boolean;
  responsible_unit?: string | null;
  deadline?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

/** Đợt đánh giá */
export interface EvaluationPeriod {
  id: string;
  name: string;
  description: string | null;
  start_at: string | null;
  submission_deadline: string | null;
  review_deadline: string | null;
  status: PeriodStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationPeriodInsert {
  id?: string;
  name: string;
  description?: string | null;
  start_at?: string | null;
  submission_deadline?: string | null;
  review_deadline?: string | null;
  status?: PeriodStatus;
  created_by?: string | null;
}

export interface EvaluationPeriodUpdate {
  name?: string;
  description?: string | null;
  start_at?: string | null;
  submission_deadline?: string | null;
  review_deadline?: string | null;
  status?: PeriodStatus;
}

/** Snapshot tiêu chí theo đợt đánh giá */
export interface PeriodCriterion {
  id: string;
  period_id: string;
  source_criteria_id: string | null;
  category_name_snapshot: string | null;
  code_snapshot: string | null;
  title_snapshot: string | null;
  description_snapshot: string | null;
  scoring_snapshot: string | null;
  max_score_snapshot: number | null;
  req_doc1: boolean;
  req_doc2: boolean;
  req_link3: boolean;
  responsible_unit_snapshot: string | null;
  deadline_snapshot: string | null;
  sort_order: number | null;
  created_at: string;
}

export interface PeriodCriterionInsert {
  id?: string;
  period_id: string;
  source_criteria_id?: string | null;
  category_name_snapshot?: string | null;
  code_snapshot?: string | null;
  title_snapshot?: string | null;
  description_snapshot?: string | null;
  scoring_snapshot?: string | null;
  max_score_snapshot?: number | null;
  req_doc1?: boolean;
  req_doc2?: boolean;
  req_link3?: boolean;
  responsible_unit_snapshot?: string | null;
  deadline_snapshot?: string | null;
  sort_order?: number | null;
}

/** Gán đợt đánh giá cho đơn vị */
export interface OrganizationPeriod {
  id: string;
  period_id: string;
  organization_id: string;
  assigned_at: string;
  status: OrgPeriodStatus;
}

export interface OrganizationPeriodInsert {
  id?: string;
  period_id: string;
  organization_id: string;
  assigned_at?: string;
  status?: OrgPeriodStatus;
}

export interface OrganizationPeriodUpdate {
  status?: OrgPeriodStatus;
}

/** Bài nộp */
export interface Submission {
  id: string;
  organization_period_id: string;
  period_criteria_id: string;
  status: SubmissionStatus;
  current_revision_id: string | null;
  admin_score: number | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionInsert {
  id?: string;
  organization_period_id: string;
  period_criteria_id: string;
  status?: SubmissionStatus;
  current_revision_id?: string | null;
  admin_score?: number | null;
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface SubmissionUpdate {
  status?: SubmissionStatus;
  current_revision_id?: string | null;
  admin_score?: number | null;
  verified_by?: string | null;
  verified_at?: string | null;
}

/** Phiên bản bài nộp */
export interface SubmissionRevision {
  id: string;
  submission_id: string;
  revision_number: number;
  self_score: number | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface SubmissionRevisionInsert {
  id?: string;
  submission_id: string;
  revision_number: number;
  self_score?: number | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
}

/** Minh chứng */
export interface EvidenceItem {
  id: string;
  revision_id: string;
  evidence_type: EvidenceType;
  file_name: string | null;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface EvidenceItemInsert {
  id?: string;
  revision_id: string;
  evidence_type: EvidenceType;
  file_name?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  uploaded_by?: string | null;
}

/** Hành động thẩm định */
export interface ReviewAction {
  id: string;
  submission_id: string;
  revision_id: string;
  admin_id: string;
  action: ReviewActionType;
  self_score_snapshot: number | null;
  admin_score: number | null;
  comment: string | null;
  created_at: string;
}

export interface ReviewActionInsert {
  id?: string;
  submission_id: string;
  revision_id: string;
  admin_id: string;
  action: ReviewActionType;
  self_score_snapshot?: number | null;
  admin_score?: number | null;
  comment?: string | null;
}

/** Yêu cầu điểm cộng */
export interface BonusRequest {
  id: string;
  organization_period_id: string;
  title: string;
  description: string | null;
  requested_score: number | null;
  approved_score: number | null;
  status: BonusStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BonusRequestInsert {
  id?: string;
  organization_period_id: string;
  title: string;
  description?: string | null;
  requested_score?: number | null;
  approved_score?: number | null;
  status?: BonusStatus;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface BonusRequestUpdate {
  title?: string;
  description?: string | null;
  requested_score?: number | null;
  approved_score?: number | null;
  status?: BonusStatus;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

/** Minh chứng điểm cộng */
export interface BonusEvidenceItem {
  id: string;
  bonus_request_id: string;
  file_name: string | null;
  storage_path: string | null;
  external_url: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface BonusEvidenceItemInsert {
  id?: string;
  bonus_request_id: string;
  file_name?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  uploaded_by?: string | null;
}

/** Hành động thẩm định điểm cộng */
export interface BonusReviewAction {
  id: string;
  bonus_request_id: string;
  admin_id: string;
  action: string;
  requested_score_snapshot: number | null;
  approved_score: number | null;
  comment: string | null;
  created_at: string;
}

export interface BonusReviewActionInsert {
  id?: string;
  bonus_request_id: string;
  admin_id: string;
  action: string;
  requested_score_snapshot?: number | null;
  approved_score?: number | null;
  comment?: string | null;
}

/** Thông báo */
export interface Notification {
  id: string;
  recipient_id: string;
  title: string | null;
  message: string | null;
  type: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationInsert {
  id?: string;
  recipient_id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  related_id?: string | null;
  is_read?: boolean;
}

export interface NotificationUpdate {
  is_read?: boolean;
}

/** Đăng ký push notification */
export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean;
  created_at: string;
}

export interface PushSubscriptionInsert {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active?: boolean;
}

export interface PushSubscriptionUpdate {
  is_active?: boolean;
}

/** Nhật ký hoạt động */
export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogInsert {
  id?: string;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
}

/** Import dữ liệu */
export interface ImportJob {
  id: string;
  imported_by: string;
  file_name: string | null;
  total_rows: number | null;
  success_rows: number | null;
  failed_rows: number | null;
  error_report: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export interface ImportJobInsert {
  id?: string;
  imported_by: string;
  file_name?: string | null;
  total_rows?: number | null;
  success_rows?: number | null;
  failed_rows?: number | null;
  error_report?: Record<string, unknown> | null;
  status?: string;
}

export interface ImportJobUpdate {
  total_rows?: number | null;
  success_rows?: number | null;
  failed_rows?: number | null;
  error_report?: Record<string, unknown> | null;
  status?: string;
}
