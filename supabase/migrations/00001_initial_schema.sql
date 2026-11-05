-- ============================================================
-- UNION ACTIVITY TRACKER – INITIAL DATABASE MIGRATION
-- HỆ THỐNG QUẢN LÝ TIÊU CHÍ & MINH CHỨNG CÔNG TÁC ĐOÀN
-- ============================================================
-- Migration: 00001_initial_schema.sql
-- Description: Complete database schema, RLS policies, triggers,
--              helper functions, and seed data function.
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SECTION 1: CUSTOM ENUM TYPES
-- Định nghĩa các kiểu enum cho hệ thống
-- ============================================================

-- Vai trò người dùng: quản trị viên hoặc người dùng đoàn cơ sở
CREATE TYPE public.user_role AS ENUM ('admin', 'user');

-- Trạng thái đợt đánh giá
CREATE TYPE public.period_status AS ENUM ('draft', 'active', 'closed', 'archived');

-- Trạng thái gán đợt đánh giá cho đơn vị
CREATE TYPE public.org_period_status AS ENUM ('assigned', 'in_progress', 'completed', 'closed');

-- Trạng thái nộp bài (tiêu chí)
CREATE TYPE public.submission_status AS ENUM ('draft', 'submitted', 'revision_requested', 'verified');

-- Trạng thái yêu cầu điểm cộng
CREATE TYPE public.bonus_status AS ENUM ('draft', 'submitted', 'revision_requested', 'approved', 'rejected');

-- Loại minh chứng:
--   doc1 = Văn bản triển khai
--   doc2 = Báo cáo kết quả
--   link3 = Tin bài về hoạt động
CREATE TYPE public.evidence_type AS ENUM ('doc1', 'doc2', 'link3');

-- Hành động thẩm định của admin
CREATE TYPE public.review_action_type AS ENUM ('verified', 'revision_requested', 'reopened');


-- ============================================================
-- SECTION 2: TABLES
-- Tạo toàn bộ 18 bảng theo PRD
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 organizations – Quản lý đơn vị Đoàn cơ sở
-- ------------------------------------------------------------
CREATE TABLE public.organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    contact_name  TEXT,
    contact_phone TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS 'Đơn vị Đoàn cơ sở tham gia đánh giá';

-- ------------------------------------------------------------
-- 2.2 profiles – Hồ sơ người dùng, liên kết auth.users
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        TEXT UNIQUE NOT NULL,
    display_name    TEXT NOT NULL,
    role            public.user_role NOT NULL DEFAULT 'user',
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Admin không thuộc đơn vị nào; User bắt buộc phải có đơn vị
    CONSTRAINT chk_user_must_have_org CHECK (
        role = 'admin' OR organization_id IS NOT NULL
    )
);

COMMENT ON TABLE public.profiles IS 'Hồ sơ người dùng hệ thống, liên kết với auth.users';

-- ------------------------------------------------------------
-- 2.3 criteria_categories – Nhóm tiêu chí
-- ------------------------------------------------------------
CREATE TABLE public.criteria_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT,
    name        TEXT NOT NULL,
    description TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.criteria_categories IS 'Phân nhóm/loại tiêu chí đánh giá';

-- ------------------------------------------------------------
-- 2.4 criteria_library – Thư viện tiêu chí gốc
-- ------------------------------------------------------------
CREATE TABLE public.criteria_library (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id         UUID REFERENCES public.criteria_categories(id) ON DELETE SET NULL,
    code                TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    scoring_guidelines  TEXT,
    max_score           NUMERIC(10,2) NOT NULL,
    -- 3 loại minh chứng có thể bật/tắt độc lập
    req_doc1            BOOLEAN NOT NULL DEFAULT FALSE,   -- Văn bản triển khai
    req_doc2            BOOLEAN NOT NULL DEFAULT FALSE,   -- Báo cáo kết quả
    req_link3           BOOLEAN NOT NULL DEFAULT FALSE,   -- Tin bài về hoạt động
    responsible_unit    TEXT,
    deadline            TIMESTAMPTZ,
    sort_order          INTEGER DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Điểm tối đa phải dương
    CONSTRAINT chk_criteria_max_score_positive CHECK (max_score > 0)
);

COMMENT ON TABLE public.criteria_library IS 'Thư viện tiêu chí gốc (master), chỉnh sửa tại đây không ảnh hưởng đợt đánh giá cũ';

-- ------------------------------------------------------------
-- 2.5 evaluation_periods – Đợt đánh giá
-- ------------------------------------------------------------
CREATE TABLE public.evaluation_periods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    description         TEXT,
    start_at            TIMESTAMPTZ,
    submission_deadline TIMESTAMPTZ,
    review_deadline     TIMESTAMPTZ,
    status              public.period_status NOT NULL DEFAULT 'draft',
    created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Thời hạn nộp phải sau ngày bắt đầu
    CONSTRAINT chk_submission_after_start CHECK (
        submission_deadline IS NULL OR start_at IS NULL OR submission_deadline >= start_at
    ),
    -- Thời hạn thẩm định phải sau thời hạn nộp
    CONSTRAINT chk_review_after_submission CHECK (
        review_deadline IS NULL OR submission_deadline IS NULL OR review_deadline >= submission_deadline
    )
);

