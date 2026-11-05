import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { BonusRequest, BonusStatus, Organization, EvaluationPeriod } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const { data: periods } = useQuery({
    queryKey: ["admin_bonus_periods"],
    queryFn: fetchPeriods,
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin_bonus_requests"],
    queryFn: fetchAdminBonusRequests,
  });

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
            let notifTitle = `Yêu cầu điểm cộng đã được duyệt (+${finalScore}đ)`;
            let notifType = "bonus_approved";
            if (actionType === "reject") {
              notifTitle = `Yêu cầu điểm cộng không được duyệt`;
              notifType = "bonus_rejected";
            } else if (actionType === "revision") {
              notifTitle = `Yêu cầu bổ sung minh chứng điểm cộng`;
              notifType = "bonus_revision";
            }

            await supabase.from("notifications").insert(
              orgUsers.map((u) => ({
                recipient_id: u.id,
                title: notifTitle,
                message: `Hoạt động "${selectedReq.title}": ${actionComment || (actionType === "approve" ? "Đã được Hội đồng thẩm định phê duyệt" : "Xem chi tiết trong mục Điểm cộng")}`,
                type: notifType,
                link_url: "/user/bonus",
              }))
            );
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_bonus_requests"] });
      toast.success("Đã hoàn tất xử lý yêu cầu điểm cộng!");
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý điểm cộng
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Xem xét và phê duyệt các yêu cầu cộng điểm thi đua từ các đơn vị Đoàn cơ sở
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Đợt đánh giá" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả đợt đánh giá</SelectItem>
              {(periods ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
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
              <SelectItem value="submitted">Chờ duyệt</SelectItem>
              <SelectItem value="approved">Đã duyệt</SelectItem>
              <SelectItem value="rejected">Không duyệt</SelectItem>
              <SelectItem value="revision_requested">Yêu cầu bổ sung</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tải danh sách đề xuất điểm cộng...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Award className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Không có đề xuất điểm cộng nào trong danh sách.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <div key={item.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50">
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-base">{item.title}</span>
                      <Badge variant="outline" className="text-xs gap-1 bg-slate-50">
                        <Building className="h-3 w-3 text-blue-600" />
                        {item.organization?.name || "Đoàn cơ sở"}
                      </Badge>
                      {item.period?.name && (
                        <Badge variant="outline" className="text-xs gap-1 bg-blue-50 text-blue-700 border-blue-200">
                          <Calendar className="h-3 w-3" />
                          {item.period.name}
                        </Badge>
                      )}
                      {item.status === "submitted" && <Badge className="bg-blue-600 text-white">Chờ duyệt</Badge>}
                      {item.status === "approved" && <Badge className="bg-emerald-600 text-white">Đã duyệt (+{item.approved_score}đ)</Badge>}
                      {item.status === "rejected" && <Badge className="bg-red-600 text-white">Từ chối</Badge>}
                      {item.status === "revision_requested" && <Badge className="bg-amber-600 text-white">Cần bổ sung</Badge>}
                    </div>

                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    )}

                    {/* Evidence links */}
                    {item.evidence && item.evidence.length > 0 && (
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {item.evidence.map((ev) => (
                          <a
                            key={ev.id}
                            href={ev.external_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {ev.file_name || "Xem minh chứng"}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span>Đề xuất: <b className="text-slate-800">{item.requested_score}đ</b></span>
                      <span>Ngày nộp: {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("vi-VN") : "Bản nháp"}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {item.status === "submitted" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
                        onClick={() => openActionModal(item, "approve")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Duyệt điểm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-700 border-amber-300 hover:bg-amber-50 gap-1 text-xs"
                        onClick={() => openActionModal(item, "revision")}
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                        Bổ sung
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-700 border-red-300 hover:bg-red-50 gap-1 text-xs"
                        onClick={() => openActionModal(item, "reject")}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Từ chối
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[94vw] max-w-md max-h-[92dvh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-xl">
          <DialogHeader className="shrink-0 pb-1 text-left">
            <DialogTitle>
              {actionType === "approve" && "Phê duyệt điểm cộng"}
              {actionType === "reject" && "Từ chối đề xuất điểm cộng"}
              {actionType === "revision" && "Yêu cầu bổ sung minh chứng"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Hoạt động: <span className="font-semibold text-slate-800 break-words">{selectedReq?.title}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1 -mr-1">
            {actionType === "approve" && (
              <div>
                <Label className="text-xs">Điểm phê duyệt (tối đa {selectedReq?.requested_score}đ)</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  max={selectedReq?.requested_score || 5}
                  value={approvedScore}
                  onChange={(e) => setApprovedScore(parseFloat(e.target.value) || 0)}
                  className="mt-1 font-bold text-emerald-700 w-full sm:w-32 text-xs sm:text-sm"
                />
              </div>
            )}

            <div>
              <Label className="text-xs">Ý kiến đánh giá / Nhận xét của Hội đồng</Label>
              <Textarea
                placeholder="Nhập nhận xét hoặc lý do..."
                rows={3}
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                className="mt-1 text-xs sm:text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              Hủy
            </Button>
            <Button
              type="button"
              className={
                actionType === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto text-xs sm:text-sm"
                  : actionType === "reject"
                  ? "bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto text-xs sm:text-sm"
                  : "bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto text-xs sm:text-sm"
              }
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
