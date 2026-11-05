# MASTER PROMPT FINAL
# HỆ THỐNG QUẢN LÝ TIÊU CHÍ & MINH CHỨNG CÔNG TÁC ĐOÀN

Build a complete, production-oriented Vietnamese web application for managing evaluation criteria, evidence submissions, scoring, verification, bonus points, and reporting for local Youth Union organizations (Đoàn Thanh niên).

The application must be a real full-stack enterprise management system, not a static prototype or frontend-only demo.

The entire application must use Vietnamese for all user-facing text.

==================================================
PART 1. PRODUCT OBJECTIVE & BUSINESS ARCHITECTURE
==================================================

## 1.1. Product objective

Build a centralized management platform that allows an administrative authority to manage multiple local Youth Union organizations.

The system must support:

- Centralized administration.
- Multiple independent organizations.
- Multiple custom evaluation periods.
- Username/password authentication.
- Two primary roles: ADMIN and USER.
- Criteria management.
- Multiple evidence files and links per criterion.
- User self-assessment.
- Official administrative scoring.
- Individual criterion verification.
- Evidence revision history.
- Independent bonus-point management.
- Excel bulk import and export.
- Browser push notifications.
- Reporting and analytics.
- Audit logs.
- Secure database and file storage.

The system should be easy to operate for users without technical experience.

## 1.2. Fixed business decisions

These business rules are mandatory:

1. One centralized system manages multiple organizations.
2. Admin can create custom evaluation periods with configurable dates.
3. Users belong to specific organizations.
4. Each organization has its own independent submissions and evidence.
5. Users self-assess their scores.
6. Admin enters the official score.
7. Each criterion is reviewed and verified independently.
8. Each evidence category supports multiple files and multiple links.
9. Bonus points are managed separately from the main criteria.
10. Only approved bonus points contribute to the final score.
11. Historical evaluation periods must be preserved.
12. Every important administrative operation must be recorded in audit logs.
13. Admin and User must use the same unified accordion interface for viewing criteria details, with different available actions based on permissions.

==================================================
PART 2. TECHNOLOGY STACK
==================================================

Frontend:
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- React Router.
- TanStack Query.

Backend:
- Supabase Authentication.
- Supabase PostgreSQL.
- Supabase Storage.
- Supabase Edge Functions.
- Supabase Row Level Security (RLS).

Additional technologies:
- ExcelJS or SheetJS for Excel import/export.
- PDF generation library.
- Web Push API.
- Service Worker.
- VAPID.
- Backend scheduled jobs.

Architecture requirements:

- Use modular and reusable components.
- Use a clean separation between frontend, business logic, and database operations.
- Use Supabase as the persistent source of truth.
- Do not use localStorage or mock arrays as the primary database.
- Do not expose service role keys, VAPID private keys, or secret credentials in frontend code.
- All sensitive operations must be authorized on the backend.

==================================================
PART 3. AUTHENTICATION & USER MANAGEMENT
==================================================

## 3.1. Authentication

Implement real authentication with:

- Username.
- Password.
- Login.
- Logout.
- Session persistence.
- Protected routes.
- Account activation/deactivation.
- Password reset or administrator-assisted password reset.

Supabase Auth does not natively support username/password login.

Implement a secure server-side authentication flow using Supabase Edge Functions.

The system must:
1. Receive username and password.
2. Normalize the username.
3. Resolve the corresponding Auth account.
4. Authenticate through Supabase Auth.
5. Return a standard secure authentication session.

Use an internal authentication identifier if needed.

Never:
- Store plaintext passwords.
- Expose internal authentication identifiers unnecessarily.
- Store passwords in custom database tables.
- Allow users to assign themselves an Admin role.
- Reveal whether a username exists through detailed login errors.

Implement rate limiting and secure authentication error handling.

## 3.2. User roles

Two primary roles:

### ADMIN

Admin can:
- Manage all organizations.
- Create, edit, deactivate user accounts.
- Reset user passwords.
- Create and manage evaluation periods.
- Create and manage criteria.
- Import criteria from Excel.
- Assign evaluation periods to organizations.
- View all submissions.
- Review evidence.
- Request additional evidence.
- Enter official scores.
- Verify criteria.
- Manage bonus points.
- View reports and analytics.
- Export Excel/PDF.
- View audit logs.
- Manage notifications.