COMMENT ON TABLE public.evaluation_periods IS 'Đợt đánh giá với thời gian bắt đầu, hạn nộp, hạn thẩm định';

-- ------------------------------------------------------------
-- 2.6 period_criteria – Bản sao tiêu chí cho mỗi đợt (immutable snapshot)
-- Khi đợt đánh giá active, dữ liệu này không được thay đổi
-- ------------------------------------------------------------
CREATE TABLE public.period_criteria (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id                UUID NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
    source_criteria_id       UUID REFERENCES public.criteria_library(id) ON DELETE SET NULL,
    category_name_snapshot   TEXT,
    code_snapshot            TEXT,
    title_snapshot           TEXT,
    description_snapshot     TEXT,
    scoring_snapshot         TEXT,
    max_score_snapshot       NUMERIC(10,2) NOT NULL,
    req_doc1                 BOOLEAN NOT NULL DEFAULT FALSE,
    req_doc2                 BOOLEAN NOT NULL DEFAULT FALSE,
    req_link3                BOOLEAN NOT NULL DEFAULT FALSE,
    responsible_unit_snapshot TEXT,
    deadline_snapshot        TIMESTAMPTZ,
    sort_order               INTEGER DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_period_criteria_max_score CHECK (max_score_snapshot > 0)
);

COMMENT ON TABLE public.period_criteria IS 'Bản sao bất biến (snapshot) của tiêu chí cho từng đợt đánh giá';

-- ------------------------------------------------------------
-- 2.7 organization_periods – Gán đợt đánh giá cho đơn vị
-- ------------------------------------------------------------
CREATE TABLE public.organization_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id       UUID NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          public.org_period_status NOT NULL DEFAULT 'assigned',

    -- Mỗi đơn vị chỉ được gán 1 lần cho mỗi đợt
    CONSTRAINT uq_org_period UNIQUE (period_id, organization_id)
);

COMMENT ON TABLE public.organization_periods IS 'Gán đợt đánh giá cho các đơn vị Đoàn cơ sở';

-- ------------------------------------------------------------
-- 2.8 submissions – Bài nộp cho từng tiêu chí
-- Mỗi đơn vị + tiêu chí + đợt = 1 bài nộp duy nhất
-- ------------------------------------------------------------
CREATE TABLE public.submissions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_period_id UUID NOT NULL REFERENCES public.organization_periods(id) ON DELETE CASCADE,
    period_criteria_id    UUID NOT NULL REFERENCES public.period_criteria(id) ON DELETE CASCADE,
    status                public.submission_status NOT NULL DEFAULT 'draft',
    current_revision_id   UUID,  -- FK added below after submission_revisions is created
    admin_score           NUMERIC(10,2),
    verified_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Mỗi đơn vị chỉ nộp 1 bài cho mỗi tiêu chí trong 1 đợt
    CONSTRAINT uq_submission_org_criteria UNIQUE (organization_period_id, period_criteria_id),

    -- Điểm admin phải >= 0
    CONSTRAINT chk_admin_score_non_negative CHECK (admin_score IS NULL OR admin_score >= 0)
);

COMMENT ON TABLE public.submissions IS 'Bài nộp của đơn vị cho từng tiêu chí trong đợt đánh giá';

-- ------------------------------------------------------------
-- 2.9 submission_revisions – Lịch sử các lần nộp/sửa
-- ------------------------------------------------------------
CREATE TABLE public.submission_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    self_score      NUMERIC(10,2),
    submitted_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    submitted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Mỗi bài nộp có số revision duy nhất
    CONSTRAINT uq_submission_revision UNIQUE (submission_id, revision_number),

    -- Điểm tự chấm phải >= 0
    CONSTRAINT chk_self_score_non_negative CHECK (self_score IS NULL OR self_score >= 0)
);

COMMENT ON TABLE public.submission_revisions IS 'Lịch sử các phiên bản nộp bài, mỗi lần nộp lại tạo revision mới';

-- Now add the FK from submissions.current_revision_id → submission_revisions.id
ALTER TABLE public.submissions
    ADD CONSTRAINT fk_current_revision
    FOREIGN KEY (current_revision_id) REFERENCES public.submission_revisions(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 2.10 evidence_items – File/link minh chứng
-- ------------------------------------------------------------
CREATE TABLE public.evidence_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id    UUID NOT NULL REFERENCES public.submission_revisions(id) ON DELETE CASCADE,
    evidence_type  public.evidence_type NOT NULL,
    file_name      TEXT,
    storage_path   TEXT,
    external_url   TEXT,
    mime_type      TEXT,
    file_size      BIGINT,
    uploaded_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- File minh chứng phải có storage_path, link phải có external_url
    CONSTRAINT chk_evidence_has_content CHECK (
        storage_path IS NOT NULL OR external_url IS NOT NULL
    ),
    -- File size phải dương nếu có
    CONSTRAINT chk_file_size_positive CHECK (file_size IS NULL OR file_size > 0)
);

