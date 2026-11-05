import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type {
  EvaluationPeriod,
  Organization,
  PeriodCriterion,
  Submission,
  SubmissionRevision,
  EvidenceItem,
  ReviewAction,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  CheckSquare,
  Building2,
  Calendar,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Globe,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getEvidenceSignedUrl } from "@/lib/storage";

// ============================================================
// Types
// ============================================================

export interface OrgUnitReview {
  orgPeriodId: string;
  organization: Organization;
  submission?: Submission | null;
  currentRevision?: SubmissionRevision | null;
  evidenceItems: EvidenceItem[];
  reviewActions: ReviewAction[];
}

export interface CriterionWithUnits {
  criterion: PeriodCriterion;
  orgUnits: OrgUnitReview[];
}

// ============================================================
// Data Fetching
// ============================================================

async function fetchPeriods(): Promise<EvaluationPeriod[]> {
  const { data } = await supabase
    .from("evaluation_periods")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as EvaluationPeriod[];
}

async function fetchOrganizations(): Promise<Organization[]> {
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  return (data ?? []) as Organization[];
}

async function fetchReviewQueue(periodId?: string, orgId?: string) {
  if (!periodId) {
    return {
      criteria: [] as PeriodCriterion[],
      orgPeriods: [] as any[],
      submissions: [] as Submission[],
      revisions: [] as SubmissionRevision[],
      evidence: [] as EvidenceItem[],
      actions: [] as ReviewAction[],
    };
  }

  // 1. Fetch period criteria
  const { data: criteria } = await supabase
    .from("period_criteria")
    .select("*")
    .eq("period_id", periodId)
    .order("sort_order", { ascending: true })
    .order("code_snapshot", { ascending: true });

  // 2. Fetch organization_periods with organization details
  let orgPeriodQuery = supabase
    .from("organization_periods")
    .select("id, organization_id, status, organization:organizations(*)")
    .eq("period_id", periodId);

  if (orgId && orgId !== "all") {
    orgPeriodQuery = orgPeriodQuery.eq("organization_id", orgId);
  }

  const { data: orgPeriods } = await orgPeriodQuery;
  const orgPeriodIds = (orgPeriods ?? []).map((op) => op.id);

  if (orgPeriodIds.length === 0) {
    return {
      criteria: (criteria ?? []) as PeriodCriterion[],
      orgPeriods: (orgPeriods ?? []),
      submissions: [] as Submission[],
      revisions: [] as SubmissionRevision[],
      evidence: [] as EvidenceItem[],
      actions: [] as ReviewAction[],
    };
  }

  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .in("organization_period_id", orgPeriodIds);

  const subIds = (subs ?? []).map((s) => s.id);

  const [revRes, evRes, actRes] = await Promise.all([
    supabase
      .from("submission_revisions")
      .select("*")
      .in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("evidence_items").select("*"),
    supabase
      .from("review_actions")
      .select("*")
      .in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  return {
    criteria: (criteria ?? []) as PeriodCriterion[],
    orgPeriods: (orgPeriods ?? []),
    submissions: (subs ?? []) as Submission[],
    revisions: (revRes.data ?? []) as SubmissionRevision[],
    evidence: (evRes.data ?? []) as EvidenceItem[],
    actions: (actRes.data ?? []) as ReviewAction[],
  };
}

// ============================================================
// Main Admin Review Page
// ============================================================

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Queries
  const { data: periods } = useQuery({
    queryKey: ["admin_review_periods"],
    queryFn: fetchPeriods,
  });

  // Set default period once loaded
  useMemo(() => {
    if (!periods || periods.length === 0) return;
    const act = periods.find((p) => p.status === "active") || periods[0];
    if (!selectedPeriodId && act) {
      setSelectedPeriodId(act.id);
    }
  }, [periods, selectedPeriodId]);

  const { data: organizations } = useQuery({
    queryKey: ["admin_review_organizations"],
    queryFn: fetchOrganizations,
  });

  const { data: queueData, isLoading: queueLoading, refetch } = useQuery({
    queryKey: ["admin_review_queue", selectedPeriodId, selectedOrgId],
    queryFn: () => fetchReviewQueue(selectedPeriodId, selectedOrgId),
    enabled: !!selectedPeriodId,
  });

  // Group Criteria with all assigned Organizations
  const criteriaWithUnits: CriterionWithUnits[] = useMemo(() => {
    if (!queueData) return [];

    return queueData.criteria.map((crit) => {
      const units: OrgUnitReview[] = (queueData.orgPeriods ?? []).map((op: any) => {
        const org = op.organization as Organization;
        const sub = queueData.submissions.find(
          (s) => s.period_criteria_id === crit.id && s.organization_period_id === op.id
        );
        const rev = sub ? queueData.revisions.find((r) => r.id === sub.current_revision_id) : null;
        const ev = rev ? queueData.evidence.filter((e) => e.revision_id === rev.id) : [];
        const acts = sub ? queueData.actions.filter((a) => a.submission_id === sub.id) : [];

        return {
          orgPeriodId: op.id,
          organization: org,
          submission: sub,
          currentRevision: rev,
          evidenceItems: ev,
          reviewActions: acts,
        };
      });

      return {
        criterion: crit,
        orgUnits: units,
      };
    });
  }, [queueData]);

  // Global Statistics across submissions
  const stats = useMemo(() => {
    let submitted = 0;
    let verified = 0;
    let revisionReq = 0;
    let totalAssignments = 0;

    criteriaWithUnits.forEach((cu) => {
      cu.orgUnits.forEach((u) => {
        totalAssignments++;
        const st = u.submission?.status;
        if (st === "submitted") submitted++;
        else if (st === "verified") verified++;
        else if (st === "revision_requested") revisionReq++;
      });
    });

    const unsubmitted = totalAssignments - (submitted + verified + revisionReq);
    return { submitted, verified, revisionReq, unsubmitted, totalAssignments };
  }, [criteriaWithUnits]);

  // Filter criteria based on search query and status
  const filteredCriteria = useMemo(() => {
    const q = search.toLowerCase();
    return criteriaWithUnits.filter((item) => {
      const matchSearch =
        item.criterion.code_snapshot?.toLowerCase().includes(q) ||
        item.criterion.title_snapshot?.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filterStatus === "all") return true;

      // Check if any unit under this criterion matches the status filter
      return item.orgUnits.some((u) => {
        const s = u.submission?.status || "draft";
        return s === filterStatus;
      });
    });
  }, [criteriaWithUnits, search, filterStatus]);

  // Admin Action: Verify & Give Final Score
  const handleAdminVerify = async (
    criterion: PeriodCriterion,
    orgPeriodId: string,
    existingSubId: string | null | undefined,
    currentRevId: string | null | undefined,
    officialScore: number,
    comment: string,
    orgId: string
  ) => {
    let subId = existingSubId;

    if (!subId) {
      // Create verified submission if not existing
      const { data: newSub, error } = await supabase
        .from("submissions")
        .insert({
          organization_period_id: orgPeriodId,
          period_criteria_id: criterion.id,
          status: "verified",
          admin_score: officialScore,
          verified_by: profile?.id || null,
          verified_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        toast.error("Lỗi khi xác thực: " + error.message);
        return;
      }
      subId = newSub.id;
    } else {
      // Update existing submission
      const { error } = await supabase
        .from("submissions")
        .update({
          status: "verified",
          admin_score: officialScore,
          verified_by: profile?.id || null,
          verified_at: new Date().toISOString(),
        })
        .eq("id", subId);

      if (error) {
        toast.error("Lỗi khi xác thực: " + error.message);
        return;
      }
    }

    // Insert review action log
    await supabase.from("review_actions").insert({
      submission_id: subId,
      revision_id: currentRevId || null,
      admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
      action: "verified",
      self_score_snapshot: officialScore,
      admin_score: officialScore,
      comment: comment || "Đã thẩm định đạt yêu cầu",
    });

    // Insert audit log
    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "VERIFY_CRITERION",
      entity_type: "submission",
      entity_id: subId,
      new_values: { admin_score: officialScore, comment },
    });

    // Notify organization users
    const { data: orgUsers } = await supabase
      .from("profiles")
      .select("id")
      .eq("organization_id", orgId);

    if (orgUsers && orgUsers.length > 0) {
      await supabase.from("notifications").insert(
        orgUsers.map((u) => ({
          recipient_id: u.id,
          title: `Tiêu chí ${criterion.code_snapshot} đã được xác thực`,
          message: `Hội đồng đã thẩm định tiêu chí "${criterion.title_snapshot}". Điểm chính thức: ${officialScore}đ.`,
          type: "verified",
          link_url: "/user/results",
        }))
      );
    }

    toast.success(`Đã xác thực và cho điểm cuối cùng (${officialScore}đ) thành công!`);
    refetch();
  };

  // Admin Action: Request Revision
  const handleAdminRequestRevision = async (
    criterion: PeriodCriterion,
    submissionId: string,
    currentRevId: string | null | undefined,
    comment: string,
    orgId: string
  ) => {
    if (!comment.trim()) {
      toast.error("Vui lòng nhập lý do/ý kiến yêu cầu bổ sung.");
      return;
    }

    const { error } = await supabase
      .from("submissions")
      .update({ status: "revision_requested" })
      .eq("id", submissionId);

    if (error) {
      toast.error("Lỗi: " + error.message);
      return;
    }

    await supabase.from("review_actions").insert({
      submission_id: submissionId,
      revision_id: currentRevId || null,
      admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
      action: "revision_requested",
      self_score_snapshot: null,
      admin_score: null,
      comment,
    });

    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "REQUEST_REVISION",
      entity_type: "submission",
      entity_id: submissionId,
      new_values: { comment },
    });

    const { data: orgUsers } = await supabase
      .from("profiles")
      .select("id")
      .eq("organization_id", orgId);

    if (orgUsers && orgUsers.length > 0) {
      await supabase.from("notifications").insert(
        orgUsers.map((u) => ({
          recipient_id: u.id,
          title: `Yêu cầu bổ sung minh chứng tiêu chí ${criterion.code_snapshot}`,
          message: `Ý kiến Hội đồng: ${comment}`,
          type: "revision_requested",
          link_url: "/user/criteria",
        }))
      );
    }

    toast.warning("Đã gửi yêu cầu bổ sung minh chứng cho đơn vị!");
    refetch();
  };

  // Admin Action: Reopen
  const handleAdminReopen = async (
    criterion: PeriodCriterion,
    submissionId: string,
    currentRevId: string | null | undefined,
    reason: string
  ) => {
    if (!reason.trim()) {
      toast.error("Bắt buộc phải nhập lý do mở lại.");
      return;
    }

    const { error } = await supabase
      .from("submissions")
      .update({
        status: "submitted",
        verified_at: null,
        verified_by: null,
      })
      .eq("id", submissionId);

    if (error) {
      toast.error("Lỗi: " + error.message);
      return;
    }

    await supabase.from("review_actions").insert({
      submission_id: submissionId,
      revision_id: currentRevId || null,
      admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
      action: "reopened",
      comment: reason,
    });

    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "REOPEN_VERIFIED_SUBMISSION",
      entity_type: "submission",
      entity_id: submissionId,
      new_values: { reason },
    });

    toast.info("Đã mở lại thẩm định bài nộp.");
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Thẩm định & xác thực
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hội đồng thẩm định xem xét minh chứng của từng đơn vị, chấm điểm chính thức và phê duyệt tiêu chí
        </p>
      </div>

      {/* Top Filter Bar */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-1">Đợt đánh giá</span>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn đợt đánh giá" />
              </SelectTrigger>
              <SelectContent>
                {(periods ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-1">Đoàn cơ sở</span>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả đơn vị" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả đơn vị</SelectItem>
                {(organizations ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.code} – {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-1">Trạng thái thẩm định</span>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="submitted">Chờ thẩm định</SelectItem>
                <SelectItem value="verified">Đã xác thực</SelectItem>
                <SelectItem value="revision_requested">Yêu cầu bổ sung</SelectItem>
                <SelectItem value="draft">Chưa nộp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-1">Tìm kiếm tiêu chí</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm mã hoặc tên tiêu chí..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Statistics Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-between">
          <div>
            <span className="text-orange-700 block font-medium">Chờ thẩm định</span>
            <span className="text-xl font-bold text-orange-900">{stats.submitted}</span>
          </div>
          <Clock className="h-6 w-6 text-orange-400" />
        </div>

        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div>
            <span className="text-emerald-700 block font-medium">Đã xác thực</span>
            <span className="text-xl font-bold text-emerald-900">{stats.verified}</span>
          </div>
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>

        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div>
            <span className="text-amber-700 block font-medium">Yêu cầu bổ sung</span>
            <span className="text-xl font-bold text-amber-900">{stats.revisionReq}</span>
          </div>
          <AlertCircle className="h-6 w-6 text-amber-500" />
        </div>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-slate-600 block font-medium">Chưa nộp</span>
            <span className="text-xl font-bold text-slate-800">{stats.unsubmitted}</span>
          </div>
          <Layers className="h-6 w-6 text-slate-400" />
        </div>
      </div>

      {/* Criteria List for Admin Review */}
      <div className="space-y-4">
        {queueLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2 bg-white rounded-lg border">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
            <p>Đang tải danh sách tiêu chí và minh chứng của các đơn vị...</p>
          </div>
        ) : filteredCriteria.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground bg-white rounded-lg border">
            <CheckSquare className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            Không có tiêu chí nào phù hợp với bộ lọc thẩm định.
          </div>
        ) : (
          filteredCriteria.map((item) => (
            <AdminCriterionCard
              key={item.criterion.id}
              criterion={item.criterion}
              orgUnits={item.orgUnits}
              onVerify={handleAdminVerify}
              onRequestRevision={handleAdminRequestRevision}
              onReopen={handleAdminReopen}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENT: AdminCriterionCard
// Cho phép admin nhấn vào tiêu chí, mở ra danh sách từng đơn vị
// đã nộp minh chứng, xem chi tiết và cho điểm cuối cùng!
// ============================================================

interface AdminCriterionCardProps {
  criterion: PeriodCriterion;
  orgUnits: OrgUnitReview[];
  onVerify: (
    criterion: PeriodCriterion,
    orgPeriodId: string,
    subId: string | null | undefined,
    revId: string | null | undefined,
    officialScore: number,
    comment: string,
    orgId: string
  ) => Promise<void>;
  onRequestRevision: (
    criterion: PeriodCriterion,
    subId: string,
    revId: string | null | undefined,
    comment: string,
    orgId: string
  ) => Promise<void>;
  onReopen: (
    criterion: PeriodCriterion,
    subId: string,
    revId: string | null | undefined,
    reason: string
  ) => Promise<void>;
}

function AdminCriterionCard({
  criterion,
  orgUnits,
  onVerify,
  onRequestRevision,
  onReopen,
}: AdminCriterionCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // Statistics for this criterion across organizations
  const totalUnits = orgUnits.length;
  const submittedUnits = orgUnits.filter(
    (u) => u.submission?.status === "submitted" || u.submission?.status === "verified"
  ).length;
  const waitingUnits = orgUnits.filter((u) => u.submission?.status === "submitted").length;
  const verifiedUnits = orgUnits.filter((u) => u.submission?.status === "verified").length;
  const revisionUnits = orgUnits.filter((u) => u.submission?.status === "revision_requested").length;

  const maxScore = criterion.max_score_snapshot ?? 4;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white transition-all duration-200 shadow-2xs overflow-hidden",
        isOpen && "ring-1 ring-slate-300"
      )}
    >
      {/* ============================================================ */}
      {/* 1. CRITERION HEADER ROW - MATCHES TARGET UI */}
      {/* ============================================================ */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3 sm:px-6 sm:py-3.5 cursor-pointer select-none bg-white hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-slate-800"
      >
        {/* Left: Code + Title with Max Score */}
        <div className="flex items-baseline gap-3 flex-1 min-w-0">
          <span className="font-bold text-sm sm:text-base text-slate-900 shrink-0 w-8 sm:w-10">
            {criterion.code_snapshot || "1.0"}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
              {criterion.title_snapshot}
              {criterion.max_score_snapshot !== null && (
                <span className="text-slate-800 font-bold ml-1">
                  : {criterion.max_score_snapshot}đ
                </span>
              )}
            </h4>
          </div>
        </div>

        {/* Center: Submission stats & counters */}
        <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-xs text-slate-700">
          <div className="font-semibold text-slate-800">
            {submittedUnits}/{totalUnits} đơn vị đã nộp
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {waitingUnits > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {waitingUnits} chờ thẩm định
              </span>
            )}
            {verifiedUnits > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                {verifiedUnits} đã xác thực
              </span>
            )}
            {revisionUnits > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-300">
                {revisionUnits} cần bổ sung
              </span>
            )}
            {submittedUnits === 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                Chưa có đơn vị nộp
              </span>
            )}
          </div>
        </div>

        {/* Right: Toggle Button */}
        <div className="shrink-0 self-end md:self-center">
          <button
            type="button"
            className="rounded-md bg-[#2d325a] hover:bg-[#232746] text-white text-xs font-medium px-3.5 py-1.5 shadow-2xs transition-colors shrink-0 ml-1"
          >
            {isOpen ? "Thu gọn" : "Chi tiết"}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. EXPANDED SECTION: CRITERION DETAILS & ORGANIZATIONS LIST */}
      {/* ============================================================ */}
      {isOpen && (
        <div className="border-t border-slate-200 p-4 sm:p-6 bg-slate-50/50 space-y-5">
          {/* Criterion Overview Card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs sm:text-sm space-y-2">
            <div className="font-bold text-slate-800 text-sm">Thông tin tiêu chí gốc</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-slate-700">
              <div>
                <span className="font-semibold text-slate-800 block">Nội dung:</span>
                <p className="mt-0.5 text-slate-600">{criterion.title_snapshot}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-800 block">Nguyên tắc chấm:</span>
                <p className="mt-0.5 text-slate-600 whitespace-pre-line">
                  {criterion.scoring_snapshot || `- Đảm bảo minh chứng: ${maxScore}đ.`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span>Đơn vị phụ trách: <b className="text-slate-800">{criterion.responsible_unit_snapshot || "Tổ Phong trào"}</b></span>
              <span>Điểm tối đa: <b className="text-slate-800">{maxScore}đ</b></span>
            </div>
          </div>

          {/* Heading for Organizations List */}
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="font-bold text-sm text-slate-900 uppercase tracking-wide">
              Danh sách đơn vị nộp minh chứng ({submittedUnits}/{totalUnits} đơn vị)
            </h4>
            <span className="text-xs text-slate-500">
              Nhấn vào từng đơn vị để xem chi tiết minh chứng và cho điểm cuối cùng
            </span>
          </div>

          {/* Organizations Accordion List */}
          <div className="space-y-3">
            {orgUnits.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-white rounded-lg border">
                Chưa có đơn vị nào được phân bổ trong đợt đánh giá này.
              </div>
            ) : (
              orgUnits.map((unit) => {
                const isOrgExpanded = expandedOrgId === unit.organization.id;
                const status = unit.submission?.status || "draft";
                const selfScore = unit.currentRevision?.self_score ?? 0;
                const adminScore = unit.submission?.admin_score;
                const evCount = unit.evidenceItems.length;

                return (
                  <div
                    key={unit.organization.id}
                    className={cn(
                      "rounded-lg border bg-white transition-all overflow-hidden",
                      isOrgExpanded ? "border-blue-400 ring-1 ring-blue-100 shadow-sm" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {/* Unit Row Header */}
                    <div
                      onClick={() =>
                        setExpandedOrgId(isOrgExpanded ? null : unit.organization.id)
                      }
                      className="p-3.5 sm:px-4 cursor-pointer select-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                        <div>
                          <div className="font-semibold text-xs sm:text-sm text-slate-900">
                            {unit.organization.name}
                            <span className="text-xs text-slate-500 font-normal ml-1.5">
                              ({unit.organization.code})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 text-xs shrink-0 self-end sm:self-center">
                        {/* Status Badge */}
                        {status === "verified" ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                            Đã thẩm định: {adminScore ?? selfScore}đ
                          </span>
                        ) : status === "submitted" ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
                            Đã nộp (Chờ thẩm định)
                          </span>
                        ) : status === "revision_requested" ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                            Yêu cầu bổ sung
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                            Chưa nộp
                          </span>
                        )}

                        <div className="text-slate-600">
                          Tự chấm: <b className="text-slate-900">{selfScore}/{maxScore}đ</b>
                        </div>

                        <div className="text-slate-600 hidden sm:inline">
                          Minh chứng: <b>{evCount}</b>
                        </div>

                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-900 font-medium text-xs flex items-center gap-1"
                        >
                          {isOrgExpanded ? (
                            <>
                              Thu gọn <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              Xem & Cho điểm <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Unit Detailed Evidence & Grading Section */}
                    {isOrgExpanded && (
                      <div className="border-t border-slate-100 p-4 sm:p-5 bg-slate-50/50">
                        <AdminUnitGradingDetail
                          criterion={criterion}
                          unit={unit}
                          onVerify={onVerify}
                          onRequestRevision={onRequestRevision}
                          onReopen={onReopen}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENT: AdminUnitGradingDetail
// 2-Column layout matching exact image design:
// Left: Criterion info + Unit info + Final score input + Admin actions
// Right: Submitted Evidence by category (Văn bản, Báo cáo, Tin bài) with "Mở" button!
// ============================================================

interface AdminUnitGradingDetailProps {
  criterion: PeriodCriterion;
  unit: OrgUnitReview;
  onVerify: (
    criterion: PeriodCriterion,
    orgPeriodId: string,
    subId: string | null | undefined,
    revId: string | null | undefined,
    officialScore: number,
    comment: string,
    orgId: string
  ) => Promise<void>;
  onRequestRevision: (
    criterion: PeriodCriterion,
    subId: string,
    revId: string | null | undefined,
    comment: string,
    orgId: string
  ) => Promise<void>;
  onReopen: (
    criterion: PeriodCriterion,
    subId: string,
    revId: string | null | undefined,
    reason: string
  ) => Promise<void>;
}

function AdminUnitGradingDetail({
  criterion,
  unit,
  onVerify,
  onRequestRevision,
  onReopen,
}: AdminUnitGradingDetailProps) {
  const maxScore = criterion.max_score_snapshot ?? 4;
  const selfScore = unit.currentRevision?.self_score ?? maxScore;

  const [score, setScore] = useState<number>(
    unit.submission?.admin_score ?? selfScore
  );
  const [comment, setComment] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const status = unit.submission?.status || "draft";
  const isVerified = status === "verified";

  // Filter evidence by category
  const doc1Items = unit.evidenceItems.filter((e) => e.evidence_type === "doc1");
  const doc2Items = unit.evidenceItems.filter((e) => e.evidence_type === "doc2");
  const link3Items = unit.evidenceItems.filter((e) => e.evidence_type === "link3");

  // Open / View signed URL
  const handleViewFile = async (evItem: EvidenceItem) => {
    if (evItem.external_url) {
      window.open(evItem.external_url, "_blank");
      return;
    }
    if (evItem.storage_path) {
      try {
        const signedUrl = await getEvidenceSignedUrl("evidence", evItem.storage_path);
        window.open(signedUrl, "_blank");
      } catch {
        toast.info(`Tệp minh chứng: ${evItem.file_name}`);
      }
    } else {
      toast.info(`Tệp minh chứng: ${evItem.file_name}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* ------------------------------------------------------------ */}
      {/* LEFT COLUMN: UNIT INFO & OFFICIAL GRADING (5 cols) */}
      {/* ------------------------------------------------------------ */}
      <div className="lg:col-span-5 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 text-xs sm:text-sm">
        <div className="border-b pb-2 flex items-center justify-between">
          <span className="font-bold text-slate-900 text-sm sm:text-base">
            Thẩm định & Cho điểm
          </span>
          <span className="text-xs font-semibold text-blue-700">
            {unit.organization.name}
          </span>
        </div>

        {/* Self score info */}
        <div className="space-y-3 text-slate-800">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 font-bold text-slate-700">Đoàn cơ sở:</div>
            <div className="col-span-7 font-medium text-slate-900">
              {unit.organization.name} ({unit.organization.code})
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 font-bold text-slate-700">Điểm tự chấm:</div>
            <div className="col-span-7 font-semibold text-blue-800">
              {selfScore} / {maxScore} điểm
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 font-bold text-slate-700">Trạng thái:</div>
            <div className="col-span-7">
              {status === "verified" ? (
                <span className="text-emerald-700 font-bold">Đã xác thực ({unit.submission?.admin_score}đ)</span>
              ) : status === "submitted" ? (
                <span className="text-blue-700 font-semibold">Đã nộp • Chờ xác thực</span>
              ) : status === "revision_requested" ? (
                <span className="text-amber-700 font-semibold">Yêu cầu bổ sung</span>
              ) : (
                <span className="text-slate-500 italic">Chưa nộp</span>
              )}
            </div>
          </div>
        </div>

        {/* Admin Final Grading Form */}
        <div className="pt-3 border-t border-slate-200 space-y-3 bg-slate-50/70 p-3.5 rounded-lg">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wide">
            <ShieldCheck className="h-4 w-4 text-blue-700" />
            Điểm thẩm định cuối cùng
          </div>

          <div className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5 font-bold text-slate-700 text-xs">
              Điểm chính thức:
            </div>
            <div className="col-span-7 flex items-center gap-2">
              <input
                type="number"
                step="0.25"
                min="0"
                max={maxScore}
                value={score}
                onChange={(e) => setScore(parseFloat(e.target.value) || 0)}
                className="w-16 h-8 text-center border border-emerald-300 rounded font-bold text-emerald-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-600">/ {maxScore} điểm</span>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">
              Nhận xét / Ý kiến thẩm định:
            </Label>
            <Textarea
              placeholder="Ghi chú thẩm định hoặc lý do nếu yêu cầu bổ sung..."
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1 text-xs bg-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              className="bg-[#2e7d32] hover:bg-[#256629] text-white gap-1 flex-1 text-xs"
              disabled={isSubmitting || isVerified}
              onClick={async () => {
                if (score < 0 || score > maxScore) {
                  toast.error(`Điểm thẩm định phải từ 0 đến ${maxScore}`);
                  return;
                }
                setIsSubmitting(true);
                await onVerify(
                  criterion,
                  unit.orgPeriodId,
                  unit.submission?.id,
                  unit.currentRevision?.id,
                  score,
                  comment,
                  unit.organization.id
                );
                setIsSubmitting(false);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Xác thực (Cho điểm)
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="text-amber-800 border-amber-300 hover:bg-amber-50 gap-1 flex-1 text-xs"
              disabled={isSubmitting || isVerified || !unit.submission}
              onClick={async () => {
                if (!unit.submission) {
                  toast.error("Đơn vị chưa nộp tiêu chí này để yêu cầu bổ sung.");
                  return;
                }
                if (!comment.trim()) {
                  toast.error("Vui lòng nhập lý do/yêu cầu bổ sung.");
                  return;
                }
                setIsSubmitting(true);
                await onRequestRevision(
                  criterion,
                  unit.submission.id,
                  unit.currentRevision?.id,
                  comment,
                  unit.organization.id
                );
                setIsSubmitting(false);
              }}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Yêu cầu bổ sung
            </Button>

            {isVerified && unit.submission && (
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-600 hover:bg-slate-200 text-xs w-full gap-1 mt-1"
                onClick={() => setReopenDialogOpen(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Mở lại thẩm định
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* RIGHT COLUMN: EVIDENCE SUBMITTED BY THIS UNIT (7 cols) */}
      {/* ------------------------------------------------------------ */}
      <div className="lg:col-span-7 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="border-b pb-2 flex items-center justify-between">
          <span className="font-bold text-slate-900 text-sm sm:text-base">
            Minh chứng đã nộp của đơn vị
          </span>
          <span className="text-xs text-slate-500">
            Tổng cộng: {unit.evidenceItems.length} minh chứng
          </span>
        </div>

        {/* Category 1: Văn bản triển khai */}
        <EvidenceReviewSubCard
          title="Văn bản triển khai"
          badgeText="Văn bản"
          items={doc1Items}
          onViewFile={handleViewFile}
        />

        {/* Category 2: Báo cáo tóm tắt kết quả */}
        <EvidenceReviewSubCard
          title="Báo cáo tóm tắt kết quả."
          badgeText="Báo cáo"
          items={doc2Items}
          onViewFile={handleViewFile}
        />

        {/* Category 3: Tin bài về hoạt động */}
        <EvidenceReviewSubCard
          title="Tin bài về hoạt động (hình ảnh phải rõ nội dung, thời gian tổ chức)."
          badgeText="Liên kết"
          items={link3Items}
          onViewFile={handleViewFile}
        />
      </div>

      {/* DIALOG: ADMIN REOPEN SUBMISSION */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mở lại thẩm định tiêu chí</DialogTitle>
            <DialogDescription>
              Thao tác mở lại sẽ đưa trạng thái về chờ thẩm định và lưu lý do vào Nhật ký hoạt động.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs">
            <Label className="text-xs font-semibold">Lý do mở lại thẩm định *</Label>
            <Textarea
              placeholder="Nhập lý do chi tiết..."
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReopenDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!reopenReason.trim()) {
                  toast.error("Vui lòng nhập lý do mở lại.");
                  return;
                }
                if (unit.submission) {
                  await onReopen(
                    criterion,
                    unit.submission.id,
                    unit.currentRevision?.id,
                    reopenReason
                  );
                  setReopenDialogOpen(false);
                  setReopenReason("");
                }
              }}
            >
              Xác nhận mở lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// HELPER: EvidenceReviewSubCard for Admin
// ============================================================

interface EvidenceReviewSubCardProps {
  title: string;
  badgeText: string;
  items: EvidenceItem[];
  onViewFile: (item: EvidenceItem) => void;
}

function EvidenceReviewSubCard({
  title,
  badgeText,
  items,
  onViewFile,
}: EvidenceReviewSubCardProps) {
  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return "0 KB";
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfcfd] p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h5 className="font-bold text-xs sm:text-sm text-slate-800 leading-snug">
          {title} <span className="text-slate-700 font-bold">*</span>
        </h5>
        <Badge
          variant="outline"
          className="text-[11px] font-normal px-2 py-0.5 bg-slate-100 text-slate-700 border-slate-200 shrink-0"
        >
          {badgeText}
        </Badge>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-md p-2.5 text-center text-[11px] text-slate-400">
          Đơn vị chưa nộp minh chứng cho mục này
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((ev) => {
            const isUrl = !!ev.external_url;
            return (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-slate-200 bg-white hover:border-slate-300 transition-all text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isUrl ? (
                    <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-600 shrink-0" />
                  )}
                  <span className="font-bold text-slate-800 uppercase truncate">
                    {ev.file_name}
                  </span>
                  {ev.file_size ? (
                    <span className="text-slate-500 font-normal shrink-0">
                      • {formatFileSize(ev.file_size)}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => onViewFile(ev)}
                  className="font-medium text-slate-800 hover:text-blue-700 hover:underline px-2.5 py-1 text-xs rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors shrink-0"
                >
                  Mở
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