### USER – ĐOÀN CƠ SỞ

User can:
- View their organization profile.
- View assigned evaluation periods.
- View assigned criteria.
- Save drafts.
- Upload multiple evidence files.
- Add multiple evidence links.
- Enter self-assessed scores.
- Submit criteria.
- Resubmit criteria after revision requests.
- View official scores.
- View Admin feedback.
- Propose bonus points.
- View evaluation progress.
- View notifications.

Users must only access their own organization's data.

## 3.3. User management

Admin can create accounts with:

- Username.
- Initial password.
- Display name.
- Organization.
- Role.
- Account status.

Support multiple accounts belonging to the same organization.

An organization can have multiple user accounts, but all accounts belonging to that organization share the same organization's submissions.

==================================================
PART 4. DATABASE SCHEMA
==================================================

Design a normalized Supabase PostgreSQL database.

All tables must use UUID primary keys, appropriate foreign keys, timestamps, indexes, constraints, and RLS policies.

Create the following tables.

### 4.1. profiles

Fields:
- id UUID PRIMARY KEY REFERENCES auth.users(id).
- username TEXT UNIQUE NOT NULL.
- display_name TEXT NOT NULL.
- role ENUM('admin','user').
- organization_id UUID NULL REFERENCES organizations(id).
- is_active BOOLEAN DEFAULT TRUE.
- created_at TIMESTAMPTZ.
- updated_at TIMESTAMPTZ.

Admin has organization_id = NULL.

User must belong to a valid organization.

### 4.2. organizations

Fields:
- id UUID PRIMARY KEY.
- code TEXT UNIQUE.
- name TEXT NOT NULL.
- description TEXT.
- contact_name TEXT.
- contact_phone TEXT.
- is_active BOOLEAN DEFAULT TRUE.
- created_at TIMESTAMPTZ.
- updated_at TIMESTAMPTZ.

### 4.3. criteria_categories

Fields:
- id UUID PRIMARY KEY.
- code TEXT.
- name TEXT NOT NULL.
- description TEXT.
- sort_order INTEGER.
- created_at TIMESTAMPTZ.

### 4.4. criteria_library

Master criteria library.

Fields:
- id UUID PRIMARY KEY.
- category_id UUID REFERENCES criteria_categories(id).
- code TEXT NOT NULL.
- title TEXT NOT NULL.
- description TEXT.
- scoring_guidelines TEXT.
- max_score NUMERIC(10,2) NOT NULL.
- req_doc1 BOOLEAN DEFAULT FALSE.
- req_doc2 BOOLEAN DEFAULT FALSE.
- req_link3 BOOLEAN DEFAULT FALSE.
- responsible_unit TEXT.
- deadline TIMESTAMPTZ NULL.
- sort_order INTEGER.
- is_active BOOLEAN DEFAULT TRUE.
- created_at TIMESTAMPTZ.
- updated_at TIMESTAMPTZ.

The three evidence types are:

1. Văn bản triển khai.
2. Báo cáo kết quả.
3. Tin bài về hoạt động.

Each evidence type can independently be required or disabled.

### 4.5. evaluation_periods

Fields:
- id UUID PRIMARY KEY.
- name TEXT NOT NULL.
- description TEXT.
- start_at TIMESTAMPTZ.
- submission_deadline TIMESTAMPTZ.
- review_deadline TIMESTAMPTZ.
- status ENUM('draft','active','closed','archived').
- created_by UUID REFERENCES profiles(id).
- created_at TIMESTAMPTZ.
- updated_at TIMESTAMPTZ.

### 4.6. period_criteria

Store immutable snapshots of criteria for each evaluation period.

Fields:
- id UUID PRIMARY KEY.
- period_id UUID REFERENCES evaluation_periods(id).
- source_criteria_id UUID NULL.
- category_name_snapshot TEXT.
- code_snapshot TEXT.
- title_snapshot TEXT.
- description_snapshot TEXT.
- scoring_snapshot TEXT.
- max_score_snapshot NUMERIC(10,2).
- req_doc1 BOOLEAN.
- req_doc2 BOOLEAN.
- req_link3 BOOLEAN.
- responsible_unit_snapshot TEXT.
- deadline_snapshot TIMESTAMPTZ.
- sort_order INTEGER.
- created_at TIMESTAMPTZ.

