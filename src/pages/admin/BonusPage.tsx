import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { triggerPushNotification } from "@/lib/push";
import type { BonusRequest, BonusStatus, Organization, EvaluationPeriod } from "@/types/database";
import {
  BonusCriterion,
  getBonusCriteriaList,
  saveBonusCriteriaList,
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
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
  Building,
  Calendar,
  Settings,
  Plus,
  Save,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface BonusWithOrg extends BonusRequest {
  organization?: Organization;
  period?: EvaluationPeriod;
  evidence?: { id: string; file_name: string; external_url: string }[];
}

async function fetchPeriods(): Promise<EvaluationPeriod[]> {
  const { data } = await supabase
    .from("evaluation_periods")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as EvaluationPeriod[];
}

async function fetchAdminBonusRequests(): Promise<BonusWithOrg[]> {
  const { data: bonusData, error } = await supabase
    .from("bonus_requests")
    .select(`
      *,
      organization_period:organization_periods(
        organization:organizations(*),
        period:evaluation_periods(*)
      ),
      evidence:bonus_evidence_items(*)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (bonusData ?? []).map((b: any) => ({
    ...b,
    organization: Array.isArray(b.organization_period?.organization)
      ? b.organization_period?.organization[0]
      : b.organization_period?.organization,
    period: Array.isArray(b.organization_period?.period)
      ? b.organization_period?.period[0]
      : b.organization_period?.period,
    evidence: b.evidence ?? [],
  }));
}

export default function AdminBonusPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [selectedReq, setSelectedReq] = useState<BonusWithOrg | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "revision">("approve");
  const [approvedScore, setApprovedScore] = useState<number>(1.0);
  const [actionComment, setActionComment] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Catalog Settings Dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState<BonusCriterion[]>([]);

  // 1. Fetch criteria catalog
  const { data: criteriaCatalog, refetch: refetchCatalog } = useQuery({
    queryKey: ["admin_bonus_criteria_catalog"],
    queryFn: getBonusCriteriaList,
  });

  const { data: periods } = useQuery({
    queryKey: ["admin_bonus_periods"],
    queryFn: fetchPeriods,
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin_bonus_requests"],
    queryFn: fetchAdminBonusRequests,
  });

  // Open catalog settings dialog
  const handleOpenSettings = () => {
    setEditingCriteria(JSON.parse(JSON.stringify(criteriaCatalog || DEFAULT_BONUS_CRITERIA)));
    setSettingsOpen(true);
  };

  // Save catalog changes
  const saveCatalogMutation = useMutation({
    mutationFn: async () => {
      await saveBonusCriteriaList(editingCriteria);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_bonus_criteria_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["bonus_criteria_catalog"] });
      toast.success("Đã lưu danh mục tiêu chí điểm thưởng thành công!");
      setSettingsOpen(false);
    },
    onError: (err: any) => toast.error("Lỗi khi lưu danh mục: " + err.message),
  });

  // Reset catalog to defaults
  const handleResetCatalog = () => {
    setEditingCriteria(JSON.parse(JSON.stringify(DEFAULT_BONUS_CRITERIA)));
    toast.info("Đã khôi phục 5 tiêu chí điểm thưởng chuẩn. Hãy nhấn 'Lưu thay đổi' để áp dụng.");
  };

  // Add new criterion in dialog
  const handleAddCriterion = () => {
    const newCode = `THUONG_${editingCriteria.length + 1}`;
    setEditingCriteria([
      ...editingCriteria,
      {
        id: `bonus_${Date.now()}`,
        code: newCode,
        name: "Tiêu chí điểm thưởng mới",
        base_points: 1.0,
        unit: "lần",
        max_points: 5.0,
        evidence_guidelines: "- Báo cáo kết quả hoặc quyết định khen thưởng.",
        sort_order: editingCriteria.length + 1,
        is_active: true,
      },
    ]);
  };

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReq) return;

      let status: BonusStatus = "approved";
      let finalScore = approvedScore;

      if (actionType === "reject") {
        status = "rejected";
        finalScore = 0;
      } else if (actionType === "revision") {
        status = "revision_requested";
      }

      // Update bonus_request
      const { error: reqError } = await supabase
        .from("bonus_requests")
        .update({
          status,
          approved_score: actionType === "approve" ? finalScore : null,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedReq.id);

      if (reqError) throw reqError;

      // Log review action
      await supabase.from("bonus_review_actions").insert({
        bonus_request_id: selectedReq.id,
        admin_id: profile?.id || "00000000-0000-0000-0000-000000000000",
        action: actionType,
        requested_score_snapshot: selectedReq.requested_score,
        approved_score: actionType === "approve" ? finalScore : 0,
        comment: actionComment || null,
      });

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: profile?.id || null,
        action: `BONUS_${actionType.toUpperCase()}`,
        entity_type: "bonus_request",
        entity_id: selectedReq.id,
        new_values: { status, approved_score: finalScore, comment: actionComment },
      });

      // Send in-app notification to organization users
      if (selectedReq.organization_period_id) {
        const { data: op } = await supabase
          .from("organization_periods")
          .select("organization_id")
          .eq("id", selectedReq.organization_period_id)
          .maybeSingle();

        if (op?.organization_id) {
          const { data: orgUsers } = await supabase
            .from("profiles")
            .select("id")
            .eq("organization_id", op.organization_id);

          if (orgUsers && orgUsers.length > 0) {
            let notifTitle = `Điểm thưởng đã được duyệt (+${finalScore}đ)`;
            let notifType = "bonus_approved";
            if (actionType === "reject") {
              notifTitle = `Hồ sơ điểm thưởng không được duyệt`;
              notifType = "bonus_rejected";
            } else if (actionType === "revision") {
              notifTitle = `Yêu cầu bổ sung minh chứng điểm thưởng`;
              notifType = "bonus_revision";
            }

            await supabase.from("notifications").insert(
              orgUsers.map((u) => ({
                recipient_id: u.id,
                title: notifTitle,
                message: `Hồ sơ "${selectedReq.title}": ${actionComment || (actionType === "approve" ? "Đã được Hội đồng Đội thẩm định phê duyệt" : "Xem chi tiết trong mục Điểm thưởng")}`,
                type: notifType,
                link_url: "/user/bonus",
              }))
            );

            triggerPushNotification({
              recipientUserIds: orgUsers.map((u) => u.id),
              title: notifTitle,
              message: `Hồ sơ "${selectedReq.title}": ${actionComment || (actionType === "approve" ? "Đã được phê duyệt" : "Xem chi tiết")}`,
              url: "/user/bonus",
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_bonus_requests"] });
      toast.success("Đã hoàn tất xử lý yêu cầu điểm thưởng!");
      setDialogOpen(false);
      setSelectedReq(null);
      setActionComment("");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  function openActionModal(req: BonusWithOrg, type: "approve" | "reject" | "revision") {
    setSelectedReq(req);
    setActionType(type);
    setApprovedScore(req.requested_score || 1.0);
    setActionComment("");
    setDialogOpen(true);
  }

  const filtered = (requests ?? []).filter((r) => {
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchPeriod = filterPeriod === "all" || r.period?.id === filterPeriod;
    return matchStatus && matchPeriod;
  });

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-emerald-100">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            Quản lý Điểm thưởng Thi đua
          </h1>
          <p className="text-sm text-slate-700 mt-1">
            Thẩm định, phê duyệt và cấu hình các yêu cầu cộng điểm thi đua từ các Liên đội
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleOpenSettings}
            className="gap-2 border-emerald-300 bg-white hover:bg-emerald-50 text-slate-950 font-bold rounded-xl h-9"
          >
            <Settings className="h-4 w-4 text-emerald-700" />
            Cấu hình Mã Điểm thưởng (5 tiêu chí)
          </Button>

          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-[190px] h-9 text-xs font-bold text-slate-950 border-emerald-200 rounded-xl">
              <SelectValue placeholder="Đợt đánh giá" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Tất cả đợt đánh giá</SelectItem>
              {(periods ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] h-9 text-xs font-bold text-slate-950 border-emerald-200 rounded-xl">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="submitted">Chờ thẩm định</SelectItem>
              <SelectItem value="approved">Đã duyệt</SelectItem>
              <SelectItem value="revision_requested">Cần bổ sung</SelectItem>
              <SelectItem value="rejected">Từ chối</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Requests List */}
      <Card className="border-emerald-200 shadow-2xs rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-emerald-50 bg-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-slate-950 flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-700" />
              Danh sách hồ sơ đề xuất điểm thưởng ({filtered.length} hồ sơ)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-600 space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-700" />
              <p>Đang tải danh sách hồ sơ điểm thưởng...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-600">
              Không có hồ sơ điểm thưởng nào phù hợp với bộ lọc.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((req) => (
                <div key={req.id} className="p-5 hover:bg-emerald-50/20 transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-950">{req.title}</span>
                        {req.status === "approved" ? (
                          <Badge className="bg-emerald-700 text-white font-bold text-[10px]">
                            Đã duyệt (+{req.approved_score}đ)
                          </Badge>
                        ) : req.status === "submitted" ? (
                          <Badge className="bg-amber-700 text-white font-bold text-[10px]">
                            Chờ thẩm định (+{req.requested_score}đ)
                          </Badge>
                        ) : req.status === "revision_requested" ? (
                          <Badge className="bg-orange-700 text-white font-bold text-[10px]">
                            Cần bổ sung
                          </Badge>
                        ) : req.status === "rejected" ? (
                          <Badge className="bg-red-700 text-white font-bold text-[10px]">
                            Từ chối
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-700 font-semibold text-[10px]">
                            Nháp
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 font-bold text-slate-950">
                          <Building className="h-3.5 w-3.5 text-emerald-700" />
                          {req.organization?.name || "Liên đội"}
                        </span>
                        <span>•</span>
                        <span>Đợt: <b>{req.period?.name || "Chưa rõ"}</b></span>
                        <span>•</span>
                        <span>
                          Gửi ngày: {req.submitted_at ? new Date(req.submitted_at).toLocaleDateString("vi-VN") : "Bản nháp"}
                        </span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-600 font-semibold block">Điểm đề xuất:</span>
                      <span className="text-xl font-black text-slate-950">+{req.requested_score}đ</span>
                    </div>
                  </div>

                  {req.description && (
                    <div className="bg-slate-50 p-3 rounded-xl text-xs text-slate-900 whitespace-pre-line border border-slate-200 font-medium">
                      {req.description}
                    </div>
                  )}

                  {req.evidence && req.evidence.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-slate-800">Minh chứng:</span>
                      {req.evidence.map((ev) => (
                        <a
                          key={ev.id}
                          href={ev.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-emerald-800 hover:text-emerald-950 hover:underline flex items-center gap-1 bg-emerald-100/70 px-2.5 py-1 rounded-lg border border-emerald-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span>{ev.file_name || "Xem liên kết bài viết"}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="pt-2 flex items-center gap-2 justify-end">
                    <Button
                      size="sm"
                      onClick={() => openActionModal(req, "approve")}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold h-8 text-xs rounded-xl"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Duyệt điểm thưởng
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openActionModal(req, "revision")}
                      className="border-orange-300 text-orange-800 hover:bg-orange-50 font-bold h-8 text-xs rounded-xl"
                    >
                      <AlertCircle className="h-3.5 w-3.5 mr-1" />
                      Yêu cầu bổ sung
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openActionModal(req, "reject")}
                      className="text-red-700 hover:bg-red-50 hover:text-red-800 font-bold h-8 text-xs rounded-xl"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Từ chối
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Review Action */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border-emerald-200">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-950">
              {actionType === "approve"
                ? "Phê duyệt Điểm thưởng"
                : actionType === "revision"
                ? "Yêu cầu bổ sung minh chứng"
                : "Từ chối điểm thưởng"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 font-medium">
              Đơn vị: <b className="text-slate-950">{selectedReq?.organization?.name}</b>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-slate-900">
            <div>
              <p className="text-xs text-slate-600 font-semibold">Nội dung đề xuất:</p>
              <p className="text-xs font-bold text-slate-950 mt-0.5">{selectedReq?.title}</p>
            </div>

            {actionType === "approve" && (
              <div>
                <Label className="text-xs font-bold text-slate-950">
                  Số điểm chính thức phê duyệt (+ điểm)
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    value={approvedScore}
                    onChange={(e) => setApprovedScore(parseFloat(e.target.value) || 0)}
                    className="h-10 text-sm font-black text-emerald-800 border-emerald-300 w-32"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    / Đề xuất: {selectedReq?.requested_score}đ
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  * Admin có thể duyệt trọn vẹn hoặc điều chỉnh số điểm tương ứng với số lượng minh chứng hợp lệ.
                </p>
              </div>
            )}

            <div>
              <Label className="text-xs font-bold text-slate-950">
                Nhận xét / Ghi chú thẩm định
              </Label>
              <Textarea
                placeholder="Nhập lý do, nhận xét hoặc hướng dẫn bổ sung cho Liên đội..."
                rows={3}
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                className="mt-1 text-xs text-slate-950 font-medium border-slate-300 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="text-xs font-bold text-slate-700 h-9 rounded-xl"
            >
              Hủy
            </Button>
            <Button
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
              className={`text-xs font-bold text-white h-9 rounded-xl ${
                actionType === "approve"
                  ? "bg-emerald-700 hover:bg-emerald-800"
                  : actionType === "revision"
                  ? "bg-orange-700 hover:bg-orange-800"
                  : "bg-red-700 hover:bg-red-800"
              }`}
            >
              {reviewMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Đang lưu...
                </>
              ) : (
                "Xác nhận xử lý"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Configure Bonus Criteria Catalog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[94vw] max-w-3xl max-h-[92dvh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-2xl border-emerald-200">
          <DialogHeader className="shrink-0 pb-1 text-left">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg sm:text-xl font-extrabold text-slate-950 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-700" />
                  Cấu hình Danh mục Điểm thưởng (Mã tiêu chí)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-600 font-medium mt-0.5">
                  Quản lý 5 mã tiêu chí thưởng chuẩn theo Khung tiêu chí Đội. User sẽ chọn mã này khi tạo đề xuất điểm thưởng.
                </DialogDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleResetCatalog}
                className="text-xs text-slate-700 font-bold border-slate-300 gap-1 rounded-xl h-8 shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Khôi phục chuẩn
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 -mr-1">
            {editingCriteria.map((c, idx) => (
              <div
                key={c.id || idx}
                className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-emerald-200/80 text-emerald-950 px-2 py-0.5 rounded">
                      #{idx + 1}
                    </span>
                    <Input
                      value={c.code}
                      onChange={(e) => {
                        const updated = [...editingCriteria];
                        updated[idx].code = e.target.value.toUpperCase().replace(/\s+/g, "_");
                        setEditingCriteria(updated);
                      }}
                      className="font-mono text-xs font-black text-slate-950 w-36 h-8 bg-white uppercase"
                      placeholder="MÃ_CODE"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Label className="text-xs font-bold text-slate-800">Điểm cơ sở:</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={c.base_points}
                        onChange={(e) => {
                          const updated = [...editingCriteria];
                          updated[idx].base_points = parseFloat(e.target.value) || 1.0;
                          setEditingCriteria(updated);
                        }}
                        className="w-16 h-8 text-xs font-black text-emerald-900 bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <Label className="text-xs font-bold text-slate-800">Đơn vị:</Label>
                      <Input
                        value={c.unit}
                        onChange={(e) => {
                          const updated = [...editingCriteria];
                          updated[idx].unit = e.target.value;
                          setEditingCriteria(updated);
                        }}
                        className="w-32 h-8 text-xs font-bold text-slate-950 bg-white"
                        placeholder="mô hình, học sinh..."
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-950">Tên tiêu chí thưởng:</Label>
                  <Input
                    value={c.name}
                    onChange={(e) => {
                      const updated = [...editingCriteria];
                      updated[idx].name = e.target.value;
                      setEditingCriteria(updated);
                    }}
                    className="mt-1 text-xs font-bold text-slate-950 h-8 bg-white"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-950">Yêu cầu & Hướng dẫn minh chứng:</Label>
                  <Textarea
                    rows={2}
                    value={c.evidence_guidelines || ""}
                    onChange={(e) => {
                      const updated = [...editingCriteria];
                      updated[idx].evidence_guidelines = e.target.value;
                      setEditingCriteria(updated);
                    }}
                    className="mt-1 text-xs text-slate-900 font-medium bg-white resize-none"
                    placeholder="Mô tả các yêu cầu minh chứng cần nộp..."
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={handleAddCriterion}
              className="w-full text-xs font-bold text-emerald-800 border-dashed border-emerald-300 hover:bg-emerald-50 rounded-xl h-9 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Thêm tiêu chí điểm thưởng mới
            </Button>
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-slate-100 flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(false)}
              className="text-xs font-bold text-slate-700 h-9 rounded-xl"
            >
              Đóng
            </Button>
            <Button
              onClick={() => saveCatalogMutation.mutate()}
              disabled={saveCatalogMutation.isPending}
              className="text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white h-9 rounded-xl gap-1.5"
            >
              {saveCatalogMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Lưu cấu hình Điểm thưởng
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
