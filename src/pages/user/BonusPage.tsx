import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
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
  const { data, error } = await supabase
    .from("organization_periods")
    .select("id, period_id, status, period:evaluation_periods(*)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).filter((op) => !!op.period) as UserAssignedPeriod[];
}

async function fetchUserBonusRequests(orgId?: string | null): Promise<UserBonusWithPeriod[]> {
  if (!orgId) return [];
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

  if (error) throw error;
  return (data ?? []) as UserBonusWithPeriod[];
}

export default function UserBonusPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
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

      const { data: newReq, error: reqError } = await supabase
        .from("bonus_requests")
        .insert({
          organization_period_id: form.organization_period_id,
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
          await supabase.from("notifications").insert(
            adminUsers.map((a) => ({
              recipient_id: a.id,
              title: "Đề xuất điểm cộng mới",
              message: `${profile?.display_name || "Đơn vị"} vừa gửi đề xuất điểm cộng: "${form.title.trim()}". Yêu cầu: +${form.requested_score}đ.`,
              type: "bonus_submitted",
              link_url: "/admin/bonus",
            }))
          );
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
        return <Badge className="bg-blue-600 text-white gap-1"><Clock className="h-3 w-3" /> Đã gửi chờ duyệt</Badge>;
      case "approved":
        return <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Đã cộng điểm</Badge>;
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
        <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Đề xuất điểm cộng
        </Button>
      </div>

      {/* Overview Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <span className="text-xs text-muted-foreground block">Tổng yêu cầu đã đề xuất</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">
              {bonusRequests?.length || 0}
            </span>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-6">
            <span className="text-xs text-emerald-800 block font-semibold">Điểm cộng đã được phê duyệt</span>
            <span className="text-2xl font-bold text-emerald-700 mt-1 block">
              +{totalApprovedScore} điểm
            </span>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-6">
            <span className="text-xs text-blue-800 block font-semibold">Đang chờ xét duyệt</span>
            <span className="text-2xl font-bold text-blue-700 mt-1 block">
              {(bonusRequests ?? []).filter((b) => b.status === "submitted").length}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-blue-600" />
            Danh sách đề xuất điểm cộng
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tải dữ liệu điểm cộng...</p>
            </div>
          ) : (bonusRequests ?? []).length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Award className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Chưa có đề xuất điểm cộng nào. Nhấn "Đề xuất điểm cộng" để tạo mới.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {bonusRequests?.map((item) => (
                <div key={item.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-900 text-base">{item.title}</h4>
                      {getStatusBadge(item.status)}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span>Điểm đề xuất: <b className="text-slate-800">{item.requested_score}đ</b></span>
                      {item.approved_score !== null && (
                        <span>Điểm duyệt: <b className="text-emerald-700 font-bold">+{item.approved_score}đ</b></span>
                      )}
                      <span>Ngày gửi: {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("vi-VN") : "Bản nháp"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Create Bonus Proposal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Đề xuất điểm cộng thi đua</DialogTitle>
            <DialogDescription>
              Nhập nội dung hoạt động tiêu biểu và nộp kèm minh chứng để Hội đồng xem xét duyệt điểm cộng.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Tên hoạt động / Công trình thanh niên *</Label>
              <Input
                placeholder="VD: Mô hình sáng kiến số hóa di tích lịch sử địa phương"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Mô tả chi tiết kết quả hoạt động</Label>
              <Textarea
                placeholder="Mô tả quy mô, kết quả, ý nghĩa xã hội và sự lan tỏa của hoạt động..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Điểm đề xuất (tối đa 2.0đ/hoạt động)</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="5.0"
                value={form.requested_score}
                onChange={(e) => setForm({ ...form, requested_score: parseFloat(e.target.value) || 0 })}
                className="mt-1 w-32 font-bold text-blue-700"
              />
            </div>

            <div className="border rounded-md p-3 bg-slate-50 space-y-2">
              <Label className="text-xs font-semibold text-slate-800">Liên kết minh chứng (Báo chí, Fanpage, Drive...)</Label>
              <Input
                placeholder="Tiêu đề bài viết minh chứng"
                value={form.evidenceName}
                onChange={(e) => setForm({ ...form, evidenceName: e.target.value })}
                className="text-xs bg-white"
              />
              <Input
                placeholder="https://..."
                value={form.evidenceUrl}
                onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })}
                className="text-xs bg-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!form.title.trim()) {
                  toast.error("Vui lòng nhập tên hoạt động.");
                  return;
                }
                createBonusMutation.mutate("draft");
              }}
              disabled={createBonusMutation.isPending}
            >
              Lưu nháp
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
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
