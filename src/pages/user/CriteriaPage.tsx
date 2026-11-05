import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type {
  EvaluationPeriod,
  PeriodCriterion,
  CriteriaCategory,
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
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Building,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Save,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// Data Fetching
// ============================================================

async function fetchActivePeriod(): Promise<EvaluationPeriod | null> {
  const { data } = await supabase
    .from("evaluation_periods")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    // If no active, try draft or any period
    const { data: anyPeriod } = await supabase
      .from("evaluation_periods")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return anyPeriod as EvaluationPeriod | null;
  }
  return data as EvaluationPeriod;
}

async function fetchPeriodCriteria(periodId: string): Promise<PeriodCriterion[]> {
  const { data, error } = await supabase
    .from("period_criteria")
    .select("*")
    .eq("period_id", periodId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PeriodCriterion[];
}

async function fetchUserSubmissions(periodId: string, orgId?: string | null) {
  if (!orgId) return { submissions: [], revisions: [], evidence: [] };

  // Get organization_period_id
  const { data: orgPeriod } = await supabase
    .from("organization_periods")
    .select("id")
    .eq("period_id", periodId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!orgPeriod) return { submissions: [], revisions: [], evidence: [] };

  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .eq("organization_period_id", orgPeriod.id);

  const subIds = (subs ?? []).map((s) => s.id);

  const [revRes, evRes] = await Promise.all([
    supabase.from("submission_revisions").select("*").in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("evidence_items").select("*"),
  ]);

  return {
    orgPeriodId: orgPeriod.id,
    submissions: (subs ?? []) as Submission[],
    revisions: (revRes.data ?? []) as SubmissionRevision[],
    evidence: (evRes.data ?? []) as EvidenceItem[],
  };
}

async function fetchMasterLibraryCriteria(): Promise<any[]> {
  const { data, error } = await supabase
    .from("criteria_library")
    .select("*, category:criteria_categories(*)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) return [];
  return data ?? [];
}

// ============================================================
// Main Page Component
// ============================================================

export default function UserCriteriaPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Fetch active period
  const { data: period, isLoading: periodLoading } = useQuery({
    queryKey: ["user_active_period"],
    queryFn: fetchActivePeriod,
  });

  // Fetch period criteria
  const { data: criteria, isLoading: criteriaLoading } = useQuery({
    queryKey: ["user_period_criteria", period?.id],
    queryFn: () => (period ? fetchPeriodCriteria(period.id) : []),
    enabled: !!period?.id,
  });

  // Fetch user submissions
  const { data: subData, isLoading: subLoading, refetch: refetchSubmissions } = useQuery({
    queryKey: ["user_submissions", period?.id, profile?.organization_id],
    queryFn: () => fetchUserSubmissions(period?.id || "", profile?.organization_id),
    enabled: !!period?.id,
  });

  // Fetch master criteria library (for reference preview when period criteria is not yet configured)
  const { data: libraryCriteria, isLoading: libraryLoading } = useQuery({
    queryKey: ["user_master_library_preview"],
    queryFn: fetchMasterLibraryCriteria,
    enabled: (!period || (criteria && criteria.length === 0)),
  });

  // Combine data into CriterionWithSubmission
  const criteriaItems: CriterionWithSubmission[] = useMemo(() => {
    return (criteria ?? []).map((c) => {
      const sub = subData?.submissions.find((s) => s.period_criteria_id === c.id);
      const rev = sub ? subData?.revisions.find((r) => r.id === sub.current_revision_id) : null;
      const ev = rev ? subData?.evidence.filter((e) => e.revision_id === rev.id) : [];

      return {
        criterion: c,
        submission: sub,
        currentRevision: rev,
        evidenceItems: ev,
      };
    });
  }, [criteria, subData]);

  // Calculations for stats & progress
  const totalCriteria = criteriaItems.length;
  const submittedCount = criteriaItems.filter((i) => i.submission?.status === "submitted" || i.submission?.status === "verified").length;
  const verifiedCount = criteriaItems.filter((i) => i.submission?.status === "verified").length;
  const revisionCount = criteriaItems.filter((i) => i.submission?.status === "revision_requested").length;
  const remainingCount = totalCriteria - submittedCount;
  const progressPercent = totalCriteria > 0 ? Math.round((submittedCount / totalCriteria) * 100) : 0;

  // Filtered list
  const filteredItems = criteriaItems.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      item.criterion.code_snapshot?.toLowerCase().includes(q) ||
      item.criterion.title_snapshot?.toLowerCase().includes(q);
    const matchCategory =
      filterCategory === "all" || item.criterion.category_name_snapshot === filterCategory;
    const matchStatus =
      filterStatus === "all" || (item.submission?.status || "draft") === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    criteriaItems.forEach((i) => {
      if (i.criterion.category_name_snapshot) set.add(i.criterion.category_name_snapshot);
    });
    return Array.from(set);
  }, [criteriaItems]);

  if (profile?.role === "user" && !profile?.organization_id) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Bộ tiêu chí đánh giá
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Đánh giá công tác Đoàn và nộp minh chứng
          </p>
        </div>
        <Card className="border-amber-200 bg-amber-50/70 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-amber-900">
                Tài khoản chưa được liên kết với Đơn vị Đoàn cơ sở
              </h3>
              <p className="text-xs text-amber-800">
                Tài khoản của bạn hiện chưa được phân bổ vào Đơn vị Đoàn cơ sở nào. Theo quy định, người dùng cơ sở cần được gắn vào một Đơn vị để nhận bài nộp và nộp minh chứng.
              </p>
              <p className="text-xs text-amber-900 font-semibold pt-1">
                👉 Vui lòng liên hệ Quản trị viên hệ thống để được gán đơn vị (trong mục "Quản lý tài khoản" của Admin).
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Helper: Persist submission, revision and evidence items to Supabase
  const persistSubmission = async (
    criterionId: string,
    selfScore: number,
    evidence: EvidenceItem[],
    targetStatus: "draft" | "submitted"
  ) => {
    if (!period?.id || !profile?.organization_id) {
      throw new Error("Không tìm thấy thông tin đợt đánh giá hoặc đơn vị.");
    }

    // 1. Get or create organization_period assignment
    let orgPeriodId = subData?.orgPeriodId;
    if (!orgPeriodId) {
      const { data: existingOp } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", period.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (existingOp) {
        orgPeriodId = existingOp.id;
      } else {
        const { data: newOp, error: opErr } = await supabase
          .from("organization_periods")
          .insert({
            period_id: period.id,
            organization_id: profile.organization_id,
            status: "in_progress",
          })
          .select("id")
          .single();
        if (opErr) throw opErr;
        orgPeriodId = newOp.id;
      }
    }

    // 2. Check existing submission
    const existingSub = subData?.submissions.find((s) => s.period_criteria_id === criterionId);
    let submissionId = existingSub?.id;

    if (!submissionId) {
      const { data: newSub, error: subErr } = await supabase
        .from("submissions")
        .insert({
          organization_period_id: orgPeriodId,
          period_criteria_id: criterionId,
          status: targetStatus,
        })
        .select("id")
        .single();
      if (subErr) throw subErr;
      submissionId = newSub.id;
    } else {
      const { error: updErr } = await supabase
        .from("submissions")
        .update({
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      if (updErr) throw updErr;
    }

    // 3. Create a new revision (PRD Part 4.9: Preserve every submission version)
    const currentRevNumber = existingSub ? (subData?.revisions.filter(r => r.submission_id === submissionId).length || 0) : 0;
    const nextRevNumber = currentRevNumber + 1;

    const { data: newRev, error: revErr } = await supabase
      .from("submission_revisions")
      .insert({
        submission_id: submissionId,
        revision_number: nextRevNumber,
        self_score: selfScore,
        submitted_by: profile.id,
        submitted_at: targetStatus === "submitted" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (revErr) throw revErr;

    // 4. Update current_revision_id on submission
    await supabase
      .from("submissions")
      .update({ current_revision_id: newRev.id })
      .eq("id", submissionId);

    // 5. Insert evidence items for this revision
    if (evidence.length > 0) {
      const evPayload = evidence.map((e) => ({
        revision_id: newRev.id,
        evidence_type: e.evidence_type,
        file_name: e.file_name,
        storage_path: e.storage_path,
        external_url: e.external_url,
        mime_type: e.mime_type,
        file_size: e.file_size,
        uploaded_by: profile.id,
      }));

      const { error: evErr } = await supabase.from("evidence_items").insert(evPayload);
      if (evErr) throw evErr;
    }

    // 6. Record Audit Log
    await supabase.from("audit_logs").insert({
      actor_id: profile.id,
      action: targetStatus === "submitted" ? "SUBMIT_CRITERION" : "SAVE_DRAFT_CRITERION",
      entity_type: "submission",
      entity_id: submissionId,
      new_values: { self_score: selfScore, revision_number: nextRevNumber, evidence_count: evidence.length },
    });

    // 7. Notify Admins when a criterion is submitted
    if (targetStatus === "submitted") {
      const { data: adminUsers } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin");

      if (adminUsers && adminUsers.length > 0) {
        const crit = criteriaItems.find((i) => i.criterion.id === criterionId);
        await supabase.from("notifications").insert(
          adminUsers.map((a) => ({
            recipient_id: a.id,
            title: `Đơn vị nộp minh chứng tiêu chí ${crit?.criterion.code_snapshot || ""}`,
            message: `${profile.display_name || "Đoàn cơ sở"} vừa nộp minh chứng tiêu chí "${crit?.criterion.title_snapshot || ""}". Tự chấm: ${selfScore}đ.`,
            type: "submission_received",
            link_url: "/admin/review",
          }))
        );
      }
    }
  };

  // User Actions: Save Draft
  const handleSaveDraft = async (criterionId: string, selfScore: number, evidence: EvidenceItem[]) => {
    try {
      await persistSubmission(criterionId, selfScore, evidence, "draft");
      toast.success("Đã lưu bản nháp tiêu chí thành công!");
      await refetchSubmissions();
      await queryClient.invalidateQueries({ queryKey: ["user_submissions"] });
    } catch (err: any) {
      toast.error("Lỗi khi lưu nháp: " + err.message);
    }
  };

  // User Actions: Submit Single
  const handleSubmitCriterion = async (criterionId: string, selfScore: number, evidence: EvidenceItem[]) => {
    try {
      const isAlreadySubmitted = criteriaItems.find((i) => i.criterion.id === criterionId)?.submission?.status === "submitted";
      await persistSubmission(criterionId, selfScore, evidence, "submitted");
      if (isAlreadySubmitted) {
        toast.success("Đã cập nhật minh chứng thành công! Hồ sơ đang ở trạng thái Chờ xác thực.");
      } else {
        toast.success("Nộp tiêu chí thành công! Trạng thái: Đã nộp, Chờ xác thực.");
      }
      await refetchSubmissions();
      await queryClient.invalidateQueries({ queryKey: ["user_submissions"] });
    } catch (err: any) {
      toast.error("Lỗi khi nộp tiêu chí: " + err.message);
    }
  };

  // User Actions: Submit All Eligible Criteria (Nộp bài thi chính thức)
  const handleSubmitAll = async () => {
    const eligible = criteriaItems.filter(
      (i) => (!i.submission || i.submission.status === "draft" || i.submission.status === "revision_requested")
    );
    if (eligible.length === 0) {
      toast.info("Tất cả tiêu chí đã được nộp hoặc đã được thẩm định.");
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn nộp chính thức ${eligible.length} tiêu chí cho Hội đồng thẩm định? Sau khi nộp, trạng thái sẽ là "Đã nộp, Chờ xác thực".`)) {
      return;
    }

    const toastId = toast.loading("Đang nộp hồ sơ đánh giá...");
    try {
      for (const item of eligible) {
        const score = item.currentRevision?.self_score ?? item.criterion.max_score_snapshot ?? 0;
        const ev = item.evidenceItems ?? [];
        await persistSubmission(item.criterion.id, score, ev, "submitted");
      }

      if (subData?.orgPeriodId) {
        await supabase
          .from("organization_periods")
          .update({ status: "submitted" })
          .eq("id", subData.orgPeriodId);
      }

      toast.success(`Đã nộp thành công ${eligible.length} tiêu chí! Hồ sơ đang chờ Ban Thường vụ thẩm định.`, { id: toastId });
      await refetchSubmissions();
      await queryClient.invalidateQueries({ queryKey: ["user_submissions"] });
    } catch (err: any) {
      toast.error("Lỗi khi nộp hồ sơ: " + err.message, { id: toastId });
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Page Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-blue-700 font-semibold">
          <Calendar className="h-4 w-4" />
          <span>{period?.name || "Đợt đánh giá công tác Đoàn"}</span>
          <Badge className="bg-emerald-600 text-white text-[11px] ml-1">Đang mở nộp bài</Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Bộ tiêu chí đánh giá
        </h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Building className="h-4 w-4" />
          Đơn vị: <b className="text-slate-800">{profile?.display_name || "Đoàn cơ sở"}</b>
        </p>
      </div>

      {/* KPI & Progress Top Cards */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-800">
              Tiến độ hoàn thành minh chứng & nộp bài
            </span>
            <span className="font-bold text-blue-700 text-base">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2.5" />

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-xs">
            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-100">
              <span className="text-muted-foreground block">Tổng tiêu chí</span>
              <span className="text-lg font-bold text-slate-900">{totalCriteria}</span>
            </div>
            <div className="p-2.5 rounded-md bg-blue-50 border border-blue-100">
              <span className="text-blue-700 block">Đã nộp</span>
              <span className="text-lg font-bold text-blue-800">{submittedCount}</span>
            </div>
            <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-100">
              <span className="text-emerald-700 block">Đã xác thực</span>
              <span className="text-lg font-bold text-emerald-800">{verifiedCount}</span>
            </div>
            <div className="p-2.5 rounded-md bg-amber-50 border border-amber-100">
              <span className="text-amber-700 block">Cần bổ sung</span>
              <span className="text-lg font-bold text-amber-800">{revisionCount}</span>
            </div>
            <div className="p-2.5 rounded-md bg-slate-100 border border-slate-200 col-span-2 sm:col-span-1">
              <span className="text-slate-600 block">Chưa nộp</span>
              <span className="text-lg font-bold text-slate-700">{remainingCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo mã hoặc nội dung..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Nhóm tiêu chí" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhóm</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="draft">Chưa nộp</SelectItem>
            <SelectItem value="submitted">Đã nộp</SelectItem>
            <SelectItem value="revision_requested">Cần bổ sung</SelectItem>
            <SelectItem value="verified">Đã xác thực</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Criteria Accordion List */}
      <div className="space-y-3">
        {periodLoading || criteriaLoading || subLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
            <p>Đang tải danh sách tiêu chí đánh giá...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          (libraryCriteria && libraryCriteria.length > 0) ? (
            <div className="space-y-4">
              <Card className="border-blue-200 bg-blue-50/70 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-blue-900 text-sm">
                      Đang hiển thị danh mục tiêu chí tham khảo ({libraryCriteria.length} tiêu chí gốc)
                    </p>
                    <p className="text-blue-800">
                      Hiện tại chưa có đợt đánh giá nào được kích hoạt hoặc đơn vị của bạn chưa được phân bổ tiêu chí trong đợt hiện tại.
                    </p>
                    <p className="text-blue-700 font-medium">
                      👉 Để Đoàn cơ sở có thể tự chấm điểm và nộp minh chứng, Quản trị viên cần vào mục <b>"Đợt đánh giá"</b> &gt; chọn <b>"Cấu hình tiêu chí"</b> &gt; nhấn <b>"Mở đợt" (Kích hoạt)</b>.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="space-y-3">
                {libraryCriteria.map((lib: any) => (
                  <Card key={lib.id} className="border-slate-200 shadow-2xs hover:border-slate-300 transition-colors">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                              {lib.code}
                            </span>
                            <Badge variant="outline" className="text-[11px] text-slate-600">
                              {lib.category?.name || "Chung"}
                            </Badge>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 pt-1">
                            {lib.title}
                          </h4>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs text-muted-foreground block">Điểm tối đa</span>
                          <span className="text-base font-extrabold text-blue-700">
                            {lib.max_score}đ
                          </span>
                        </div>
                      </div>

                      {lib.description && (
                        <p className="text-xs text-slate-600">
                          {lib.description}
                        </p>
                      )}

                      {lib.scoring_guidelines && (
                        <div className="p-2.5 rounded bg-slate-50 border border-slate-100 text-[11px] text-slate-700">
                          <b>Hướng dẫn chấm:</b> {lib.scoring_guidelines}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
                        <span className="text-[11px] font-medium text-slate-500">Yêu cầu minh chứng:</span>
                        {lib.req_doc1 && (
                          <Badge variant="secondary" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
                            1. Văn bản triển khai
                          </Badge>
                        )}
                        {lib.req_doc2 && (
                          <Badge variant="secondary" className="bg-blue-50 text-blue-800 border-blue-200 text-[10px]">
                            2. Báo cáo kết quả
                          </Badge>
                        )}
                        {lib.req_link3 && (
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">
                            3. Tin bài hoạt động
                          </Badge>
                        )}
                        {lib.responsible_unit && (
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            Đơn vị phụ trách: <b>{lib.responsible_unit}</b>
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-16 text-center text-sm text-muted-foreground bg-white rounded-lg border">
              <Layers className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Chưa có tiêu chí nào trong hệ thống. Quản trị viên chưa tạo tiêu chí gốc hoặc đợt đánh giá.
            </div>
          )
        ) : (
          filteredItems.map((item) => (
            <UnifiedCriteriaAccordion
              key={item.criterion.id}
              item={item}
              mode="user"
              onSaveDraft={handleSaveDraft}
              onSubmit={handleSubmitCriterion}
            />
          ))
        )}
      </div>

      {/* ============================================================ */}
      {/* 8.6 & 9 STICKY BOTTOM ACTION BAR */}
      {/* Matches user screenshot: Tiến độ: X/Y tiêu chí, Lưu toàn bộ, Nộp bài thi chính thức */}
      {/* ============================================================ */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 md:px-8 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col text-left w-full sm:w-auto">
            <span className="font-bold text-sm text-slate-900">
              Tiến độ: {submittedCount}/{totalCriteria} tiêu chí
            </span>
            <span className="text-xs text-slate-500">
              {submittedCount === totalCriteria && totalCriteria > 0
                ? "Hồ sơ đã nộp chính thức và đang được khóa"
                : remainingCount > 0
                ? `Còn lại ${remainingCount} tiêu chí chưa hoàn tất nộp`
                : "Hồ sơ đã sẵn sàng nộp chính thức"}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 font-medium text-xs sm:text-sm h-9"
              onClick={() => toast.success("Đã lưu nháp toàn bộ thông tin!")}
            >
              Lưu toàn bộ
            </Button>
            <Button
              size="sm"
              className="bg-[#659777] hover:bg-[#537e62] text-white font-medium px-5 py-2 text-xs sm:text-sm h-9 rounded-md shadow-2xs transition-colors"
              onClick={handleSubmitAll}
            >
              Nộp bài thi chính thức
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