COMMENT ON TABLE public.evidence_items IS 'Minh chứng đính kèm: file upload hoặc link bên ngoài';

-- ------------------------------------------------------------
-- 2.11 review_actions – Lịch sử thẩm định
-- ------------------------------------------------------------
CREATE TABLE public.review_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id       UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    revision_id         UUID REFERENCES public.submission_revisions(id) ON DELETE SET NULL,
    admin_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action              public.review_action_type NOT NULL,
    self_score_snapshot NUMERIC(10,2),
    admin_score         NUMERIC(10,2),
    comment             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.review_actions IS 'Lịch sử hành động thẩm định của admin (xác thực, yêu cầu bổ sung, mở lại)';

-- ------------------------------------------------------------
-- 2.12 bonus_requests – Yêu cầu điểm cộng
-- ------------------------------------------------------------
CREATE TABLE public.bonus_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_period_id UUID NOT NULL REFERENCES public.organization_periods(id) ON DELETE CASCADE,
    title                 TEXT NOT NULL,
    description           TEXT,
    requested_score       NUMERIC(10,2),
    approved_score        NUMERIC(10,2),
    status                public.bonus_status NOT NULL DEFAULT 'draft',
    submitted_at          TIMESTAMPTZ,
    reviewed_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Điểm yêu cầu và điểm duyệt phải >= 0
    CONSTRAINT chk_bonus_requested_score CHECK (requested_score IS NULL OR requested_score >= 0),
    CONSTRAINT chk_bonus_approved_score CHECK (approved_score IS NULL OR approved_score >= 0)
);

COMMENT ON TABLE public.bonus_requests IS 'Yêu cầu điểm cộng từ đơn vị, được admin duyệt riêng';

-- ------------------------------------------------------------
-- 2.13 bonus_evidence_items – Minh chứng điểm cộng
-- ------------------------------------------------------------
CREATE TABLE public.bonus_evidence_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bonus_request_id  UUID NOT NULL REFERENCES public.bonus_requests(id) ON DELETE CASCADE,
    file_name         TEXT,
    storage_path      TEXT,
    external_url      TEXT,
    uploaded_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Phải có file hoặc link
    CONSTRAINT chk_bonus_evidence_has_content CHECK (
        storage_path IS NOT NULL OR external_url IS NOT NULL
    )
);

COMMENT ON TABLE public.bonus_evidence_items IS 'Minh chứng đính kèm cho yêu cầu điểm cộng';

-- ------------------------------------------------------------
-- 2.14 bonus_review_actions – Lịch sử duyệt điểm cộng
-- ------------------------------------------------------------
CREATE TABLE public.bonus_review_actions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bonus_request_id         UUID NOT NULL REFERENCES public.bonus_requests(id) ON DELETE CASCADE,
    admin_id                 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action                   TEXT NOT NULL,
    requested_score_snapshot NUMERIC(10,2),
    approved_score           NUMERIC(10,2),
    comment                  TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bonus_review_actions IS 'Lịch sử duyệt điểm cộng của admin';

-- ------------------------------------------------------------
-- 2.15 notifications – Thông báo trong ứng dụng
-- ------------------------------------------------------------
CREATE TABLE public.notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title        TEXT,
    message      TEXT,
    type         TEXT,
    related_id   UUID,
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS 'Thông báo trong ứng dụng cho người dùng';

-- ------------------------------------------------------------
-- 2.16 push_subscriptions – Đăng ký push notification
-- ------------------------------------------------------------
CREATE TABLE public.push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint   TEXT UNIQUE NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_subscriptions IS 'Đăng ký Web Push Notification (VAPID)';

-- ------------------------------------------------------------
-- 2.17 audit_logs – Nhật ký hoạt động (append-only)
-- ------------------------------------------------------------
CREATE TABLE public.audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   UUID,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS 'Nhật ký hoạt động hệ thống – chỉ thêm mới, không sửa/xóa';

-- ------------------------------------------------------------
-- 2.18 import_jobs – Theo dõi import Excel
-- ------------------------------------------------------------
CREATE TABLE public.import_jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imported_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name    TEXT,
    total_rows   INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,
    failed_rows  INTEGER DEFAULT 0,
    error_report JSONB,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.import_jobs IS 'Theo dõi tiến trình import dữ liệu từ Excel';


-- ============================================================
-- SECTION 3: INDEXES
-- Tạo index cho các cột thường xuyên truy vấn
-- ============================================================

-- profiles
CREATE INDEX idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_is_active ON public.profiles(is_active);

-- criteria_library
CREATE INDEX idx_criteria_library_category ON public.criteria_library(category_id);
CREATE INDEX idx_criteria_library_is_active ON public.criteria_library(is_active);
CREATE INDEX idx_criteria_library_sort ON public.criteria_library(sort_order);

