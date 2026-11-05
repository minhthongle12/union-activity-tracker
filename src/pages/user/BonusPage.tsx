import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalLoading } from "@/contexts/LoadingContext";
import { triggerPushNotification } from "@/lib/push";
import { notifyAdmins } from "@/lib/notificationService";
import { recordAuditLog } from "@/lib/auditLog";
import type { BonusRequest, BonusStatus, EvaluationPeriod } from "@/types/database";
import {
  BonusCriterion,
  getBonusCriteriaList,
  DEFAULT_BONUS_CRITERIA,
} from "@/lib/bonusCriteria";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Award,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Upload,
  Link as LinkIcon,
  Loader2,
  Trash2,
  Calendar,
  ExternalLink,
  Filter,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export interface UserBonusWithPeriod extends BonusRequest {
  organization_period?: {
    id: string;
    period?: EvaluationPeriod | null;
  };
  evidence?: { id: string; file_name: string; external_url: string }[];
}

export interface UserAssignedPeriod {
  id: string; // organization_period_id
  period_id: string;
  status: string;
  period: EvaluationPeriod;
}

async function fetchUserAssignedPeriods(orgId?: string | null): Promise<UserAssignedPeriod[]> {
  if (!orgId) return [];

  try {
    const { data: opData, error: opError } = await supabase
      .from("organization_periods")
      .select("id, period_id, status, assigned_at")
      .eq("organization_id", orgId)
      .order("assigned_at", { ascending: false });

    if (opError) {
      console.error("fetchUserAssignedPeriods opError:", opError);
      throw opError;
    }

    const { data: periodsData, error: periodsError } = await supabase
      .from("evaluation_periods")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false });

    if (periodsError) {
      console.error("fetchUserAssignedPeriods periodsError:", periodsError);
      throw periodsError;
    }

    const allPeriods = (periodsData ?? []) as EvaluationPeriod[];
    const periodMap = new Map(allPeriods.map((p) => [p.id, p]));

    const result: UserAssignedPeriod[] = [];
    const processedPeriodIds = new Set<string>();

    for (const op of opData ?? []) {
      const period = periodMap.get(op.period_id);
      if (period) {
        result.push({
          id: op.id,
          period_id: op.period_id,
          status: op.status,
          period,
        });
        processedPeriodIds.add(period.id);
      }
    }

    for (const period of allPeriods) {
      if (!processedPeriodIds.has(period.id) && period.status === "active") {
        result.push({
          id: `period_${period.id}`,
          period_id: period.id,
          status: "assigned",
          period,
        });
        processedPeriodIds.add(period.id);
      }
    }

    return result;
  } catch (err) {
    console.error("fetchUserAssignedPeriods error:", err);
    return [];
  }
}

async function fetchUserBonusRequests(orgId?: string | null): Promise<UserBonusWithPeriod[]> {
  if (!orgId) return [];
  try {
    const { data: orgPeriods } = await supabase
      .from("organization_periods")
      .select("id")
      .eq("organization_id", orgId);

    const orgPeriodIds = (orgPeriods ?? []).map((op) => op.id);
    if (orgPeriodIds.length === 0) return [];

    const { data, error } = await supabase
      .from("bonus_requests")
      .select(`
        *,
        organization_period:organization_periods(
          id,
          period:evaluation_periods(*)
        ),
        evidence:bonus_evidence_items(*)
      `)
      .in("organization_period_id", orgPeriodIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchUserBonusRequests error:", error);
      throw error;
    }

    return (data ?? []).map((b: any) => ({
      ...b,
      organization_period: b.organization_period
        ? {
            ...b.organization_period,
            period: Array.isArray(b.organization_period.period)
              ? b.organization_period.period[0]
              : b.organization_period.period,
          }
        : undefined,
    })) as UserBonusWithPeriod[];
  } catch (err) {
    console.error("fetchUserBonusRequests error:", err);
    return [];
  }
}