Once a period becomes active, criteria must not be silently modified.

Changes to the master criteria library must never automatically change historical evaluation snapshots.

### 4.7. organization_periods

Fields:
- id UUID PRIMARY KEY.
- period_id UUID REFERENCES evaluation_periods(id).
- organization_id UUID REFERENCES organizations(id).
- assigned_at TIMESTAMPTZ.
- status ENUM('assigned','in_progress','completed','closed').

Unique constraint:
(period_id, organization_id).

### 4.8. submissions

One submission per organization and criterion per evaluation period.

Fields:
- id UUID PRIMARY KEY.
- organization_period_id UUID REFERENCES organization_periods(id).
- period_criteria_id UUID REFERENCES period_criteria(id).
- status ENUM('draft','submitted','revision_requested','verified').
- current_revision_id UUID NULL.
- admin_score NUMERIC(10,2) NULL.
- verified_by UUID NULL REFERENCES profiles(id).
- verified_at TIMESTAMPTZ NULL.
- created_at TIMESTAMPTZ.
- updated_at TIMESTAMPTZ.

Unique constraint:
(organization_period_id, period_criteria_id).

### 4.9. submission_revisions

Preserve every submission version.

Fields:
- id UUID PRIMARY KEY.
- submission_id UUID REFERENCES submissions(id).
- revision_number INTEGER NOT NULL.
- self_score NUMERIC(10,2).
- submitted_by UUID REFERENCES profiles(id).
- submitted_at TIMESTAMPTZ.
- created_at TIMESTAMPTZ.

Unique constraint:
(submission_id, revision_number).

Every resubmission must create a new revision.

### 4.10. evidence_items

Fields:
- id UUID PRIMARY KEY.
- revision_id UUID REFERENCES submission_revisions(id).
- evidence_type ENUM('doc1','doc2','link3').
- file_name TEXT.
- storage_path TEXT.
- external_url TEXT.
- mime_type TEXT.
- file_size BIGINT.
- uploaded_by UUID REFERENCES profiles(id).
- created_at TIMESTAMPTZ.

Support multiple records for each evidence type.

A file record must have storage_path.

A link record must have external_url.

Validate that evidence types match the requirements of the corresponding criterion.

### 4.11. review_actions

Fields:
- id UUID PRIMARY KEY.
- submission_id UUID REFERENCES submissions(id).
- revision_id UUID REFERENCES submission_revisions(id).
- admin_id UUID REFERENCES profiles(id).
- action ENUM('verified','revision_requested','reopened').
- self_score_snapshot NUMERIC(10,2).
- admin_score NUMERIC(10,2).
- comment TEXT.
- created_at TIMESTAMPTZ.

Preserve all review history.

### 4.12. bonus_requests

Fields:
- id UUID PRIMARY KEY.
- organization_period_id UUID REFERENCES organization_periods(id).
- title TEXT NOT NULL.
- description TEXT.
- requested_score NUMERIC(10,2).
- approved_score NUMERIC(10,2) NULL.
- status ENUM('draft','submitted','revision_requested','approved','rejected').
- submitted_at TIMESTAMPTZ.
- reviewed_by UUID REFERENCES profiles(id).
- reviewed_at TIMESTAMPTZ.
- created_at TIMESTAMPTZ.
- updated_at TIMESTAMPTZ.

### 4.13. bonus_evidence_items

Fields:
- id UUID PRIMARY KEY.
- bonus_request_id UUID REFERENCES bonus_requests(id).
- file_name TEXT.
- storage_path TEXT.
- external_url TEXT.
- uploaded_by UUID REFERENCES profiles(id).
- created_at TIMESTAMPTZ.

### 4.14. bonus_review_actions

Fields:
- id UUID PRIMARY KEY.
- bonus_request_id UUID REFERENCES bonus_requests(id).
- admin_id UUID REFERENCES profiles(id).
- action TEXT.
- requested_score_snapshot NUMERIC(10,2).
- approved_score NUMERIC(10,2).
- comment TEXT.
- created_at TIMESTAMPTZ.

### 4.15. notifications

