import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  UnifiedCriteriaAccordion,
  CriterionWithSubmission,
} from "@/components/criteria/UnifiedCriteriaAccordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Filter,
} from "lucide-react";
import { toast } from "sonner";

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
  if (!periodId) return { criteria: [], submissions: [], revisions: [], evidence: [], actions: [] };

  // 1. Fetch period criteria
  const { data: criteria } = await supabase
    .from("period_criteria")
    .select("*")
    .eq("period_id", periodId)
    .order("sort_order", { ascending: true });

  // 2. Fetch submissions for period & org
  let orgPeriodQuery = supabase
    .from("organization_periods")
    .select("id, organization_id")
    .eq("period_id", periodId);

  if (orgId && orgId !== "all") {
    orgPeriodQuery = orgPeriodQuery.eq("organization_id", orgId);
  }

  const { data: orgPeriods } = await orgPeriodQuery;
  const orgPeriodIds = (orgPeriods ?? []).map((op) => op.id);

  if (orgPeriodIds.length === 0) {
    return {
      criteria: (criteria ?? []) as PeriodCriterion[],
      submissions: [],
      revisions: [],
      evidence: [],
      actions: [],
    };
  }

  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .in("organization_period_id", orgPeriodIds);

  const subIds = (subs ?? []).map((s) => s.id);

  const [revRes, evRes, actRes] = await Promise.all([
    supabase.from("submission_revisions").select("*").in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("evidence_items").select("*"),
    supabase.from("review_actions").select("*").in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  return {
    criteria: (criteria ?? []) as PeriodCriterion[],
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
  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ["admin_review_periods"],
    queryFn: fetchPeriods,
  });

  // Set default period once loaded
  const activePeriod = useMemo(() => {
    if (!periods || periods.length === 0) return null;
    const act = periods.find((p) => p.status === "active") || periods[0];
    if (!selectedPeriodId && act) {
      setSelectedPeriodId(act.id);
    }
    return act;
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

  // Combine data into CriterionWithSubmission
  const criteriaItems: CriterionWithSubmission[] = useMemo(() => {
    if (!queueData) return [];
    return queueData.criteria.map((c) => {
      const sub = queueData.submissions.find((s) => s.period_criteria_id === c.id);
      const rev = sub ? queueData.revisions.find((r) => r.id === sub.current_revision_id) : null;
      const ev = rev ? queueData.evidence.filter((e) => e.revision_id === rev.id) : [];
      const acts = sub ? queueData.actions.filter((a) => a.submission_id === sub.id) : [];

      return {
        criterion: c,
        submission: sub,
        currentRevision: rev,
        evidenceItems: ev,
        reviewActions: acts,
      };
    });
  }, [queueData]);

  // Statistics
  const total = criteriaItems.length;
  const submitted = criteriaItems.filter((i) => i.submission?.status === "submitted").length;
  const verified = criteriaItems.filter((i) => i.submission?.status === "verified").length;
  const revisionReq = criteriaItems.filter((i) => i.submission?.status === "revision_requested").length;
  const unsubmitted = total - (submitted + verified + revisionReq);

  // Filtered queue items
  const filteredQueue = criteriaItems.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      item.criterion.code_snapshot?.toLowerCase().includes(q) ||
      item.criterion.title_snapshot?.toLowerCase().includes(q);
    const itemStatus = item.submission?.status || "draft";
    const matchStatus = filterStatus === "all" || itemStatus === filterStatus;
    return matchSearch && matchStatus;
  });

  // Admin Action: Verify
  const handleAdminVerify = async (submissionId: string, officialScore: number, comment: string) => {
    const { error: subError } = await supabase
      .from("submissions")
      .update({
        status: "verified",
        admin_score: officialScore,
        verified_by: profile?.id || null,
        verified_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    if (subError) {
      toast.error("Lỗi khi xác thực: " + subError.message);
      return;
    }

    // Insert review action log
    const sub = criteriaItems.find((i) => i.submission?.id === submissionId);
    if (sub?.currentRevision) {
      await supabase.from("review_actions").insert({
        submission_id: submissionId,
        revision_id: sub.currentRevision.id,
        admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
        action: "verified",
        self_score_snapshot: sub.currentRevision.self_score,
        admin_score: officialScore,
        comment: comment || "Đã thẩm định đạt yêu cầu",
      });
    }

    // Insert audit log
    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "VERIFY_CRITERION",
      entity_type: "submission",
      entity_id: submissionId,
      new_values: { admin_score: officialScore, comment },
    });

    // Send in-app notification to organization users
    if (sub?.criterion && sub?.submission?.organization_period_id) {
      const { data: op } = await supabase
        .from("organization_periods")
        .select("organization_id")
        .eq("id", sub.submission.organization_period_id)
        .maybeSingle();

      if (op?.organization_id) {
        const { data: orgUsers } = await supabase
          .from("profiles")
          .select("id")
          .eq("organization_id", op.organization_id);

        if (orgUsers && orgUsers.length > 0) {
          await supabase.from("notifications").insert(
            orgUsers.map((u) => ({
              recipient_id: u.id,
              title: `Tiêu chí ${sub.criterion.code_snapshot} đã được xác thực`,
              message: `Hội đồng đã thẩm định tiêu chí "${sub.criterion.title_snapshot}". Điểm chính thức: ${officialScore}đ.`,
              type: "verified",
              link_url: "/user/results",
            }))
          );
        }
      }
    }

    toast.success("Đã xác thực tiêu chí thành công!");
    refetch();
  };

  // Admin Action: Request Revision
  const handleAdminRequestRevision = async (submissionId: string, comment: string) => {
    const { error: subError } = await supabase
      .from("submissions")
      .update({
        status: "revision_requested",
      })
      .eq("id", submissionId);

    if (subError) {
      toast.error("Lỗi: " + subError.message);
      return;
    }

    const sub = criteriaItems.find((i) => i.submission?.id === submissionId);
    if (sub?.currentRevision) {
      await supabase.from("review_actions").insert({
        submission_id: submissionId,
        revision_id: sub.currentRevision.id,
        admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
        action: "revision_requested",
        self_score_snapshot: sub.currentRevision.self_score,
        admin_score: null,
        comment: comment,
      });
    }

    // Insert audit log
    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "REQUEST_REVISION",
      entity_type: "submission",
      entity_id: submissionId,
      new_values: { comment },
    });

    // Send in-app notification to organization users
    if (sub?.criterion && sub?.submission?.organization_period_id) {
      const { data: op } = await supabase
        .from("organization_periods")
        .select("organization_id")
        .eq("id", sub.submission.organization_period_id)
        .maybeSingle();

      if (op?.organization_id) {
        const { data: orgUsers } = await supabase
          .from("profiles")
          .select("id")
          .eq("organization_id", op.organization_id);

        if (orgUsers && orgUsers.length > 0) {
          await supabase.from("notifications").insert(
            orgUsers.map((u) => ({
              recipient_id: u.id,
              title: `Yêu cầu bổ sung minh chứng tiêu chí ${sub.criterion.code_snapshot}`,
              message: `Ý kiến Hội đồng: ${comment || "Vui lòng cập nhật bổ sung minh chứng cho tiêu chí này."}`,
              type: "revision_requested",
              link_url: "/user/criteria",
            }))
          );
        }
      }
    }

    toast.warning("Đã gửi yêu cầu bổ sung minh chứng!");
    refetch();
  };

  // Admin Action: Reopen
  const handleAdminReopen = async (submissionId: string, reason: string) => {
    const { error: subError } = await supabase
      .from("submissions")
      .update({
        status: "submitted",
        verified_at: null,
        verified_by: null,
      })
      .eq("id", submissionId);

    if (subError) {
      toast.error("Lỗi: " + subError.message);
      return;
    }

    const sub = criteriaItems.find((i) => i.submission?.id === submissionId);
    if (sub?.currentRevision) {
      await supabase.from("review_actions").insert({
        submission_id: submissionId,
        revision_id: sub.currentRevision.id,
        admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
        action: "reopened",
        self_score_snapshot: sub.currentRevision.self_score,
        admin_score: null,
        comment: reason,
      });
    }

    // Mandatory audit log for reopen
    await supabase.from("audit_logs").insert({
      actor_id: profile?.id || null,
      action: "REOPEN_VERIFIED_SUBMISSION",
      entity_type: "submission",
      entity_id: submissionId,
      new_values: { reason },
    });

    toast.info("Đã mở lại bài nộp để thẩm định lại.");
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
          Hội đồng thẩm định xem xét minh chứng, chấm điểm chính thức và phê duyệt tiêu chí
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
                placeholder="Tìm mã hoặc tên..."
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
            <span className="text-xl font-bold text-orange-900">{submitted}</span>
          </div>
          <Clock className="h-6 w-6 text-orange-400" />
        </div>

        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div>
            <span className="text-emerald-700 block font-medium">Đã xác thực</span>
            <span className="text-xl font-bold text-emerald-900">{verified}</span>
          </div>
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>

        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div>
            <span className="text-amber-700 block font-medium">Yêu cầu bổ sung</span>
            <span className="text-xl font-bold text-amber-900">{revisionReq}</span>
          </div>
          <AlertCircle className="h-6 w-6 text-amber-500" />
        </div>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-slate-600 block font-medium">Chưa nộp</span>
            <span className="text-xl font-bold text-slate-800">{unsubmitted}</span>
          </div>
          <Layers className="h-6 w-6 text-slate-400" />
        </div>
      </div>

      {/* Review Queue Accordion List */}
      <div className="space-y-3">
        {queueLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2 bg-white rounded-lg border">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
            <p>Đang tải danh sách bài nộp cần thẩm định...</p>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground bg-white rounded-lg border">
            <CheckSquare className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            Không có tiêu chí nào trong hàng đợi thẩm định.
          </div>
        ) : (
          filteredQueue.map((item) => (
            <UnifiedCriteriaAccordion
              key={item.criterion.id}
              item={item}
              mode="admin"
              onAdminVerify={handleAdminVerify}
              onAdminRequestRevision={handleAdminRequestRevision}
              onAdminReopen={handleAdminReopen}
            />
          ))
        )}
      </div>
    </div>
  );
}