-- evaluation_periods
CREATE INDEX idx_eval_periods_status ON public.evaluation_periods(status);
CREATE INDEX idx_eval_periods_created_by ON public.evaluation_periods(created_by);

-- period_criteria
CREATE INDEX idx_period_criteria_period ON public.period_criteria(period_id);
CREATE INDEX idx_period_criteria_source ON public.period_criteria(source_criteria_id);
CREATE INDEX idx_period_criteria_sort ON public.period_criteria(period_id, sort_order);

-- organization_periods
CREATE INDEX idx_org_periods_period ON public.organization_periods(period_id);
CREATE INDEX idx_org_periods_org ON public.organization_periods(organization_id);
CREATE INDEX idx_org_periods_status ON public.organization_periods(status);

-- submissions
CREATE INDEX idx_submissions_org_period ON public.submissions(organization_period_id);
CREATE INDEX idx_submissions_period_criteria ON public.submissions(period_criteria_id);
CREATE INDEX idx_submissions_status ON public.submissions(status);
CREATE INDEX idx_submissions_verified_by ON public.submissions(verified_by);

-- submission_revisions
CREATE INDEX idx_sub_revisions_submission ON public.submission_revisions(submission_id);
CREATE INDEX idx_sub_revisions_submitted_by ON public.submission_revisions(submitted_by);

-- evidence_items
CREATE INDEX idx_evidence_revision ON public.evidence_items(revision_id);
CREATE INDEX idx_evidence_type ON public.evidence_items(evidence_type);
CREATE INDEX idx_evidence_uploaded_by ON public.evidence_items(uploaded_by);

-- review_actions
CREATE INDEX idx_review_actions_submission ON public.review_actions(submission_id);
CREATE INDEX idx_review_actions_admin ON public.review_actions(admin_id);

-- bonus_requests
CREATE INDEX idx_bonus_org_period ON public.bonus_requests(organization_period_id);
CREATE INDEX idx_bonus_status ON public.bonus_requests(status);
CREATE INDEX idx_bonus_reviewed_by ON public.bonus_requests(reviewed_by);

-- bonus_evidence_items
CREATE INDEX idx_bonus_evidence_request ON public.bonus_evidence_items(bonus_request_id);

-- bonus_review_actions
CREATE INDEX idx_bonus_review_request ON public.bonus_review_actions(bonus_request_id);

-- notifications
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- push_subscriptions
CREATE INDEX idx_push_sub_user ON public.push_subscriptions(user_id);

-- audit_logs
CREATE INDEX idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_action ON public.audit_logs(action);

-- import_jobs
CREATE INDEX idx_import_imported_by ON public.import_jobs(imported_by);
CREATE INDEX idx_import_status ON public.import_jobs(status);


-- ============================================================
-- SECTION 4: TRIGGERS
-- Tự động cập nhật updated_at khi sửa bản ghi
-- ============================================================

-- Hàm trigger cập nhật updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Áp dụng trigger cho tất cả bảng có cột updated_at
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_criteria_library_updated_at
    BEFORE UPDATE ON public.criteria_library
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_eval_periods_updated_at
    BEFORE UPDATE ON public.evaluation_periods
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_submissions_updated_at
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_bonus_requests_updated_at
    BEFORE UPDATE ON public.bonus_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- Trigger: Đảm bảo current_revision_id thuộc về đúng submission
-- Kiểm tra tính toàn vẹn tham chiếu giữa submission và revision
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_current_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.current_revision_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.submission_revisions
            WHERE id = NEW.current_revision_id
              AND submission_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'current_revision_id must belong to the same submission (submission_id = %)', NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_current_revision
    BEFORE INSERT OR UPDATE OF current_revision_id ON public.submissions
    FOR EACH ROW
    WHEN (NEW.current_revision_id IS NOT NULL)
    EXECUTE FUNCTION public.validate_current_revision();

-- ------------------------------------------------------------
-- Trigger: Kiểm tra admin_score không vượt max_score của tiêu chí
-- Điểm admin chấm phải <= điểm tối đa của tiêu chí snapshot
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_admin_score_within_max()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_score NUMERIC(10,2);
BEGIN
    IF NEW.admin_score IS NOT NULL THEN
        SELECT max_score_snapshot INTO v_max_score
        FROM public.period_criteria
        WHERE id = NEW.period_criteria_id;

        IF NEW.admin_score > v_max_score THEN
            RAISE EXCEPTION 'admin_score (%) exceeds max_score_snapshot (%) for period_criteria_id %',
                NEW.admin_score, v_max_score, NEW.period_criteria_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_admin_score
    BEFORE INSERT OR UPDATE OF admin_score ON public.submissions
    FOR EACH ROW
    WHEN (NEW.admin_score IS NOT NULL)
    EXECUTE FUNCTION public.validate_admin_score_within_max();