Fields:
- id UUID PRIMARY KEY.
- recipient_id UUID REFERENCES profiles(id).
- title TEXT.
- message TEXT.
- type TEXT.
- related_id UUID NULL.
- is_read BOOLEAN DEFAULT FALSE.
- created_at TIMESTAMPTZ.

### 4.16. push_subscriptions

Fields:
- id UUID PRIMARY KEY.
- user_id UUID REFERENCES profiles(id).
- endpoint TEXT UNIQUE.
- p256dh TEXT.
- auth TEXT.
- is_active BOOLEAN DEFAULT TRUE.
- created_at TIMESTAMPTZ.

### 4.17. audit_logs

Fields:
- id UUID PRIMARY KEY.
- actor_id UUID REFERENCES profiles(id).
- action TEXT.
- entity_type TEXT.
- entity_id UUID.
- old_values JSONB.
- new_values JSONB.
- ip_address INET NULL.
- created_at TIMESTAMPTZ.

Audit logs must be append-only for application users.

### 4.18. import_jobs

Fields:
- id UUID PRIMARY KEY.
- imported_by UUID REFERENCES profiles(id).
- file_name TEXT.
- total_rows INTEGER.
- success_rows INTEGER.
- failed_rows INTEGER.
- error_report JSONB.
- status TEXT.
- created_at TIMESTAMPTZ.

### 4.19. Database integrity

Implement:
- Foreign key constraints.
- Unique constraints.
- Appropriate database indexes.
- Non-negative score validation.
- Maximum score validation.
- Valid status constraints.
- Organization ownership validation.
- Referential integrity between submissions and revisions.
- Transaction-safe submission operations.

Ensure current_revision_id always references a revision belonging to the corresponding submission.

Use database triggers or secure backend functions for important state transitions where appropriate.

==================================================
PART 5. ROW LEVEL SECURITY & PERMISSIONS
==================================================

Enable RLS on all sensitive tables.

Create reusable database helper functions such as:
- is_admin().
- get_my_organization_id().
- is_organization_member(organization_id).

### ADMIN

Admin can:
- Read all organizations.
- Manage accounts.
- Manage criteria.
- Manage evaluation periods.
- Assign periods.
- Read and review all submissions.
- Verify scores.
- Manage bonus points.
- Read audit logs.
- Manage notifications.

### USER

User can:
- Read their own organization.
- Read assigned evaluation periods.
- Read assigned criteria.
- Create and update their organization's drafts.
- Upload evidence for their organization.
- Submit and resubmit when permitted.
- Read their organization's review results.
- Create bonus requests.
- Read their own notifications.

Users cannot:
- Change their own role.
- Change their organization.
- Change official scores.
- Verify criteria.
- Approve bonus points.
- Read another organization's submissions.
- Access another organization's private files.
- Modify audit logs.

Enforce permissions in the database and backend, not only in frontend components.

Use private Supabase Storage buckets and policies that validate organization ownership.

==================================================
PART 6. EVALUATION PERIOD MANAGEMENT
==================================================

Create a module named:

"Quản lý đợt đánh giá"

Admin can:
- Create an evaluation period.
- Edit draft periods.
- Set start date.
- Set submission deadline.
- Set review deadline.
- Select criteria.
- Select participating organizations.
- Clone criteria from an existing period.
- Publish an evaluation period.
- Close a period.
- Archive historical periods.

Period statuses:

- Draft.
- Active.
- Closed.
- Archived.

Workflow:

1. Admin creates a period.
2. Admin selects criteria.
3. System creates immutable criteria snapshots.
4. Admin selects organizations.
5. System creates organization-period assignments.
6. Admin publishes the period.
7. Organizations receive notifications.
8. Users start submitting evidence.

Do not delete historical submissions when a new period is created.

Do not automatically modify previous period criteria.

==================================================
PART 7. CRITERIA MANAGEMENT
==================================================

Create a module named:

"Quản lý bộ tiêu chí"

Admin can:
- Create criteria.
- Edit criteria.
- Delete criteria that have never been used.
- Deactivate criteria already referenced by historical records.
- Create categories.
- Organize criteria by category.
- Configure scoring instructions.
- Configure maximum scores.
- Configure evidence requirements.
- Set responsible units.
- Set deadlines.
- Reorder criteria.

Each criterion includes:

- Criterion code.
- Criterion title.
- Description.
- Scoring instructions.
- Maximum score.
- Responsible unit.
- Deadline.
- Category.
- Display order.
- Evidence configuration.