export default function UserBonusPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { withLoading } = useGlobalLoading();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<string>("all");

  // Fetch bonus criteria catalog
  const { data: bonusCriteriaList } = useQuery({
    queryKey: ["bonus_criteria_catalog"],
    queryFn: getBonusCriteriaList,
  });

  const criteriaList = bonusCriteriaList || DEFAULT_BONUS_CRITERIA;

  const [form, setForm] = useState({
    organization_period_id: "",
    bonus_code: "DAT_GIAI",
    title: "",
    quantity: 1,
    base_points: 1.0,
    requested_score: 1.0,
    unit: "học sinh / giải thưởng",
    description: "",
    evidenceLinks: [{ id: "1", name: "", url: "" }],
  });

  const { data: assignedPeriods } = useQuery({
    queryKey: ["user_assigned_periods", profile?.organization_id],
    queryFn: () => fetchUserAssignedPeriods(profile?.organization_id),
    enabled: !!profile?.organization_id,
  });

  const { data: bonusRequests, isLoading, refetch } = useQuery({
    queryKey: ["user_bonus_requests", profile?.organization_id],
    queryFn: () => fetchUserBonusRequests(profile?.organization_id),
    enabled: !!profile?.organization_id,
  });

  // Selected bonus criterion definition
  const selectedCriterion = useMemo(() => {
    return criteriaList.find((c) => c.code === form.bonus_code) || null;
  }, [criteriaList, form.bonus_code]);

  // Handle changing bonus code
  const handleBonusCodeChange = (code: string) => {
    const crit = criteriaList.find((c) => c.code === code);
    if (crit) {
      const qty = form.quantity || 1;
      const score = qty * crit.base_points;
      setForm((prev) => ({
        ...prev,
        bonus_code: crit.code,
        title: `[${crit.code}] ${crit.name}`,
        base_points: crit.base_points,
        unit: crit.unit,
        requested_score: score,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        bonus_code: code,
        base_points: 1.0,
      }));
    }
  };

  // Handle changing quantity
  const handleQuantityChange = (qty: number) => {
    const validQty = Math.max(1, qty);
    const score = Number((validQty * form.base_points).toFixed(2));
    setForm((prev) => ({
      ...prev,
      quantity: validQty,
      requested_score: score,
    }));
  };

  // Auto select default active period when dialog opens
  useEffect(() => {
    if (dialogOpen && !form.organization_period_id && assignedPeriods && assignedPeriods.length > 0) {
      const defaultOp =
        assignedPeriods.find((op) => op.period?.status === "active") ||
        assignedPeriods[0];
      if (defaultOp) {
        setForm((prev) => ({ ...prev, organization_period_id: defaultOp.id }));
      }
    }
  }, [dialogOpen, assignedPeriods, form.organization_period_id]);

  function handleOpenCreateDialog() {
    const defaultOp =
      assignedPeriods?.find((op) => op.period?.status === "active") ||
      assignedPeriods?.[0];

    const defaultCrit = criteriaList.find((c) => c.code === "DAT_GIAI") || criteriaList[0] || DEFAULT_BONUS_CRITERIA[1];

    setForm({
      organization_period_id: defaultOp?.id || "",
      bonus_code: defaultCrit.code,
      title: `[${defaultCrit.code}] ${defaultCrit.name}`,
      quantity: 1,
      base_points: defaultCrit.base_points,
      requested_score: defaultCrit.base_points,
      unit: defaultCrit.unit,
      description: "",
      evidenceLinks: [{ id: "1", name: "", url: "" }],
    });
    setDialogOpen(true);
  }

  const createBonusMutation = useMutation({
    mutationFn: async (status: BonusStatus) => {
      if (!form.organization_period_id) {
        throw new Error("Vui lòng chọn đợt đánh giá áp dụng đề xuất điểm cộng.");
      }
      if (!form.title.trim()) {
        throw new Error("Vui lòng nhập tên nội dung điểm thưởng.");
      }

      let targetOpId = form.organization_period_id;

      if (targetOpId.startsWith("period_")) {
        const periodId = targetOpId.replace("period_", "");
        if (profile?.organization_id) {
          const { data: existingOp } = await supabase
            .from("organization_periods")
            .select("id")
            .eq("period_id", periodId)
            .eq("organization_id", profile.organization_id)
            .maybeSingle();

          if (existingOp) {
            targetOpId = existingOp.id;
          } else {
            const { data: newOp, error: createOpError } = await supabase
              .from("organization_periods")
              .insert({
                period_id: periodId,
                organization_id: profile.organization_id,
                status: "assigned",
              })
              .select("id")
              .single();

            if (createOpError) throw createOpError;
            targetOpId = newOp.id;
          }
        }
      }

      // Format description with structured details
      const fullDescription = [
        `Mã tiêu chí thưởng: [${form.bonus_code}]`,
        `Số lượng áp dụng: ${form.quantity} ${form.unit}`,
        `Điểm cơ sở: ${form.base_points}đ/${form.unit}`,
        `Tổng điểm đề xuất: ${form.requested_score}đ`,
        form.description ? `\nChi tiết thành tích / mô hình:\n${form.description}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // 1. Insert bonus request
      const { data: bonusData, error: bonusError } = await supabase
        .from("bonus_requests")
        .insert({
          organization_period_id: targetOpId,
          title: form.title.trim(),
          description: fullDescription,
          requested_score: form.requested_score,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (bonusError) throw bonusError;

      // 2. Insert all provided evidence links
      const validLinks = (form.evidenceLinks || []).filter((l) => l.url.trim());
      if (validLinks.length > 0 && bonusData) {
        const evPayload = validLinks.map((l) => ({
          bonus_request_id: bonusData.id,
          file_name: l.name.trim() || form.title.trim() || "Minh chứng đính kèm",
          external_url: l.url.trim(),
          uploaded_by: profile?.id || null,
        }));
        const { error: evError } = await supabase.from("bonus_evidence_items").insert(evPayload);
        if (evError) console.error("Error inserting bonus evidence:", evError);
      }

      // 3. Notify admins and record audit log with device info if submitted
      if (status === "submitted") {
        await notifyAdmins({
          title: "Đề xuất điểm thưởng mới",
          message: `Liên đội ${profile?.display_name || "đơn vị"} vừa gửi đề xuất điểm thưởng: "${form.title}" (+${form.requested_score} điểm) kèm ${validLinks.length} minh chứng.`,
          type: "bonus_submitted",
          relatedId: bonusData?.id,
          url: "/admin/bonus",
        });

        await recordAuditLog({
          actorId: profile?.id,
          action: "SUBMIT_BONUS",
          entityType: "bonus_requests",
          entityId: bonusData?.id,
          summary: `${profile?.display_name || "Liên đội"} nộp đề xuất điểm thưởng: "${form.title}" (+${form.requested_score}đ)`,
          details: {
            title: form.title,
            requested_score: form.requested_score,
            bonus_code: form.bonus_code,
            quantity: form.quantity,
            unit: form.unit,
            evidenceLinks: validLinks.map((l) => l.url),
          },
        });
      } else {
        await recordAuditLog({
          actorId: profile?.id,
          action: "DRAFT_BONUS",
          entityType: "bonus_requests",
          entityId: bonusData?.id,
          summary: `${profile?.display_name || "Liên đội"} lưu nháp đề xuất điểm thưởng: "${form.title}"`,
          details: {
            title: form.title,
            requested_score: form.requested_score,
          },
        });
      }

      return bonusData;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["user_bonus_requests"] });
      queryClient.invalidateQueries({ queryKey: ["user_results_bonus"] });
      toast.success(
        status === "submitted"
          ? "Đã gửi đề xuất điểm thưởng lên Hội đồng Đội!"
          : "Đã lưu bản nháp đề xuất điểm thưởng!"
      );
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Lỗi khi lưu đề xuất điểm thưởng.");
    },
  });

  const handleSubmit = (status: BonusStatus) => {
    withLoading(async () => {
      await createBonusMutation.mutateAsync(status);
    });
  };

  const filteredRequests = useMemo(() => {
    if (!bonusRequests) return [];
    if (filterPeriod === "all") return bonusRequests;
    return bonusRequests.filter(
      (b) => b.organization_period?.period?.id === filterPeriod
    );
  }, [bonusRequests, filterPeriod]);

  const totalApprovedScore = useMemo(() => {
    return (filteredRequests ?? [])
      .filter((b) => b.status === "approved")
      .reduce((acc, b) => acc + (b.approved_score || 0), 0);
  }, [filteredRequests]);

  const totalPendingScore = useMemo(() => {
    return (filteredRequests ?? [])
      .filter((b) => b.status === "submitted")
      .reduce((acc, b) => acc + (b.requested_score || 0), 0);
  }, [filteredRequests]);

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-emerald-100">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            Đề xuất Điểm thưởng Thi đua
          </h1>
          <p className="text-sm text-slate-700 mt-1 flex items-center gap-2">
            <Award className="h-4 w-4 text-emerald-700" />
            Đăng ký cộng điểm các thành tích, mô hình sáng tạo và giải thưởng phong trào Đội
          </p>
        </div>

        <Button
          onClick={handleOpenCreateDialog}
          className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold shrink-0 shadow-md shadow-emerald-900/20 rounded-xl"
        >
          <Plus className="h-4 w-4" />
          Tạo đề xuất điểm thưởng
        </Button>
      </div>

      {/* Summary Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-lime-50/50 shadow-2xs rounded-2xl">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-950">
                  +{totalApprovedScore.toFixed(2)}đ
                </p>
                <p className="text-xs text-slate-700 font-bold">Điểm thưởng đã duyệt</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/50 shadow-2xs rounded-2xl">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-950">
                  +{totalPendingScore.toFixed(2)}đ
                </p>
                <p className="text-xs text-slate-700 font-bold">Điểm đang chờ duyệt</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-950">
                  {filteredRequests.length}
                </p>
                <p className="text-xs text-slate-700 font-bold">Tổng số hồ sơ đề xuất</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter by Period */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white p-3 rounded-2xl border border-emerald-100 shadow-2xs">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-emerald-700" />
          <span className="text-xs font-bold text-slate-950">Lọc theo đợt:</span>
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-[200px] sm:w-[240px] text-xs h-9 bg-emerald-50/40 border-emerald-200 rounded-xl font-bold text-slate-950">
              <SelectValue placeholder="Tất cả đợt đánh giá" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="text-xs font-medium">Tất cả đợt đánh giá</SelectItem>
              {(assignedPeriods ?? []).map((op) => (
                <SelectItem key={op.period.id} value={op.period.id} className="text-xs">
                  {op.period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bonus Requests List */}
      <Card className="border-emerald-200 shadow-2xs rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-emerald-50 bg-white">
          <CardTitle className="text-base font-bold text-slate-950 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-700" />
            Danh sách hồ sơ đề xuất điểm thưởng
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-600 space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-700" />
              <p>Đang tải danh sách điểm thưởng...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-600">
              Chưa có hồ sơ đề xuất điểm thưởng nào trong đợt này.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRequests.map((b) => (
                <div key={b.id} className="p-4 sm:p-5 hover:bg-emerald-50/30 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-950">{b.title}</h3>
                        {b.status === "approved" ? (
                          <Badge className="bg-emerald-700 text-white font-bold text-[10px]">
                            Đã duyệt (+{b.approved_score}đ)
                          </Badge>
                        ) : b.status === "submitted" ? (
                          <Badge className="bg-amber-700 text-white font-bold text-[10px]">
                            Chờ thẩm định (+{b.requested_score}đ)
                          </Badge>
                        ) : b.status === "revision_requested" ? (
                          <Badge className="bg-orange-700 text-white font-bold text-[10px]">
                            Cần bổ sung minh chứng
                          </Badge>
                        ) : b.status === "rejected" ? (
                          <Badge className="bg-red-700 text-white font-bold text-[10px]">
                            Không chấp thuận
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-700 border-slate-300 text-[10px] font-semibold">
                            Bản nháp
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 flex items-center gap-2">
                        <span>Đợt: <b>{b.organization_period?.period?.name || "Chưa rõ"}</b></span>
                        <span>•</span>
                        <span>Ngày gửi: {b.submitted_at ? new Date(b.submitted_at).toLocaleDateString("vi-VN") : "Bản nháp"}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-600 font-semibold block">Điểm đề xuất:</span>
                      <span className="text-lg font-black text-slate-950">+{b.requested_score}đ</span>
                    </div>
                  </div>

                  {b.description && (
                    <div className="bg-slate-50 p-3 rounded-xl text-xs text-slate-800 whitespace-pre-line border border-slate-200">
                      {b.description}
                    </div>
                  )}

                  {b.evidence && b.evidence.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className="text-xs font-semibold text-slate-700">Minh chứng:</span>
                      {b.evidence.map((ev) => (
                        <a
                          key={ev.id}
                          href={ev.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-800 hover:text-emerald-950 hover:underline flex items-center gap-1 bg-emerald-100/70 px-2.5 py-1 rounded-lg border border-emerald-300 max-w-full truncate"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{ev.file_name || "Xem liên kết bài viết"}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Create Bonus Proposal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-[90vw] max-w-xl max-h-[92dvh] flex flex-col p-3.5 sm:p-6 overflow-hidden rounded-2xl border-emerald-200">
          <DialogHeader className="shrink-0 pb-1 text-left">
            <DialogTitle className="text-base sm:text-xl font-extrabold text-slate-950 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-700 shrink-0" />
              <span>Đề xuất Điểm thưởng Thi đua</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 font-medium">
              Chọn tiêu chí điểm thưởng, nhập số lượng em học sinh hoặc mô hình đạt giải để hệ thống tự động tính điểm đề xuất.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 -mr-1 text-slate-900">
            {/* 1. Chọn đợt đánh giá */}
            <div>
              <Label className="text-xs font-bold text-slate-950">
                Thuộc đợt đánh giá <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.organization_period_id}
                onValueChange={(val) => setForm({ ...form, organization_period_id: val })}
              >
                <SelectTrigger className="mt-1 w-full text-xs font-bold text-slate-950 min-h-[44px] h-auto py-2.5 px-3 border-emerald-200 rounded-xl [&>span]:w-full [&>span]:min-w-0 [&>span]:text-left [&>span]:block">
                  <SelectValue placeholder="-- Chọn đợt đánh giá --" />
                </SelectTrigger>
                <SelectContent className="w-[calc(100vw-2.5rem)] sm:w-[var(--radix-select-trigger-width)] max-w-lg rounded-xl" position="popper" sideOffset={4}>
                  {(assignedPeriods ?? []).map((op) => (
                    <SelectItem key={op.id} value={op.id} className="py-2.5 pl-8 pr-2">
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 text-left min-w-0">
                        <span className="font-bold text-slate-950 whitespace-normal break-words leading-snug">{op.period.name}</span>
                        <span className="text-[11px] text-slate-600 shrink-0 font-medium">
                          ({op.period.status === "active" ? "Đang mở" : op.period.status})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Chọn Mã tiêu chí thưởng do Admin thiết lập */}
            <div>
              <Label className="text-xs font-bold text-slate-950">
                Tiêu chí điểm thưởng quy định <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.bonus_code}
                onValueChange={handleBonusCodeChange}
              >
                <SelectTrigger className="mt-1 w-full text-xs font-bold text-slate-950 min-h-[48px] h-auto py-2.5 px-3 border-emerald-300 bg-emerald-50/40 rounded-xl text-left [&>span]:w-full [&>span]:min-w-0 [&>span]:text-left [&>span]:block [&>span]:whitespace-normal [&>span]:line-clamp-none">
                  <SelectValue placeholder="-- Chọn tiêu chí điểm thưởng --" />
                </SelectTrigger>
                <SelectContent className="w-[calc(100vw-2.5rem)] sm:w-[var(--radix-select-trigger-width)] max-w-lg rounded-xl max-h-[60vh] overflow-y-auto" position="popper" sideOffset={4}>
                  {criteriaList.map((crit) => (
                    <SelectItem key={crit.code} value={crit.code} className="py-2.5 pl-8 pr-2">
                      <div className="flex flex-col text-left min-w-0 w-full">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className="font-mono text-[10px] font-black bg-emerald-100 text-emerald-950 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                            {crit.code}
                          </span>
                          <span className="font-bold text-slate-950 text-xs whitespace-normal break-words leading-snug min-w-0 flex-1">
                            {crit.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-800 font-semibold mt-1 pl-0.5">
                          {crit.base_points} điểm / {crit.unit}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="KHAC" className="py-2.5 pl-8 pr-2">
                    <div className="flex flex-col text-left min-w-0 w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[10px] font-black bg-slate-200 text-slate-900 px-1.5 py-0.5 rounded shrink-0">
                          KHAC
                        </span>
                        <span className="font-bold text-slate-950 text-xs whitespace-normal break-words">
                          Điểm thưởng thi đua khác
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600 font-medium mt-0.5 pl-0.5">
                        Tiêu chí phát sinh đặc thù ngoài 5 nhóm trên
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Evidence Guidelines Box for chosen criteria */}
            {selectedCriterion?.evidence_guidelines && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 overflow-hidden break-words">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <Info className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span className="break-words">Hướng dẫn & Yêu cầu minh chứng quy định:</span>
                </div>
                <p className="text-[11px] text-slate-800 whitespace-pre-line font-medium pl-5 leading-relaxed break-words">
                  {selectedCriterion.evidence_guidelines}
                </p>
              </div>
            )}

            {/* 3. Số lượng áp dụng & Tính toán điểm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <Label className="text-xs font-bold text-slate-950 block">
                  Số lượng ({form.unit}) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={form.quantity}
                  onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                  className="mt-1 font-black text-slate-950 text-sm h-10 bg-white"
                />
                <p className="text-[10px] text-slate-600 mt-1">
                  Ví dụ: có 4 em học sinh đạt giải, nhập 4.
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-950 block">
                  Tổng điểm đề xuất (tự động tính)
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={form.requested_score}
                    onChange={(e) => setForm({ ...form, requested_score: parseFloat(e.target.value) || 0 })}
                    className="font-black text-emerald-800 text-sm h-10 bg-white border-emerald-300"
                  />
                  <span className="text-xs font-black text-slate-950 shrink-0">điểm</span>
                </div>
                <p className="text-[10px] text-emerald-800 font-bold mt-1">
                  = {form.quantity} x {form.base_points}đ/{form.unit}
                </p>
              </div>
            </div>

            {/* 4. Tiêu đề đề xuất */}
            <div>
              <Label className="text-xs font-bold text-slate-950">
                Tiêu đề hồ sơ đề xuất <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 text-xs font-bold text-slate-950 h-10 border-slate-300"
              />
            </div>

            {/* 5. Danh sách chi tiết học sinh / mô hình / thành tích */}
            <div>
              <Label className="text-xs font-bold text-slate-950">
                Chi tiết danh sách học sinh / mô hình / thành tích đạt được <span className="text-red-500">*</span>
              </Label>
              <Textarea
                placeholder={`Nhập chi tiết từng trường hợp, ví dụ:\n- Nguyễn Hà Minh Anh - Giải Nhì Cuộc thi Sáng tạo thanh thiếu niên nhi đồng cấp tỉnh\n- Phùng Công Minh Triết - Giải Nhất Hội thi Tin học trẻ cấp tỉnh\n- Đồng diễn sân trường cùng KUN - Giải Phong cách`}
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 text-xs text-slate-950 font-medium w-full resize-none border-slate-300"
              />
            </div>

            {/* 6. Minh chứng bài viết / link (hỗ trợ nhiều link) */}
            <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-950 block">
                  Liên kết bài viết minh chứng (Facebook, Drive, Báo chí...)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      evidenceLinks: [
                        ...prev.evidenceLinks,
                        { id: Date.now().toString(), name: "", url: "" },
                      ],
                    }))
                  }
                  className="h-7 text-[11px] px-2 gap-1 border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50"
                >
                  <Plus className="h-3 w-3" />
                  Thêm link khác
                </Button>
              </div>

              <div className="space-y-2.5">
                {form.evidenceLinks.map((link, idx) => (
                  <div
                    key={link.id}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1.5 relative shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-slate-600 text-[11px] font-semibold">
                      <span>Liên kết minh chứng #{idx + 1}</span>
                      {form.evidenceLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              evidenceLinks: prev.evidenceLinks.filter((l) => l.id !== link.id),
                            }))
                          }
                          className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                          title="Xóa link này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Input
                      placeholder="Tiêu đề bài viết minh chứng (ví dụ: Tin bài trao giải trên Fanpage)"
                      value={link.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          evidenceLinks: prev.evidenceLinks.map((l) =>
                            l.id === link.id ? { ...l, name: val } : l
                          ),
                        }));
                      }}
                      className="text-xs bg-white h-8 border-slate-300"
                    />
                    <Input
                      placeholder="https://www.facebook.com/share/p/... hoặc https://drive.google.com/..."
                      value={link.url}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          evidenceLinks: prev.evidenceLinks.map((l) =>
                            l.id === link.id ? { ...l, url: val } : l
                          ),
                        }));
                      }}
                      className="text-xs bg-white h-8 font-mono border-slate-300"
                    />
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-600 font-medium">
                * Lưu ý: Hình ảnh bài viết minh chứng phải có Logo Hội đồng Đội theo đúng quy định.
              </p>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto text-xs font-bold text-slate-700 h-9 rounded-xl"
            >
              Hủy
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSubmit("draft")}
              disabled={createBonusMutation.isPending}
              className="w-full sm:w-auto text-xs font-bold h-9 rounded-xl"
            >
              Lưu bản nháp
            </Button>
            <Button
              onClick={() => handleSubmit("submitted")}
              disabled={createBonusMutation.isPending}
              className="w-full sm:w-auto text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white h-9 rounded-xl"
            >
              {createBonusMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Đang gửi...
                </>
              ) : (
                "Gửi đề xuất điểm thưởng"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