-- ------------------------------------------------------------
-- Trigger: Kiểm tra self_score không vượt max_score
-- Điểm tự chấm phải <= điểm tối đa của tiêu chí snapshot
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_self_score_within_max()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_score NUMERIC(10,2);
    v_period_criteria_id UUID;
BEGIN
    IF NEW.self_score IS NOT NULL THEN
        SELECT s.period_criteria_id INTO v_period_criteria_id
        FROM public.submissions s
        WHERE s.id = NEW.submission_id;

        SELECT max_score_snapshot INTO v_max_score
        FROM public.period_criteria
        WHERE id = v_period_criteria_id;

        IF NEW.self_score > v_max_score THEN
            RAISE EXCEPTION 'self_score (%) exceeds max_score_snapshot (%) for submission %',
                NEW.self_score, v_max_score, NEW.submission_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_self_score
    BEFORE INSERT OR UPDATE OF self_score ON public.submission_revisions
    FOR EACH ROW
    WHEN (NEW.self_score IS NOT NULL)
    EXECUTE FUNCTION public.validate_self_score_within_max();


-- ============================================================
-- SECTION 5: RLS HELPER FUNCTIONS
-- Các hàm hỗ trợ kiểm tra quyền truy cập
-- ============================================================

-- Kiểm tra người dùng hiện tại có phải admin không
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND is_active = TRUE
    );
$$;

-- Lấy organization_id của người dùng hiện tại
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = TRUE;
$$;

-- Kiểm tra người dùng hiện tại có thuộc đơn vị cho trước không
CREATE OR REPLACE FUNCTION public.is_organization_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND organization_id = p_org_id
          AND is_active = TRUE
    );
$$;


-- ============================================================
-- SECTION 6: ROW LEVEL SECURITY POLICIES
-- Bật RLS và tạo policy cho tất cả các bảng
-- ============================================================

-- Enable RLS on ALL tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.1 organizations – Đơn vị Đoàn cơ sở
-- Admin: đọc/ghi tất cả
-- User: chỉ đọc đơn vị của mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to organizations"
    ON public.organizations FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own organization"
    ON public.organizations FOR SELECT
    USING (id = public.get_my_organization_id());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.2 profiles – Hồ sơ người dùng
-- Admin: đọc/ghi tất cả
-- User: đọc hồ sơ của mình và đồng nghiệp cùng đơn vị
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own profile"
    ON public.profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "User: read same org profiles"
    ON public.profiles FOR SELECT
    USING (
        organization_id IS NOT NULL
        AND organization_id = public.get_my_organization_id()
    );

CREATE POLICY "User: update own profile display_name only"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        -- Không cho phép user tự đổi role hoặc organization
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.3 criteria_categories – Nhóm tiêu chí
-- Admin: đọc/ghi tất cả
-- User: chỉ đọc
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to criteria_categories"
    ON public.criteria_categories FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read criteria_categories"
    ON public.criteria_categories FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.4 criteria_library – Thư viện tiêu chí gốc
-- Admin: đọc/ghi tất cả
-- User: chỉ đọc các tiêu chí đang hoạt động
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to criteria_library"
    ON public.criteria_library FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read active criteria"
    ON public.criteria_library FOR SELECT
    USING (auth.uid() IS NOT NULL AND is_active = TRUE);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.5 evaluation_periods – Đợt đánh giá
-- Admin: đọc/ghi tất cả
-- User: chỉ đọc các đợt đã active trở lên (không đọc draft)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to evaluation_periods"
    ON public.evaluation_periods FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read non-draft periods"
    ON public.evaluation_periods FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND status != 'draft'
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.6 period_criteria – Bản sao tiêu chí theo đợt
-- Admin: đọc/ghi tất cả
-- User: đọc tiêu chí của đợt đã được gán cho đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to period_criteria"
    ON public.period_criteria FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read period_criteria for assigned periods"
    ON public.period_criteria FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.period_id = period_criteria.period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.7 organization_periods – Gán đợt đánh giá
-- Admin: đọc/ghi tất cả
-- User: chỉ đọc gán của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to organization_periods"
    ON public.organization_periods FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org periods"
    ON public.organization_periods FOR SELECT
    USING (organization_id = public.get_my_organization_id());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.8 submissions – Bài nộp
-- Admin: đọc/ghi tất cả (để thẩm định, chấm điểm)
-- User: đọc/ghi bài nộp của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to submissions"
    ON public.submissions FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org submissions"
    ON public.submissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = submissions.organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: insert own org submissions"
    ON public.submissions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: update own org submissions"
    ON public.submissions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = submissions.organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = submissions.organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
        -- User không được tự chấm admin_score hoặc verify
        AND admin_score IS NULL
        AND verified_by IS NULL
        AND verified_at IS NULL
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.9 submission_revisions – Phiên bản nộp bài
-- Admin: đọc tất cả
-- User: đọc/ghi revision của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to submission_revisions"
    ON public.submission_revisions FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org revisions"
    ON public.submission_revisions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            JOIN public.organization_periods op ON op.id = s.organization_period_id
            WHERE s.id = submission_revisions.submission_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: insert own org revisions"
    ON public.submission_revisions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submissions s
            JOIN public.organization_periods op ON op.id = s.organization_period_id
            WHERE s.id = submission_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.10 evidence_items – Minh chứng