### Standard evidence types

1. Văn bản triển khai.
2. Báo cáo kết quả.
3. Tin bài về hoạt động (hình ảnh phải rõ nội dung, thời gian tổ chức).

Each evidence type independently supports:
- Required.
- Not required.

A criterion may require:
- All three evidence types.
- Only two.
- Only one.
- No evidence.

If no evidence is required, display:

"Tiêu chí này không yêu cầu minh chứng."

Do not display unnecessary upload boxes.

==================================================
PART 8. UNIFIED ACCORDION UI – CRITERIA & EVIDENCE
==================================================

THIS IS A CRITICAL UI REQUIREMENT.

Use the provided reference screenshot as the main design inspiration for the Criteria and Evidence interface.

Both ADMIN and USER must use the SAME accordion-based layout.

Do not create separate page designs for Admin and User.

Only the available actions and editable fields differ according to role permissions.

## 8.1. Main layout

Display all criteria as a vertical list of expandable accordion cards.

Default state: COLLAPSED.

When clicking anywhere on a criterion header, expand its details inline.

Clicking again collapses it.

Support:
- Multiple expanded criteria simultaneously.
- Expand all.
- Collapse all.
- Smooth transitions.
- Preserving form state when collapsing.
- No unnecessary page navigation.

## 8.2. Collapsed criterion header

Display:

- Criterion code, e.g. 2.6.
- Criterion title.
- Short description.
- Maximum score.
- Self-assessed score.
- Evidence completion count.
- Submission status.
- Verification status.
- Expand/collapse icon.

Example:

2.6 – Đoàn xã, phường đồng loạt tổ chức Ngày Chủ nhật xanh vào các ngày 22/3; 24/5; 26/7; 20/9.

Display:
- 4/4 điểm.
- 3/3 loại minh chứng đã nộp.
- Đã nộp.
- Chưa thẩm định.

Use separate indicators for submission status and verification status.

Status colors:
- Chưa nộp: Gray.
- Bản nháp: Blue.
- Đã nộp: Green.
- Yêu cầu bổ sung: Orange.
- Đã xác thực: Dark green.

## 8.3. Expanded criterion layout

When expanded, show TWO main columns on desktop.

LEFT COLUMN: THÔNG TIN TIÊU CHÍ

Display:

1. Nội dung.
2. Nguyên tắc chấm điểm.
3. Yêu cầu chung.
4. Tổ phụ trách.
5. Thời hạn.
6. Điểm tối đa.
7. Điểm tự chấm.

RIGHT COLUMN: MINH CHỨNG CẦN NỘP

Display three independent evidence sections:

1. Văn bản triển khai.
2. Báo cáo tóm tắt kết quả.
3. Tin bài về hoạt động.

Each section must show:
- Evidence type.
- Required indicator.
- Upload controls.
- Uploaded files.
- Uploaded links.
- Upload status.
- File size.
- Upload date.
- Open/download action.
- Preview when supported.

Allow multiple files and multiple links per evidence type.

If an evidence type is disabled, hide its upload controls.

If all three types are disabled, show:

"Tiêu chí này không yêu cầu minh chứng."

## 8.4. USER accordion actions

User can:

- View criterion information.
- Enter self-assessed score.
- Upload multiple files.
- Add multiple links.
- Preview files.
- Replace files.
- Remove files before submission.
- Save Draft.
- Submit Criterion.

When a submission is under revision:
- Display Admin feedback.
- Highlight missing evidence.
- Allow resubmission.
- Preserve previous revisions.

When verified:
- Display official score.
- Display Admin comments.
- Make the submission read-only unless Admin reopens it.

## 8.5. ADMIN accordion actions

Admin uses the same accordion design.

Admin can view:

- Organization name.
- Criterion information.
- User self-assessed score.
- Uploaded evidence.
- External links.
- Submission date.
- Revision history.

Admin can:
- Enter official score.
- Add review comments.
- Verify criterion.
- Request additional evidence.
- Reopen verified submission with mandatory reason.

The official score must be validated between zero and maximum score.

Do not allow verification without an official score.

Do not allow verification of incomplete required evidence unless an explicitly authorized exception is implemented and logged.

## 8.6. Responsive behavior

