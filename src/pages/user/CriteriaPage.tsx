import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalLoading } from "@/contexts/LoadingContext";
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
  Building,
  Calendar,
  Layers,
  Save,
  Send,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ============================================================
// Data Fetching
// ============================================================

async function fetchAllPeriods(): Promise<EvaluationPeriod[]> {
  const { data, error } = await supabase
    .from("evaluation_periods")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EvaluationPeriod[];
}

async function fetchPeriodCriteria(periodId: string): Promise<PeriodCriterion[]> {
  const [critRes, libRes] = await Promise.all([
    supabase
      .from("period_criteria")
      .select("*")
      .eq("period_id", periodId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("criteria_library")
      .select("id, is_active"),
  ]);

  if (critRes.error) throw critRes.error;
  const libMap = new Map((libRes.data ?? []).map((l) => [l.id, l.is_active]));

  // Exclude criteria that were deleted from library or marked inactive (locked)
  return (critRes.data ?? []).filter((c) => {
    if (!c.source_criteria_id) return true;
    return libMap.get(c.source_criteria_id) === true;
  }) as PeriodCriterion[];
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
    supabase
      .from("submission_revisions")
      .select("*")
      .in("submission_id", subIds.length ? subIds : ["00000000-0000-0000-0000-000000000000"]),
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

// Format date helper
function formatDateDisplay(isoStr: string | null | undefined): string {
  if (!isoStr) return "Chưa đặt";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  } catch {
    return isoStr;
  }
}

// ============================================================
// Main Page Component
// ============================================================

export default function UserCriteriaPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { withLoading } = useGlobalLoading();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodParam = searchParams.get("period");

  // Filter & Search inside Criteria View
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Filter inside Periods Overview
  const [periodSearch, setPeriodSearch] = useState("");
  const [periodStatusFilter, setPeriodStatusFilter] = useState("all");

  // 1. Fetch ALL evaluation periods sorted newest first
  const { data: allPeriods, isLoading: periodsLoading } = useQuery({
    queryKey: ["user_all_periods"],
    queryFn: fetchAllPeriods,
  });

  // Current selected period (if period query param is present)
  const selectedPeriod = useMemo(() => {
    if (!allPeriods || allPeriods.length === 0) return null;
    if (periodParam) {
      return allPeriods.find((p) => p.id === periodParam) || null;
    }
    return null;
  }, [allPeriods, periodParam]);

  // 2. Fetch criteria for selected period
  const { data: criteria, isLoading: criteriaLoading } = useQuery({
    queryKey: ["user_period_criteria", selectedPeriod?.id],
    queryFn: () => (selectedPeriod ? fetchPeriodCriteria(selectedPeriod.id) : []),
    enabled: !!selectedPeriod?.id,
  });

  // 3. Fetch submissions for selected period
  const { data: subData, isLoading: subLoading, refetch: refetchSubmissions } = useQuery({
    queryKey: ["user_submissions", selectedPeriod?.id, profile?.organization_id],
    queryFn: () => fetchUserSubmissions(selectedPeriod?.id || "", profile?.organization_id),
    enabled: !!selectedPeriod?.id,
  });

  // 4. Fetch master library fallback if period criteria is not configured
  const { data: libraryCriteria } = useQuery({
    queryKey: ["user_master_library_preview"],
    queryFn: fetchMasterLibraryCriteria,
    enabled: !selectedPeriod || (criteria && criteria.length === 0),
  });

  // Combine criteria with user submissions
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

  // Progress metrics
  const totalCriteria = criteriaItems.length;
  const submittedCount = criteriaItems.filter(
    (i) => i.submission?.status === "submitted" || i.submission?.status === "verified"
  ).length;
  const verifiedCount = criteriaItems.filter((i) => i.submission?.status === "verified").length;
  const revisionCount = criteriaItems.filter((i) => i.submission?.status === "revision_requested").length;
  const remainingCount = totalCriteria - submittedCount;
  const progressPercent = totalCriteria > 0 ? Math.round((submittedCount / totalCriteria) * 100) : 0;

  // Filtered criteria
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

  // Filtered periods in overview
  const filteredPeriods = useMemo(() => {
    return (allPeriods ?? []).filter((p) => {
      const matchText = p.name.toLowerCase().includes(periodSearch.toLowerCase());
      const matchStatus =
        periodStatusFilter === "all" || p.status === periodStatusFilter;
      return matchText && matchStatus;
    });
  }, [allPeriods, periodSearch, periodStatusFilter]);

  // Guard: User must belong to an organization
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
    if (!selectedPeriod?.id || !profile?.organization_id) {
      throw new Error("Không tìm thấy thông tin đợt đánh giá hoặc đơn vị.");
    }

    // 1. Get or create organization_period assignment
    let orgPeriodId = subData?.orgPeriodId;
    if (!orgPeriodId) {
      const { data: existingOp } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", selectedPeriod.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (existingOp) {
        orgPeriodId = existingOp.id;
      } else {
        const { data: newOp, error: opErr } = await supabase
          .from("organization_periods")
          .insert({
            period_id: selectedPeriod.id,
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
    const currentRevNumber = existingSub
      ? subData?.revisions.filter((r) => r.submission_id === submissionId).length || 0
      : 0;
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

    // 7. Notify Admins when submitted
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

  // User Action: Save Draft
  const handleSaveDraft = async (criterionId: string, selfScore: number, evidence: EvidenceItem[]) => {
    try {
      await withLoading(async () => {
        await persistSubmission(criterionId, selfScore, evidence, "draft");
        await refetchSubmissions();
        await queryClient.invalidateQueries({ queryKey: ["user_submissions"] });
      }, "Đang lưu nháp tiêu chí...");
      toast.success("Đã lưu bản nháp tiêu chí thành công!");
    } catch (err: any) {
      toast.error("Lỗi khi lưu nháp: " + err.message);
    }
  };

  // User Action: Submit Single
  const handleSubmitCriterion = async (criterionId: string, selfScore: number, evidence: EvidenceItem[]) => {
    try {
      const isAlreadySubmitted = criteriaItems.find((i) => i.criterion.id === criterionId)?.submission?.status === "submitted";
      await withLoading(async () => {
        await persistSubmission(criterionId, selfScore, evidence, "submitted");
        await refetchSubmissions();
        await queryClient.invalidateQueries({ queryKey: ["user_submissions"] });
      }, isAlreadySubmitted ? "Đang cập nhật minh chứng..." : "Đang nộp tiêu chí...");

      if (isAlreadySubmitted) {
        toast.success("Đã cập nhật minh chứng thành công! Hồ sơ đang ở trạng thái Chờ xác thực.");
      } else {
        toast.success("Nộp tiêu chí thành công! Trạng thái: Đã nộp, Chờ xác thực.");
      }
    } catch (err: any) {
      toast.error("Lỗi khi nộp tiêu chí: " + err.message);
    }
  };

  // User Action: Submit All Eligible Criteria
  const handleSubmitAll = async () => {
    const eligible = criteriaItems.filter(
      (i) => (!i.submission || i.submission.status === "draft" || i.submission.status === "revision_requested")
    );
    if (eligible.length === 0) {
      toast.info("Tất cả tiêu chí đã được nộp hoặc đã được thẩm định.");
      return;
    }
    if (
      !confirm(
        `Bạn có chắc chắn muốn nộp chính thức ${eligible.length} tiêu chí cho Hội đồng thẩm định? Sau khi nộp, trạng thái sẽ là "Đã nộp, Chờ xác thực".`
      )
    ) {
      return;
    }

    try {
      await withLoading(async () => {
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

        await refetchSubmissions();
        await queryClient.invalidateQueries({ queryKey: ["user_submissions"] });
      }, `Đang nộp hồ sơ ${eligible.length} tiêu chí...`);

      toast.success(
        `Đã nộp thành công ${eligible.length} tiêu chí! Hồ sơ đang chờ Ban Thường vụ thẩm định.`
      );
    } catch (err: any) {
      toast.error("Lỗi khi nộp hồ sơ: " + err.message);
    }
  };

  // ============================================================
  // VIEW 1: PERIODS OVERVIEW (When no period is selected)
  // Sắp xếp đợt mới nhất lên đầu, nhấn vào từng đợt để xem tiêu chí!
  // ============================================================
  if (!selectedPeriod) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Các đợt đánh giá thi đua
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
              <Building className="h-4 w-4 text-blue-700" />
              Đơn vị: <b className="text-slate-800">{profile?.display_name || "Đoàn cơ sở"}</b>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="text-slate-500">
                Chọn đợt để xem bộ tiêu chí, tự chấm điểm và nộp minh chứng
              </span>
            </p>
          </div>
        </div>

        {/* Filters & Search for Periods */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên đợt đánh giá..."
              value={periodSearch}
              onChange={(e) => setPeriodSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={periodStatusFilter} onValueChange={setPeriodStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Trạng thái đợt" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="active">Đang mở nộp bài</SelectItem>
              <SelectItem value="closed">Đang thẩm định (Đã đóng nộp)</SelectItem>
              <SelectItem value="archived">Đã kết thúc / Khóa</SelectItem>
              <SelectItem value="draft">Dự thảo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Periods Grid (Newest first) */}
        {periodsLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2 bg-white rounded-xl border">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
            <p>Đang tải danh sách các đợt đánh giá...</p>
          </div>
        ) : filteredPeriods.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground bg-white rounded-xl border space-y-3">
            <Calendar className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="font-medium text-slate-700">Chưa có đợt đánh giá nào trong hệ thống.</p>
            <p className="text-xs text-slate-400">
              Quản trị viên chưa tạo hoặc chưa kích hoạt đợt đánh giá nào.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPeriods.map((p) => {
              const isActive = p.status === "active";
              return (
                <div
                  key={p.id}
                  onClick={() => setSearchParams({ period: p.id })}
                  className={cn(
                    "group relative rounded-xl border bg-white p-5 space-y-4 cursor-pointer transition-all duration-200 hover:shadow-md",
                    isActive
                      ? "border-emerald-200 hover:border-emerald-500 hover:ring-1 hover:ring-emerald-200"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      className={cn(
                        "text-[11px] font-medium shadow-none",
                        p.status === "active"
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : p.status === "closed"
                          ? "bg-blue-600 hover:bg-blue-600 text-white"
                          : p.status === "archived"
                          ? "bg-slate-100 text-slate-700 border border-slate-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      )}
                    >
                      {p.status === "active"
                        ? "Đang mở nộp bài"
                        : p.status === "closed"
                        ? "Đang thẩm định"
                        : p.status === "archived"
                        ? "Đã kết thúc / Khóa"
                        : "Dự thảo"}
                    </Badge>

                    <span className="text-[11px] text-slate-400 font-medium">
                      Mới tạo: {new Date(p.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-blue-700 transition-colors">
                      {p.name}
                    </h3>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    )}
                  </div>

                  {/* Date details */}
                  <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" /> Bắt đầu:
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatDateDisplay(p.start_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-amber-600" /> Hạn nộp bài:
                      </span>
                      <span className="font-semibold text-slate-900">
                        {formatDateDisplay(p.submission_deadline)}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className={cn(
                      "w-full text-xs font-semibold gap-1.5 h-9 mt-1 rounded-lg transition-all",
                      isActive
                        ? "bg-[#2d325a] hover:bg-[#232746] text-white shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                    )}
                  >
                    Chi tiết
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // VIEW 2: CRITERIA FOR SELECTED PERIOD
  // Hiển thị bộ tiêu chí của đợt đã chọn, có nút quay lại danh sách
  // và dropdown chuyển đợt tức thời!
  // ============================================================
  return (
    <div className="space-y-6 pb-24">
      {/* Top Navigation & Period Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs font-medium text-slate-600 hover:text-slate-900 gap-1.5 w-fit -ml-2"
          onClick={() => setSearchParams({})}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Danh sách các đợt đánh giá</span>
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Chuyển đợt:</span>
          <Select
            value={selectedPeriod.id}
            onValueChange={(newId) => setSearchParams({ period: newId })}
          >
            <SelectTrigger className="w-[280px] h-8 text-xs font-semibold bg-white">
              <SelectValue placeholder="Chọn đợt khác..." />
            </SelectTrigger>
            <SelectContent>
              {(allPeriods ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name} {p.status === "active" ? "• (Đang mở)" : `• (${p.status})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Page Header of Selected Period */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-blue-700 font-semibold flex-wrap">
          <Calendar className="h-4 w-4" />
          <span>{selectedPeriod.name}</span>
          <Badge
            className={cn(
              "text-[11px] ml-1",
              selectedPeriod.status === "active"
                ? "bg-emerald-600 text-white"
                : "bg-slate-200 text-slate-700"
            )}
          >
            {selectedPeriod.status === "active" ? "Đang mở nộp bài" : selectedPeriod.status}
          </Badge>
          {selectedPeriod.submission_deadline && (
            <span className="text-xs text-slate-500 font-normal">
              (Hạn nộp: {formatDateDisplay(selectedPeriod.submission_deadline)})
            </span>
          )}
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
        {criteriaLoading || subLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
            <p>Đang tải danh sách tiêu chí đánh giá...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          libraryCriteria && libraryCriteria.length > 0 ? (
            <div className="space-y-4">
              <Card className="border-blue-200 bg-blue-50/70 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-blue-900 text-sm">
                      Đang hiển thị danh mục tiêu chí tham khảo ({libraryCriteria.length} tiêu chí gốc)
                    </p>
                    <p className="text-blue-800">
                      Đợt đánh giá này chưa được phân bổ tiêu chí hoặc Quản trị viên chưa cấu hình áp dụng tiêu chí cho đợt.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="p-16 text-center text-sm text-muted-foreground bg-white rounded-lg border">
              <Layers className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Chưa có tiêu chí nào trong đợt đánh giá này.
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

      {/* Sticky Bottom Action Bar */}
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
              Nộp toàn bộ
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