-- Admin: đọc tất cả
-- User: đọc/ghi minh chứng của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to evidence_items"
    ON public.evidence_items FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org evidence"
    ON public.evidence_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.submission_revisions sr
            JOIN public.submissions s ON s.id = sr.submission_id
            JOIN public.organization_periods op ON op.id = s.organization_period_id
            WHERE sr.id = evidence_items.revision_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: insert own org evidence"
    ON public.evidence_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.submission_revisions sr
            JOIN public.submissions s ON s.id = sr.submission_id
            JOIN public.organization_periods op ON op.id = s.organization_period_id
            WHERE sr.id = revision_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: delete own org evidence"
    ON public.evidence_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.submission_revisions sr
            JOIN public.submissions s ON s.id = sr.submission_id
            JOIN public.organization_periods op ON op.id = s.organization_period_id
            WHERE sr.id = evidence_items.revision_id
              AND op.organization_id = public.get_my_organization_id()
              -- Chỉ cho xóa minh chứng khi bài nộp chưa submit
              AND s.status IN ('draft', 'revision_requested')
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.11 review_actions – Lịch sử thẩm định
-- Admin: đọc/ghi (chỉ admin mới được thẩm định)
-- User: chỉ đọc review của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to review_actions"
    ON public.review_actions FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org review_actions"
    ON public.review_actions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.submissions s
            JOIN public.organization_periods op ON op.id = s.organization_period_id
            WHERE s.id = review_actions.submission_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.12 bonus_requests – Yêu cầu điểm cộng
-- Admin: đọc/ghi tất cả
-- User: đọc/ghi điểm cộng của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to bonus_requests"
    ON public.bonus_requests FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org bonus_requests"
    ON public.bonus_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = bonus_requests.organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: insert own org bonus_requests"
    ON public.bonus_requests FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: update own org bonus_requests"
    ON public.bonus_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = bonus_requests.organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_periods op
            WHERE op.id = bonus_requests.organization_period_id
              AND op.organization_id = public.get_my_organization_id()
        )
        -- User không được tự duyệt điểm cộng
        AND approved_score IS NULL
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.13 bonus_evidence_items – Minh chứng điểm cộng
-- Admin: đọc tất cả
-- User: đọc/ghi minh chứng điểm cộng của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to bonus_evidence_items"
    ON public.bonus_evidence_items FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org bonus_evidence"
    ON public.bonus_evidence_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bonus_requests br
            JOIN public.organization_periods op ON op.id = br.organization_period_id
            WHERE br.id = bonus_evidence_items.bonus_request_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: insert own org bonus_evidence"
    ON public.bonus_evidence_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.bonus_requests br
            JOIN public.organization_periods op ON op.id = br.organization_period_id
            WHERE br.id = bonus_request_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

CREATE POLICY "User: delete own org bonus_evidence"
    ON public.bonus_evidence_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.bonus_requests br
            JOIN public.organization_periods op ON op.id = br.organization_period_id
            WHERE br.id = bonus_evidence_items.bonus_request_id
              AND op.organization_id = public.get_my_organization_id()
              AND br.status IN ('draft', 'revision_requested')
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.14 bonus_review_actions – Lịch sử duyệt điểm cộng
-- Admin: đọc/ghi
-- User: chỉ đọc review của đơn vị mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to bonus_review_actions"
    ON public.bonus_review_actions FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own org bonus_review_actions"
    ON public.bonus_review_actions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bonus_requests br
            JOIN public.organization_periods op ON op.id = br.organization_period_id
            WHERE br.id = bonus_review_actions.bonus_request_id
              AND op.organization_id = public.get_my_organization_id()
        )
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.15 notifications – Thông báo
-- Mỗi người chỉ đọc/cập nhật thông báo của mình
-- Admin có thể tạo thông báo cho bất kỳ ai
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to notifications"
    ON public.notifications FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: read own notifications"
    ON public.notifications FOR SELECT
    USING (recipient_id = auth.uid());

CREATE POLICY "User: update own notifications (mark read)"
    ON public.notifications FOR UPDATE
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.16 push_subscriptions – Đăng ký push
-- Mỗi người chỉ quản lý subscription của mình
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to push_subscriptions"
    ON public.push_subscriptions FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "User: manage own push_subscriptions"
    ON public.push_subscriptions FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.17 audit_logs – Nhật ký hoạt động
-- Append-only: chỉ cho phép INSERT, không UPDATE/DELETE
-- Admin: đọc tất cả
-- User: không có quyền truy cập
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: read all audit_logs"
    ON public.audit_logs FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Authenticated: insert audit_logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Không tạo policy UPDATE/DELETE cho audit_logs