Desktop:
- Two-column layout.
- Criterion information on the left.
- Evidence on the right.

Tablet:
- Responsive columns or stacked layout.

Mobile:
- Single-column layout.
- Criterion information first.
- Evidence below.
- Touch-friendly controls.
- Sticky bottom action bar with safe-area support.

==================================================
PART 9. USER DASHBOARD & SUBMISSION WORKFLOW
==================================================

Create a page named:

"Bộ tiêu chí đánh giá"

At the top, show:

- Evaluation period.
- Organization name.
- Total criteria.
- Submitted criteria.
- Verified criteria.
- Pending criteria.
- Remaining criteria.
- Progress bar.

Add:
- Search by criterion code or title.
- Filter by category.
- Filter by submission status.
- Filter by verification status.
- Sort by display order.

### User submission workflow

Draft → Submitted → Verified.

Draft → Submitted → Revision Requested → Submitted → Verified.

Rules:

- Saving a draft does not count as submitted.
- Submission must require confirmation.
- Admin must provide a reason for revision requests.
- Resubmission creates a new revision.
- Previous revisions remain available.
- Verified submissions are read-only by default.
- Admin reopening requires a reason and audit log.

### User sticky action bar

At the bottom of the criteria page:

- Overall progress.
- Save All Drafts.
- Submit All Eligible Criteria.

Submit All must:
- Require confirmation.
- Show the number of eligible criteria.
- Skip incomplete criteria.
- Never silently submit incomplete records.

==================================================
PART 10. ADMIN GRADING & VERIFICATION
==================================================

Create an Admin module:

"Thẩm định & xác thực"

Admin can filter by:
- Evaluation period.
- Organization.
- Category.
- Criterion.
- Submission status.
- Verification status.

Show a review queue.

For each submission:
- View organization.
- View criterion.
- View self-assessed score.
- View all evidence.
- View submission date.
- View revision history.
- Enter official score.
- Add review comments.

Admin actions:

1. Verify.
2. Request additional evidence.
3. Reopen verified submission.

All actions must be logged.

Official score must never be automatically replaced by self-assessed score.

==================================================
PART 11. BONUS POINTS
==================================================

Create a separate module:

"Điểm cộng"

### USER

User can:
- Create a bonus-point request.
- Enter activity title.
- Enter activity description.
- Upload multiple evidence files.
- Add external links.
- Enter requested score.
- Save draft.
- Submit request.
- View review status.

### ADMIN

Admin can:
- View all bonus requests.
- Review evidence.
- Approve.
- Reject.
- Request additional evidence.
- Enter approved score.
- Add review comments.

Bonus statuses:
- Draft.
- Submitted.
- Revision Requested.
- Approved.
- Rejected.

Requested score and approved score must be stored separately.

Only approved bonus scores contribute to the final score.

Preserve bonus-point review history.

==================================================
PART 12. SCORING & FINAL RESULTS
==================================================

Calculate:

Verified Criteria Score =
Sum of official scores of verified criteria.

Approved Bonus Score =
Sum of approved bonus requests.

Final Score =
Verified Criteria Score + Approved Bonus Score.

Never add self-assessed scores to the official total.

Display separately:

- Maximum possible criteria score.
- Verified criteria score.
- Pending verification.
- Unsubmitted criteria.
- Approved bonus points.
- Final score.

Do not treat an unverified criterion as an actual zero score.

Show incomplete evaluation status until the relevant criteria have been reviewed.

All calculations must be performed using trusted database/backend data, not arbitrary frontend values.

==================================================
PART 13. EXCEL IMPORT & EXPORT
==================================================

Create a module:

"Import / Export Excel"

Admin can download an official Excel template.

Template columns:

- Category_Code.
- Category_Name.
- Criterion_Code.
- Criterion_Title.
- Description.
- Scoring_Guidelines.
- Max_Score.
- Requires_Doc1.
- Requires_Doc2.
- Requires_Link3.
- Responsible_Unit.
- Deadline.
- Display_Order.

Boolean values must be TRUE/FALSE.

Import workflow:

1. Download template.
2. Upload Excel file.
3. Validate file format.
4. Validate required columns.
5. Preview imported data.
6. Identify duplicate codes.
7. Display row-specific errors.
8. Confirm import.
9. Save valid records.
10. Display import summary.

