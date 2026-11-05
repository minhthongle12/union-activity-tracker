import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalLoading } from "@/contexts/LoadingContext";
import { triggerPushNotification } from "@/lib/push";
import type { BonusRequest, BonusStatus, EvaluationPeriod } from "@/types/database";
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
    // 1. Fetch organization_periods for this organization (ordered by assigned_at, NOT created_at)
    const { data: opData, error: opError } = await supabase
      .from("organization_periods")
      .select("id, period_id, status, assigned_at")
      .eq("organization_id", orgId)
      .order("assigned_at", { ascending: false });

    if (opError) {
      console.error("fetchUserAssignedPeriods opError:", opError);
      throw opError;
    }

    // 2. Fetch all non-draft evaluation periods
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

    // Priority 1: Periods explicitly assigned to this organization
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

    // Priority 2: Any open/active evaluation periods not yet assigned (provisionable on the fly)
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
    // Get all bonus requests for this org
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

  const [form, setForm] = useState({
    organization_period_id: "",
    title: "",
    description: "",
    requested_score: 1.0,
    evidenceName: "",
    evidenceUrl: "",
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

  // Auto select default active period when dialog opens or assignedPeriods finish loading
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

    setForm({
      organization_period_id: defaultOp?.id || "",
      title: "",
      description: "",
      requested_score: 1.0,
      evidenceName: "",
      evidenceUrl: "",
    });
    setDialogOpen(true);
  }

  const createBonusMutation = useMutation({
    mutationFn: async (status: BonusStatus) => {
      if (!form.organization_period_id) {
        throw new Error("Vui lòng chọn đợt đánh giá áp dụng đề xuất điểm cộng.");
      }
      if (!form.title.trim()) {
        throw new Error("Vui lòng nhập tên hoạt động / công trình thanh niên.");
      }

      let targetOpId = form.organization_period_id;

      // Handle resolving or auto-creating organization_period if needed
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
            const { data: newOp, error: createOpErr } = await supabase
              .from("organization_periods")
              .insert({
                period_id: periodId,
                organization_id: profile.organization_id,
                status: "in_progress",
              })
              .select("id")
              .single();

            if (createOpErr) throw createOpErr;
            targetOpId = newOp.id;
          }
        }
      }

      const { data: newReq, error: reqError } = await supabase
        .from("bonus_requests")
        .insert({
          organization_period_id: targetOpId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          requested_score: Number(form.requested_score) || 0,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (reqError) throw reqError;

      // Add link evidence if provided
      if (form.evidenceUrl.trim() && newReq) {
        await supabase.from("bonus_evidence_items").insert({
          bonus_request_id: newReq.id,
          file_name: form.evidenceName.trim() || form.evidenceUrl.trim(),
          external_url: form.evidenceUrl.trim(),
          uploaded_by: profile?.id || null,
        });
      }

      // Notify Admins
      if (status === "submitted") {
        const { data: adminUsers } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "admin");

        if (adminUsers && adminUsers.length > 0) {
          const adminIds = adminUsers.map((a) => a.id);
          await supabase.from("notifications").insert(
            adminUsers.map((a) => ({
              recipient_id: a.id,
              title: "Đề xuất điểm cộng mới",
              message: `${profile?.display_name || "Đơn vị"} vừa gửi đề xuất điểm cộng: "${form.title.trim()}". Yêu cầu: +${form.requested_score}đ.`,
              type: "bonus_submitted",
              link_url: "/admin/bonus",
            }))
          );

          // Web Push Notification to Admins
          await triggerPushNotification({
            userIds: adminIds,
            title: "Đề xuất điểm cộng mới",
            body: `${profile?.display_name || "Đơn vị"} vừa gửi đề xuất điểm cộng: "${form.title.trim()}". Yêu cầu: +${form.requested_score}đ.`,
            url: "/admin/bonus",
            tag: "bonus-proposal-submitted",
          });
        }
      }
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["user_bonus_requests"] });
      toast.success(status === "submitted" ? "Đã nộp đề xuất điểm cộng thành công!" : "Đã lưu bản nháp.");
      setDialogOpen(false);
      setForm({
        organization_period_id: "",
        title: "",
        description: "",
        requested_score: 1.0,
        evidenceName: "",
        evidenceUrl: "",
      });
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  const getStatusBadge = (status: BonusStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-50 text-slate-600">Bản nháp</Badge>;
      case "submitted":
        return <Badge className="bg-emerald-600 text-white gap-1"><Clock className="h-3 w-3" /> Đã gửi chờ duyệt</Badge>;
      case "approved":
        return <Badge className="bg-teal-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Đã cộng điểm</Badge>;
      case "rejected":
        return <Badge className="bg-red-600 text-white gap-1"><XCircle className="h-3 w-3" /> Không duyệt</Badge>;
      case "revision_requested":
        return <Badge className="bg-amber-600 text-white gap-1"><AlertCircle className="h-3 w-3" /> Cần bổ sung</Badge>;
    }
  };

  const filteredBonusRequests = useMemo(() => {
    if (!bonusRequests) return [];
    return bonusRequests.filter((item) => {
      if (filterPeriod !== "all" && item.organization_period?.period?.id !== filterPeriod) {
        return false;
      }
      return true;
    });
  }, [bonusRequests, filterPeriod]);

  const totalApprovedScore = (filteredBonusRequests ?? [])
    .filter((b) => b.status === "approved")
    .reduce((acc, curr) => acc + (curr.approved_score || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý điểm cộng</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Đề xuất điểm thưởng cho các thành tích nổi bật, công trình, phần việc sáng tạo của đơn vị
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog} className="gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-700/20">
          <Plus className="h-4 w-4" />
          Đề xuất điểm cộng
        </Button>
      </div>

      {/* Overview Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200/80 rounded-2xl">
          <CardContent className="pt-6">
            <span className="text-xs text-muted-foreground block">Tổng yêu cầu đã đề xuất</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">
              {filteredBonusRequests?.length || 0}
            </span>
          </CardContent>
        </Card>

        <Card className="border-emerald-200/80 bg-emerald-50/50 rounded-2xl">
          <CardContent className="pt-6">
            <span className="text-xs text-emerald-800 block font-semibold">Điểm cộng đã được phê duyệt</span>
            <span className="text-2xl font-bold text-emerald-700 mt-1 block">
              +{totalApprovedScore} điểm
            </span>
          </CardContent>
        </Card>

        <Card className="border-lime-200/80 bg-lime-50/40 rounded-2xl">
          <CardContent className="pt-6">
            <span className="text-xs text-lime-900 block font-semibold">Đang chờ xét duyệt</span>
            <span className="text-2xl font-bold text-emerald-700 mt-1 block">
              {(filteredBonusRequests ?? []).filter((b) => b.status === "submitted").length}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <Card className="border-slate-200/80 shadow-2xs rounded-2xl">
        <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-emerald-600" />
            Danh sách đề xuất điểm cộng
          </CardTitle>
          <div className="w-full sm:w-auto flex items-center gap-2">
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-full sm:w-[220px] text-xs h-9">
                <SelectValue placeholder="Lọc theo đợt đánh giá" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả đợt đánh giá</SelectItem>
                {(assignedPeriods ?? []).map((op) => (
                  <SelectItem key={op.period.id} value={op.period.id}>
                    {op.period.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tải dữ liệu điểm cộng...</p>
            </div>
          ) : (filteredBonusRequests ?? []).length === 0 ? (
            <div className="p-12 sm:p-16 text-center text-sm text-muted-foreground">
              <Award className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              {filterPeriod !== "all"
                ? "Chưa có đề xuất điểm cộng nào trong đợt đánh giá này."
                : "Chưa có đề xuất điểm cộng nào. Nhấn \"Đề xuất điểm cộng\" để tạo mới."}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredBonusRequests?.map((item) => (
                <div key={item.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                  <div className="space-y-1.5 max-w-2xl min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-900 text-sm sm:text-base break-words">{item.title}</h4>
                      {getStatusBadge(item.status)}
                      {item.organization_period?.period?.name && (
                        <Badge variant="outline" className="text-xs gap-1 bg-emerald-50 text-emerald-800 border-emerald-200 max-w-full truncate">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.organization_period.period.name}</span>
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
                      <span>Điểm đề xuất: <b className="text-slate-800">{item.requested_score}đ</b></span>
                      {item.approved_score !== null && (
                        <span>Điểm duyệt: <b className="text-emerald-700 font-bold">+{item.approved_score}đ</b></span>
                      )}
                      <span>Ngày gửi: {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("vi-VN") : "Bản nháp"}</span>
                    </div>

                    {/* Evidence links */}
                    {item.evidence && item.evidence.length > 0 && (
                      <div className="flex items-center gap-1.5 sm:gap-2 pt-1 flex-wrap">
                        <span className="text-xs text-slate-500">Minh chứng:</span>
                        {item.evidence.map((ev) => (
                          <a
                            key={ev.id}
                            href={ev.external_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 bg-emerald-50/50 px-2 py-0.5 rounded-lg border border-emerald-200/80 max-w-full truncate"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{ev.file_name || "Xem liên kết"}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Create Bonus Proposal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[94vw] max-w-lg max-h-[92dvh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-xl">
          <DialogHeader className="shrink-0 pb-1 text-left">
            <DialogTitle className="text-lg sm:text-xl font-bold text-slate-900">
              Đề xuất điểm cộng thi đua
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500">
              Chọn đợt đánh giá, nhập nội dung hoạt động tiêu biểu và nộp kèm minh chứng để Hội đồng xem xét duyệt điểm cộng.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3.5 py-2 pr-1 -mr-1">
            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Thuộc đợt đánh giá <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.organization_period_id}
                onValueChange={(val) => setForm({ ...form, organization_period_id: val })}
              >
                <SelectTrigger className="mt-1 w-full text-xs sm:text-sm h-9 sm:h-10">
                  <SelectValue placeholder="-- Chọn đợt đánh giá --" />
                </SelectTrigger>
                <SelectContent className="max-w-[90vw]">
                  {(assignedPeriods ?? []).map((op) => (
                    <SelectItem key={op.id} value={op.id} className="py-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-left">
                        <span className="font-medium text-slate-900 line-clamp-1">{op.period.name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          ({op.period.status === "active" ? "Đang mở" : op.period.status})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!assignedPeriods || assignedPeriods.length === 0) && (
                <p className="text-xs text-amber-600 mt-1">
                  Đơn vị chưa được phân công đợt đánh giá nào. Vui lòng liên hệ Admin.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Tên hoạt động / Công trình thanh niên <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="VD: Mô hình sáng kiến số hóa di tích lịch sử địa phương"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 text-xs sm:text-sm h-9 sm:h-10 w-full"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">Mô tả chi tiết kết quả hoạt động</Label>
              <Textarea
                placeholder="Mô tả quy mô, kết quả, ý nghĩa xã hội và sự lan tỏa của hoạt động..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 text-xs sm:text-sm w-full resize-none"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">Điểm đề xuất (tối đa 2.0đ/hoạt động)</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="5.0"
                value={form.requested_score}
                onChange={(e) => setForm({ ...form, requested_score: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-full sm:w-36 font-bold text-blue-700 text-xs sm:text-sm h-9 sm:h-10"
              />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
              <Label className="text-xs font-semibold text-slate-800 block">
                Liên kết minh chứng (Báo chí, Fanpage, Drive...)
              </Label>
              <Input
                placeholder="Tiêu đề bài viết minh chứng"
                value={form.evidenceName}
                onChange={(e) => setForm({ ...form, evidenceName: e.target.value })}
                className="text-xs sm:text-sm bg-white h-9"
              />
              <Input
                placeholder="https://..."
                value={form.evidenceUrl}
                onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })}
                className="text-xs sm:text-sm bg-white h-9"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10"
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!form.organization_period_id) {
                  toast.error("Vui lòng chọn đợt đánh giá áp dụng đề xuất điểm cộng.");
                  return;
                }
                if (!form.title.trim()) {
                  toast.error("Vui lòng nhập tên hoạt động.");
                  return;
                }
                createBonusMutation.mutate("draft");
              }}
              disabled={createBonusMutation.isPending}
              className="w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10"
            >
              Lưu nháp
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10 font-semibold rounded-xl shadow-md shadow-emerald-700/20"
              onClick={() => {
                if (!form.organization_period_id) {
                  toast.error("Vui lòng chọn đợt đánh giá áp dụng đề xuất điểm cộng.");
                  return;
                }
                if (!form.title.trim()) {
                  toast.error("Vui lòng nhập tên hoạt động.");
                  return;
                }
                createBonusMutation.mutate("submitted");
              }}
              disabled={createBonusMutation.isPending}
            >
              {createBonusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gửi đề xuất
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