-- → Append-only đảm bảo nhật ký không bị sửa/xóa

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 6.18 import_jobs – Import Excel
-- Admin: đọc/ghi tất cả
-- User: không có quyền truy cập
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access to import_jobs"
    ON public.import_jobs FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================
-- SECTION 7: SEED DATA FUNCTION
-- Hàm tạo dữ liệu mẫu ban đầu
-- ============================================================

-- Hàm seed dữ liệu ban đầu cho hệ thống
-- Gọi bằng: SELECT public.seed_initial_data();
-- Lưu ý: Tài khoản admin phải được tạo qua Supabase Auth trước,
-- sau đó gọi hàm này để tạo profile và dữ liệu mẫu.
CREATE OR REPLACE FUNCTION public.seed_initial_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org1_id UUID;
    v_org2_id UUID;
    v_org3_id UUID;
    v_cat1_id UUID;
    v_cat2_id UUID;
    v_cat3_id UUID;
BEGIN
    -- --------------------------------------------------------
    -- Tạo các đơn vị Đoàn cơ sở mẫu
    -- --------------------------------------------------------
    INSERT INTO public.organizations (id, code, name, description, contact_name, contact_phone)
    VALUES
        (gen_random_uuid(), 'DCS-01', 'Đoàn phường Tân Định', 'Đoàn TNCS HCM phường Tân Định, Quận 1', 'Nguyễn Văn A', '0901234567'),
        (gen_random_uuid(), 'DCS-02', 'Đoàn phường Đa Kao', 'Đoàn TNCS HCM phường Đa Kao, Quận 1', 'Trần Thị B', '0912345678'),
        (gen_random_uuid(), 'DCS-03', 'Đoàn phường Bến Nghé', 'Đoàn TNCS HCM phường Bến Nghé, Quận 1', 'Lê Văn C', '0923456789')
    ON CONFLICT (code) DO NOTHING;

    -- Lấy lại IDs theo code
    SELECT id INTO v_org1_id FROM public.organizations WHERE code = 'DCS-01' LIMIT 1;
    SELECT id INTO v_org2_id FROM public.organizations WHERE code = 'DCS-02' LIMIT 1;
    SELECT id INTO v_org3_id FROM public.organizations WHERE code = 'DCS-03' LIMIT 1;

    -- --------------------------------------------------------
    -- Tạo nhóm tiêu chí mẫu
    -- --------------------------------------------------------
    INSERT INTO public.criteria_categories (id, code, name, description, sort_order)
    VALUES
        (gen_random_uuid(), 'NC1', 'Nhóm 1: Công tác tổ chức', 'Các tiêu chí về công tác tổ chức Đoàn', 1),
        (gen_random_uuid(), 'NC2', 'Nhóm 2: Phong trào thanh niên', 'Các tiêu chí về phong trào thanh niên', 2),
        (gen_random_uuid(), 'NC3', 'Nhóm 3: Công tác tuyên truyền', 'Các tiêu chí về công tác tuyên truyền giáo dục', 3)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_cat1_id FROM public.criteria_categories WHERE code = 'NC1' LIMIT 1;
    SELECT id INTO v_cat2_id FROM public.criteria_categories WHERE code = 'NC2' LIMIT 1;
    SELECT id INTO v_cat3_id FROM public.criteria_categories WHERE code = 'NC3' LIMIT 1;

    -- --------------------------------------------------------
    -- Tạo tiêu chí mẫu trong thư viện gốc
    -- --------------------------------------------------------
    INSERT INTO public.criteria_library (category_id, code, title, description, scoring_guidelines, max_score, req_doc1, req_doc2, req_link3, responsible_unit, sort_order)
    VALUES
        -- Nhóm 1: Công tác tổ chức
        (v_cat1_id, '1.1', 'Đại hội Đoàn các cấp',
         'Tổ chức Đại hội Đoàn cơ sở đúng tiến độ, đúng quy trình',
         'Đạt: 10 điểm nếu tổ chức đúng hạn, đủ quy trình. Trừ 2 điểm nếu trễ hạn.',
         10.00, TRUE, TRUE, TRUE, 'Ban Tổ chức', 1),

        (v_cat1_id, '1.2', 'Phát triển đoàn viên mới',
         'Kết nạp đoàn viên mới theo chỉ tiêu năm',
         'Đạt 100% chỉ tiêu: 8 điểm. Mỗi 10% thiếu trừ 1 điểm.',
         8.00, TRUE, TRUE, FALSE, 'Ban Tổ chức', 2),

        (v_cat1_id, '1.3', 'Quản lý đoàn viên',
         'Cập nhật sổ đoàn viên, quản lý đoàn phí',
         'Đầy đủ sổ sách: 5 điểm. Thiếu 1 loại trừ 1 điểm.',
         5.00, TRUE, FALSE, FALSE, 'Ban Tổ chức', 3),

        -- Nhóm 2: Phong trào thanh niên
        (v_cat2_id, '2.1', 'Chiến dịch tình nguyện hè',
         'Tổ chức chiến dịch tình nguyện hè theo kế hoạch',
         'Tổ chức đúng kế hoạch: 10 điểm. Mỗi hoạt động thiếu trừ 2 điểm.',
         10.00, TRUE, TRUE, TRUE, 'Ban Phong trào', 1),

        (v_cat2_id, '2.2', 'Ngày Chủ nhật xanh',
         'Tổ chức Ngày Chủ nhật xanh theo lịch quy định',
         'Đủ 4 đợt: 8 điểm. Mỗi đợt thiếu trừ 2 điểm.',
         8.00, TRUE, TRUE, TRUE, 'Ban Phong trào', 2),

        (v_cat2_id, '2.3', 'Hoạt động an sinh xã hội',
         'Thực hiện các hoạt động an sinh xã hội tại địa phương',
         'Đạt chỉ tiêu: 6 điểm. Vượt chỉ tiêu: +1 điểm.',
         7.00, FALSE, TRUE, TRUE, 'Ban Phong trào', 3),

        -- Nhóm 3: Công tác tuyên truyền
        (v_cat3_id, '3.1', 'Tuyên truyền trên mạng xã hội',
         'Đăng bài tuyên truyền trên fanpage Đoàn',
         'Đủ 12 bài/năm: 6 điểm. Mỗi bài thiếu trừ 0.5 điểm.',
         6.00, FALSE, FALSE, TRUE, 'Ban Tuyên giáo', 1),

        (v_cat3_id, '3.2', 'Sinh hoạt chính trị',
         'Tổ chức sinh hoạt chính trị tư tưởng cho đoàn viên',
         'Đủ 4 buổi/năm: 5 điểm. Mỗi buổi thiếu trừ 1.25 điểm.',
         5.00, TRUE, TRUE, FALSE, 'Ban Tuyên giáo', 2)
    ON CONFLICT (code) DO NOTHING;

    RAISE NOTICE 'Seed data created successfully!';
    RAISE NOTICE 'Organizations: DCS-01, DCS-02, DCS-03';
    RAISE NOTICE 'Categories: NC1, NC2, NC3';
    RAISE NOTICE 'Criteria: 8 sample criteria created';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Create admin user via Supabase Auth, then insert profile:';
    RAISE NOTICE 'INSERT INTO public.profiles (id, username, display_name, role)';
    RAISE NOTICE 'VALUES (''<auth_user_uuid>'', ''admin'', ''Quản trị viên'', ''admin'');';