Never silently skip invalid records.

Never automatically delete existing criteria during import.

Implement transaction-safe import operations.

Admin can export:

- Master criteria.
- Organization results.
- Criteria scores.
- Verification progress.
- Bonus-point reports.
- Evaluation summaries.

Use Vietnamese column headers in exported reports.

==================================================
PART 14. PUSH NOTIFICATIONS
==================================================

Implement real browser push notifications.

Technologies:
- Web Push API.
- Service Worker.
- VAPID.
- Supabase Edge Functions.
- Secure backend scheduled jobs.

Notification events:

For USER:
- New evaluation period published.
- New criteria assigned.
- Upcoming submission deadline.
- Submission successfully received.
- Revision requested.
- Criterion verified.
- Bonus request approved or rejected.

For ADMIN:
- New submission received.
- New bonus request.
- Criteria waiting for verification.
- Organization approaching deadline.
- New resubmission.

Features:
- Notification bell.
- Unread count.
- Notification history.
- Mark as read.
- Notification preferences.
- Enable/disable push.

Request browser notification permission only after the user explicitly clicks:

"Bật thông báo".

Do not rely on frontend setInterval for scheduled notifications.

Use backend scheduled jobs or secure scheduling infrastructure.

Provide in-app notification fallback.

==================================================
PART 15. REPORTING & ANALYTICS
==================================================

Create an Admin dashboard with KPI cards:

- Total organizations.
- Active evaluation periods.
- Total criteria.
- Submitted criteria.
- Unsubmitted criteria.
- Pending verification.
- Verified criteria.
- Pending bonus requests.

Charts:
- Submission progress.
- Verification progress.
- Score distribution.
- Organization score comparison.
- Completion by category.

Create reports:

1. Organization evaluation report.
2. Criteria completion report.
3. Verification report.
4. Bonus-point report.
5. Organization ranking report.
6. Evaluation period comparison.

Support:
- Excel export.
- PDF export.
- Filters by evaluation period.
- Filters by organization.

Organization ranking must only be displayed when Admin enables it.

==================================================
PART 16. AUDIT LOGS
==================================================

Record:

- Login events where appropriate.
- Account creation and modification.
- Organization changes.
- Criteria changes.
- Evaluation period changes.
- Excel imports.
- Evidence uploads.
- Evidence deletion.
- Submission.
- Resubmission.
- Revision requests.
- Score changes.
- Verification.
- Bonus approval.
- Reopening verified submissions.

Each log must include:
- Actor.
- Action.
- Entity type.
- Entity ID.
- Timestamp.
- Old values.
- New values.

Audit logs must not be editable by ordinary application users.

==================================================
PART 17. FILE STORAGE & SECURITY
==================================================

Create private Supabase Storage buckets.

Suggested structure:

evidence/
  {organization_id}/
    {period_id}/
      {submission_id}/
        {revision_id}/
          {file_name}

bonus-evidence/
  {organization_id}/
    {period_id}/
      {bonus_request_id}/
        {file_name}

Supported files:
- PDF.
- DOC.
- DOCX.
- XLS.
- XLSX.
- JPG.
- PNG.

Implement:
- File size validation.
- MIME type validation.
- File extension validation.
- Private storage.
- Signed URLs.
- Ownership verification.
- Secure file deletion rules.
- Evidence version preservation.

Never expose private storage files publicly.

Do not allow a user to access another organization's files by guessing storage paths or IDs.

==================================================
PART 18. UI/UX DESIGN SYSTEM
==================================================

Design a professional Vietnamese government/organizational management dashboard.

Visual direction:

- Primary color: Deep navy blue.
- Secondary accent: Restrained red.
- Background: Light gray.
- Cards: White.
- Borders: Subtle gray.
- Typography: Inter or another Vietnamese-compatible font.
- Consistent spacing.
- Clear hierarchy.
- Minimal unnecessary animation.

Avoid:
- Excessive gradients.
- Overly colorful dashboards.
- Dense layouts.
- Tiny text.
- Decorative elements that reduce usability.

### ADMIN SIDEBAR

1. Tổng quan.
2. Quản lý đơn vị.
3. Quản lý tài khoản.
4. Đợt đánh giá.
5. Bộ tiêu chí.
6. Import / Export Excel.
7. Thẩm định & xác thực.
8. Điểm cộng.
9. Báo cáo & thống kê.
10. Thông báo.
11. Nhật ký hoạt động.
12. Cài đặt hệ thống.

### USER SIDEBAR

1. Tổng quan.
2. Bộ tiêu chí đánh giá.
3. Kho minh chứng.
4. Điểm cộng.
5. Kết quả đánh giá.
6. Thông báo.
7. Tài khoản.

### GLOBAL UX REQUIREMENTS

- Breadcrumb navigation.
- Search.
- Filters.
- Pagination.
- Loading skeletons.
- Empty states.
- Error states.
- Confirmation dialogs.
- Toast notifications.
- Accessible forms.
- Consistent status badges.
- Responsive design.

==================================================
PART 19. RELIABILITY, PERFORMANCE & TESTING
==================================================

The application must support growth in organizations, criteria, evaluation periods, submissions, and evidence files.

Implement:
- Database indexes.
- Pagination.
- Optimized queries.
- Transaction-safe operations.
- Duplicate prevention.
- Concurrent update handling.
- Error handling.
- Network failure handling.
- Data validation.
- Backup and recovery strategy.

Create automated or repeatable tests for:

1. Admin login.
2. User login.
3. Invalid authentication.
4. Role restrictions.
5. Cross-organization data access prevention.
6. Private file access.
7. Excel import validation.
8. Draft saving.
9. Evidence upload.
10. Submission.
11. Resubmission.
12. Verification.
13. Official score calculations.
14. Bonus-point approval.
15. Notification delivery.
16. Historical data preservation.

Do not claim a feature is complete if it only has a visual interface without working backend functionality.

==================================================
PART 20. IMPLEMENTATION INSTRUCTIONS
==================================================

Build this application as a new project.

Before coding:

1. Understand the complete business requirements.
2. Design the database schema.
3. Define foreign keys and constraints.
4. Design all RLS policies.
5. Define authentication flow.
6. Design navigation.
7. Design reusable components.
8. Define submission and verification state transitions.

Implement in the following phases:

PHASE 1 – SYSTEM FOUNDATION
- Supabase connection.
- Database migrations.
- Authentication.
- Username login.
- User management.
- Organization management.
- RLS.
- Protected routes.
- Admin and User dashboard shells.

PHASE 2 – CRITERIA & EVALUATION PERIODS
- Master criteria library.
- Categories.
- Evaluation periods.
- Criteria snapshots.
- Organization assignments.
- Excel import/export.

PHASE 3 – ACCORDION SUBMISSION INTERFACE
- Unified accordion UI.
- Criterion information.
- Evidence requirements.
- Multiple file uploads.
- Multiple links.
- Self-assessment.
- Draft saving.
- Submission.
- Revision history.

PHASE 4 – ADMIN REVIEW
- Review queue.
- Evidence preview.
- Official scoring.
- Verification.
- Revision requests.
- Reopening verified submissions.

PHASE 5 – BONUS POINTS & NOTIFICATIONS
- Bonus requests.
- Evidence management.
- Approval workflow.
- In-app notifications.
- Web Push.
- Scheduled notifications.

PHASE 6 – REPORTING & PRODUCTION READINESS
- Analytics.
- Excel/PDF exports.
- Audit logs.
- Security testing.
- Performance optimization.
- Responsive testing.
- Backup strategy.

IMPORTANT IMPLEMENTATION RULES:

- Do not replace actual backend operations with mock data.
- Do not implement fake authentication.
- Do not bypass RLS.
- Do not expose private credentials.
- Do not silently change business rules.
- Do not remove existing functionality during updates.
- Use database migrations for schema changes.
- Test all critical workflows.
- Preserve historical records.
- Keep components reusable and maintainable.

At the end of each phase:
1. Summarize implemented features.
2. Identify incomplete features.
3. Verify database and RLS behavior.
4. Test the main user workflows.
5. Confirm that previous functionality remains intact.

The final product must be a stable, secure, maintainable, responsive Vietnamese web application ready for real organizational use.

START BY ANALYZING THE FULL SPECIFICATION AND DESIGNING THE DATABASE, AUTHENTICATION, RLS POLICIES, AND APPLICATION ARCHITECTURE BEFORE IMPLEMENTING THE FRONTEND.