END;
$$;

COMMENT ON FUNCTION public.seed_initial_data() IS 'Tạo dữ liệu mẫu ban đầu: đơn vị, nhóm tiêu chí, tiêu chí';


-- ============================================================
-- SECTION 8: STORAGE BUCKETS
-- Tạo bucket lưu trữ file (private)
-- ============================================================

-- Tạo bucket lưu minh chứng (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidence',
    'evidence',
    FALSE,
    52428800,  -- 50MB limit
    ARRAY['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Tạo bucket lưu minh chứng điểm cộng (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bonus-evidence',
    'bonus-evidence',
    FALSE,
    52428800,  -- 50MB limit
    ARRAY['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Storage RLS: evidence bucket
-- Admin truy cập tất cả; User chỉ truy cập file của đơn vị mình
-- Cấu trúc path: {organization_id}/{period_id}/{submission_id}/{revision_id}/{file_name}
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access evidence bucket"
    ON storage.objects FOR ALL
    USING (bucket_id = 'evidence' AND public.is_admin())
    WITH CHECK (bucket_id = 'evidence' AND public.is_admin());

CREATE POLICY "User: read own org evidence files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'evidence'
        AND (storage.foldername(name))[1] = public.get_my_organization_id()::text
    );

CREATE POLICY "User: upload own org evidence files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'evidence'
        AND (storage.foldername(name))[1] = public.get_my_organization_id()::text
    );

CREATE POLICY "User: delete own org evidence files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'evidence'
        AND (storage.foldername(name))[1] = public.get_my_organization_id()::text
    );

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- Storage RLS: bonus-evidence bucket
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

CREATE POLICY "Admin: full access bonus-evidence bucket"
    ON storage.objects FOR ALL
    USING (bucket_id = 'bonus-evidence' AND public.is_admin())
    WITH CHECK (bucket_id = 'bonus-evidence' AND public.is_admin());

CREATE POLICY "User: read own org bonus-evidence files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'bonus-evidence'
        AND (storage.foldername(name))[1] = public.get_my_organization_id()::text
    );

CREATE POLICY "User: upload own org bonus-evidence files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'bonus-evidence'
        AND (storage.foldername(name))[1] = public.get_my_organization_id()::text
    );

CREATE POLICY "User: delete own org bonus-evidence files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'bonus-evidence'
        AND (storage.foldername(name))[1] = public.get_my_organization_id()::text
    );


-- ============================================================
-- DONE
-- Migration hoàn tất. Chạy seed data bằng:
--   SELECT public.seed_initial_data();
-- ============================================================
