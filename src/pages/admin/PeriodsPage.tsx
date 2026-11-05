import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  EvaluationPeriod,
  PeriodStatus,
  CriterionLibrary,
  Organization,
  PeriodCriterion,
  OrganizationPeriod,
} from "@/types/database";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  Calendar,
  Building2,
  ClipboardList,
  CheckCircle2,
  Clock,
  Archive,
  Lock,
  Play,
  Settings2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// Data Fetching
// ============================================================

async function fetchPeriods(): Promise<EvaluationPeriod[]> {
  const { data, error } = await supabase
    .from("evaluation_periods")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EvaluationPeriod[];
}

async function fetchCriteriaLibrary(): Promise<CriterionLibrary[]> {
  const { data, error } = await supabase
    .from("criteria_library")
    .select("*, category:criteria_categories(*)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any[];
}

async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Organization[];
}

async function fetchPeriodDetails(periodId: string) {
  const [critRes, orgRes] = await Promise.all([
    supabase.from("period_criteria").select("*").eq("period_id", periodId),
    supabase.from("organization_periods").select("*, organization:organizations(*)").eq("period_id", periodId),
  ]);
  return {
    criteria: (critRes.data ?? []) as PeriodCriterion[],
    orgs: (orgRes.data ?? []) as (OrganizationPeriod & { organization?: Organization })[],
  };
}

// ============================================================
// Main Component
// ============================================================

export default function PeriodsPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Create / Edit Period Modal
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<EvaluationPeriod | null>(null);
  const [periodForm, setPeriodForm] = useState({
    name: "",
    description: "",
    start_at: "",
    submission_deadline: "",
    review_deadline: "",
  });

  // Configure Period (Criteria & Orgs) Modal
  const [configPeriod, setConfigPeriod] = useState<EvaluationPeriod | null>(null);
  const [configTab, setConfigTab] = useState<"criteria" | "orgs">("criteria");
  const [selectedCriteriaIds, setSelectedCriteriaIds] = useState<string[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);

  // Queries
  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ["evaluation_periods"],
    queryFn: fetchPeriods,
  });

  const { data: libraryCriteria } = useQuery({
    queryKey: ["criteria_library_active"],
    queryFn: fetchCriteriaLibrary,
  });

  const { data: allOrgs } = useQuery({
    queryKey: ["organizations_active_all"],
    queryFn: fetchOrganizations,
  });

  // Query details for configured period
  const { data: configuredData, refetch: refetchPeriodDetails } = useQuery({
    queryKey: ["period_details", configPeriod?.id],
    queryFn: () => (configPeriod ? fetchPeriodDetails(configPeriod.id) : null),
    enabled: !!configPeriod,
  });

  // ============================================================
  // Mutations
  // ============================================================

  const savePeriodMutation = useMutation({
    mutationFn: async (values: typeof periodForm) => {
      const payload = {
        name: values.name.trim(),
        description: values.description || null,
        start_at: values.start_at ? new Date(values.start_at).toISOString() : null,
        submission_deadline: values.submission_deadline ? new Date(values.submission_deadline).toISOString() : null,
        review_deadline: values.review_deadline ? new Date(values.review_deadline).toISOString() : null,
      };

      if (editingPeriod) {
        const { error } = await supabase
          .from("evaluation_periods")
          .update(payload)
          .eq("id", editingPeriod.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("evaluation_periods").insert({
          ...payload,
          status: "draft" as PeriodStatus,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluation_periods"] });
      toast.success(editingPeriod ? "Đã cập nhật đợt đánh giá" : "Đã tạo đợt đánh giá mới");
      setPeriodDialogOpen(false);
      setEditingPeriod(null);
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  // Change period status (Publish, Close, Archive)
  const changeStatusMutation = useMutation({
    mutationFn: async ({ periodId, status }: { periodId: string; status: PeriodStatus }) => {
      // If activating/publishing, verify snapshot criteria and orgs are selected
      if (status === "active") {
        const details = await fetchPeriodDetails(periodId);
        if (details.criteria.length === 0) {
          throw new Error("Đợt đánh giá phải có ít nhất 1 tiêu chí được chọn trước khi mở.");
        }
        if (details.orgs.length === 0) {
          throw new Error("Đợt đánh giá phải gán ít nhất 1 đơn vị Đoàn cơ sở trước khi mở.");
        }
      }

      const { error } = await supabase
        .from("evaluation_periods")
        .update({ status })
        .eq("id", periodId);
      if (error) throw error;

      // PRD Part 14: Notify all participating users when an evaluation period is published/activated
      if (status === "active") {
        const { data: orgPeriods } = await supabase
          .from("organization_periods")
          .select("organization_id")
          .eq("period_id", periodId);

        const orgIds = (orgPeriods ?? []).map((op) => op.organization_id);
        if (orgIds.length > 0) {
          const { data: users } = await supabase
            .from("profiles")
            .select("id")
            .in("organization_id", orgIds)
            .eq("role", "user");

          if (users && users.length > 0) {
            const { data: periodInfo } = await supabase
              .from("evaluation_periods")
              .select("name, submission_deadline")
              .eq("id", periodId)
              .single();

            await supabase.from("notifications").insert(
              users.map((u) => ({
                recipient_id: u.id,
                title: "Đợt đánh giá mới đã chính thức mở",
                message: `Đợt đánh giá "${periodInfo?.name || "Công tác Đoàn"}" đã mở tiếp nhận minh chứng. Hạn nộp: ${periodInfo?.submission_deadline ? new Date(periodInfo.submission_deadline).toLocaleDateString("vi-VN") : "theo quy định"}.`,
                type: "period_opened",
                link_url: "/user/criteria",
              }))
            );
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluation_periods"] });
      toast.success("Đã cập nhật trạng thái đợt đánh giá");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Save criteria snapshot to period
  const saveCriteriaSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!configPeriod) return;
      if (selectedCriteriaIds.length === 0) {
        throw new Error("Vui lòng chọn ít nhất 1 tiêu chí.");
      }

      // 1. Delete previous snapshot if in draft
      await supabase.from("period_criteria").delete().eq("period_id", configPeriod.id);

      // 2. Fetch chosen criteria from library with category
      const chosen = (libraryCriteria ?? []).filter((c) => selectedCriteriaIds.includes(c.id));

      const snapshots = chosen.map((c: any) => ({
        period_id: configPeriod.id,
        source_criteria_id: c.id,
        category_name_snapshot: c.category?.name || "Chung",
        code_snapshot: c.code,
        title_snapshot: c.title,
        description_snapshot: c.description,
        scoring_snapshot: c.scoring_guidelines,
        max_score_snapshot: c.max_score,
        req_doc1: c.req_doc1,
        req_doc2: c.req_doc2,
        req_link3: c.req_link3,
        responsible_unit_snapshot: c.responsible_unit,
        deadline_snapshot: c.deadline,
        sort_order: c.sort_order,
      }));

      const { error } = await supabase.from("period_criteria").insert(snapshots);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchPeriodDetails();
      toast.success("Đã lưu bộ tiêu chí áp dụng cho đợt này!");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  // Save participating orgs to period
  const saveOrgsMutation = useMutation({
    mutationFn: async () => {
      if (!configPeriod) return;
      if (selectedOrgIds.length === 0) {
        throw new Error("Vui lòng chọn ít nhất 1 đơn vị.");
      }

      // Remove existing not in list, add new
      await supabase.from("organization_periods").delete().eq("period_id", configPeriod.id);

      const rows = selectedOrgIds.map((orgId) => ({
        period_id: configPeriod.id,
        organization_id: orgId,
        status: "assigned" as const,
      }));

      const { error } = await supabase.from("organization_periods").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchPeriodDetails();
      toast.success("Đã lưu danh sách đơn vị tham gia!");
    },
    onError: (err: Error) => toast.error("Lỗi: " + err.message),
  });

  // ============================================================
  // Handlers
  // ============================================================

  function openCreate() {
    setEditingPeriod(null);
    setPeriodForm({
      name: "",
      description: "",
      start_at: new Date().toISOString().slice(0, 10),
      submission_deadline: "",
      review_deadline: "",
    });
    setPeriodDialogOpen(true);
  }

  function openEdit(period: EvaluationPeriod) {
    setEditingPeriod(period);
    setPeriodForm({
      name: period.name,
      description: period.description || "",
      start_at: period.start_at ? period.start_at.slice(0, 10) : "",
      submission_deadline: period.submission_deadline ? period.submission_deadline.slice(0, 10) : "",
      review_deadline: period.review_deadline ? period.review_deadline.slice(0, 10) : "",
    });
    setPeriodDialogOpen(true);
  }

  async function openConfig(period: EvaluationPeriod) {
    setConfigPeriod(period);
    const details = await fetchPeriodDetails(period.id);
    setSelectedCriteriaIds(
      details.criteria.map((c) => c.source_criteria_id).filter(Boolean) as string[]
    );
    setSelectedOrgIds(details.orgs.map((o) => o.organization_id));
  }

  const statusBadge = (status: PeriodStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-300">Bản nháp</Badge>;
      case "active":
        return <Badge className="bg-emerald-600 text-white">Đang diễn ra</Badge>;
      case "closed":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300">Đã đóng nộp</Badge>;
      case "archived":
        return <Badge variant="outline" className="bg-slate-100 text-slate-500">Đã lưu trữ</Badge>;
    }
  };

  const filteredPeriods = (periods ?? []).filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false);
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản lý đợt đánh giá</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Thiết lập các đợt thi đua, kỳ đánh giá công tác Đoàn theo năm hoặc chuyên đề
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Tạo đợt đánh giá mới
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm tên đợt đánh giá..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="draft">Bản nháp</SelectItem>
            <SelectItem value="active">Đang diễn ra</SelectItem>
            <SelectItem value="closed">Đã đóng nộp</SelectItem>
            <SelectItem value="archived">Đã lưu trữ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Periods List */}
      <Card>
        <CardContent className="p-0">
          {periodsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredPeriods.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-200" />
              {search || filterStatus !== "all"
                ? "Không tìm thấy đợt đánh giá phù hợp."
                : "Chưa có đợt đánh giá nào. Nhấn \"Tạo đợt đánh giá mới\" để bắt đầu."}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPeriods.map((period) => (
                <div
                  key={period.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 text-base">{period.name}</h3>
                      {statusBadge(period.status)}
                    </div>
                    {period.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{period.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        Bắt đầu: {period.start_at ? new Date(period.start_at).toLocaleDateString("vi-VN") : "Chưa đặt"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        Hạn nộp: {period.submission_deadline ? new Date(period.submission_deadline).toLocaleDateString("vi-VN") : "Chưa đặt"}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                        Hạn thẩm định: {period.review_deadline ? new Date(period.review_deadline).toLocaleDateString("vi-VN") : "Chưa đặt"}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openConfig(period)}
                      className="gap-1.5"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Cấu hình tiêu chí & đơn vị
                    </Button>

                    {period.status === "draft" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(period)}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          onClick={() => changeStatusMutation.mutate({ periodId: period.id, status: "active" })}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Mở đợt
                        </Button>
                      </>
                    )}

                    {period.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-amber-700 border-amber-300 hover:bg-amber-50 gap-1"
                        onClick={() => {
                          if (confirm("Bạn có chắc muốn đóng nhận nộp minh chứng cho đợt này?")) {
                            changeStatusMutation.mutate({ periodId: period.id, status: "closed" });
                          }
                        }}
                      >
                        <Lock className="h-3.5 w-3.5" />
                        Đóng đợt
                      </Button>
                    )}

                    {period.status === "closed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-slate-600 hover:bg-slate-100 gap-1"
                        onClick={() => {
                          if (confirm("Lưu trữ đợt đánh giá này vào lịch sử?")) {
                            changeStatusMutation.mutate({ periodId: period.id, status: "archived" });
                          }
                        }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Lưu trữ
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* DIALOG: CREATE / EDIT PERIOD */}
      {/* ============================================================ */}
      <Dialog open={periodDialogOpen} onOpenChange={(o) => !o && setPeriodDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPeriod ? "Chỉnh sửa đợt đánh giá" : "Tạo đợt đánh giá mới"}</DialogTitle>
            <DialogDescription>
              Thiết lập tên đợt và các mốc thời gian nộp bài, thẩm định.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div>
              <Label htmlFor="p-name">
                Tên đợt đánh giá <span className="text-red-500">*</span>
              </Label>
              <Input
                id="p-name"
                placeholder="VD: Đánh giá công tác Đoàn năm 2024"
                className="mt-1"
                value={periodForm.name}
                onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="p-desc">Mô tả / Kế hoạch triển khai</Label>
              <Textarea
                id="p-desc"
                placeholder="Mô tả mục đích, căn cứ pháp lý triển khai đợt đánh giá..."
                className="mt-1"
                rows={2}
                value={periodForm.description}
                onChange={(e) => setPeriodForm({ ...periodForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="p-start">Ngày bắt đầu</Label>
                <Input
                  id="p-start"
                  type="date"
                  className="mt-1 text-xs"
                  value={periodForm.start_at}
                  onChange={(e) => setPeriodForm({ ...periodForm, start_at: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="p-sub-dead">Hạn nộp minh chứng</Label>
                <Input
                  id="p-sub-dead"
                  type="date"
                  className="mt-1 text-xs"
                  value={periodForm.submission_deadline}
                  onChange={(e) => setPeriodForm({ ...periodForm, submission_deadline: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="p-rev-dead">Hạn thẩm định</Label>
                <Input
                  id="p-rev-dead"
                  type="date"
                  className="mt-1 text-xs"
                  value={periodForm.review_deadline}
                  onChange={(e) => setPeriodForm({ ...periodForm, review_deadline: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                if (!periodForm.name.trim()) {
                  toast.error("Vui lòng nhập tên đợt đánh giá.");
                  return;
                }
                savePeriodMutation.mutate(periodForm);
              }}
              disabled={savePeriodMutation.isPending}
            >
              {savePeriodMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingPeriod ? "Cập nhật" : "Tạo đợt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: CONFIGURE PERIOD (CRITERIA & ORGANIZATIONS) */}
      {/* ============================================================ */}
      <Dialog open={!!configPeriod} onOpenChange={(o) => !o && setConfigPeriod(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-blue-600" />
              Cấu hình đợt: {configPeriod?.name}
            </DialogTitle>
            <DialogDescription>
              Chọn các tiêu chí trong thư viện áp dụng cho đợt này và các đơn vị tham gia đánh giá.
            </DialogDescription>
          </DialogHeader>

          {configPeriod?.status !== "draft" && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Đợt đánh giá đã ở trạng thái {configPeriod?.status}. Các tiêu chí snapshot và phân công đã được cố định theo quy chuẩn PRD.
            </div>
          )}

          <Tabs value={configTab} onValueChange={(v) => setConfigTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-2 w-full max-w-sm">
              <TabsTrigger value="criteria" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Tiêu chí áp dụng ({selectedCriteriaIds.length})
              </TabsTrigger>
              <TabsTrigger value="orgs" className="gap-2">
                <Building2 className="h-4 w-4" />
                Đơn vị tham gia ({selectedOrgIds.length})
              </TabsTrigger>
            </TabsList>

            {/* TAB: SELECT CRITERIA */}
            <TabsContent value="criteria" className="flex-1 flex flex-col overflow-hidden space-y-3 mt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Hệ thống sẽ tạo bản sao bất biến (immutable snapshot) cho đợt này:
                </p>
                {configPeriod?.status === "draft" && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Clone from other period */}
                    {(periods ?? []).filter((p) => p.id !== configPeriod?.id).length > 0 && (
                      <Select
                        onValueChange={async (sourcePeriodId) => {
                          const { data: sourceCriteria } = await supabase
                            .from("period_criteria")
                            .select("source_criteria_id")
                            .eq("period_id", sourcePeriodId);
                          const ids = (sourceCriteria ?? [])
                            .map((sc) => sc.source_criteria_id)
                            .filter(Boolean) as string[];
                          if (ids.length > 0) {
                            setSelectedCriteriaIds(ids);
                            toast.success(`Đã sao chép ${ids.length} tiêu chí từ đợt đã chọn!`);
                          } else {
                            toast.warning("Đợt này chưa có tiêu chí nào.");
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-[180px]">
                          <SelectValue placeholder="Sao chép từ đợt khác..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(periods ?? [])
                            .filter((p) => p.id !== configPeriod?.id)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setSelectedCriteriaIds((libraryCriteria ?? []).map((c) => c.id))}
                    >
                      Chọn tất cả
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setSelectedCriteriaIds([])}
                    >
                      Bỏ chọn
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto border rounded-md divide-y divide-slate-100 max-h-80">
                {(libraryCriteria ?? []).map((c) => {
                  const checked = selectedCriteriaIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={configPeriod?.status !== "draft"}
                        onCheckedChange={(val) => {
                          if (val) {
                            setSelectedCriteriaIds([...selectedCriteriaIds, c.id]);
                          } else {
                            setSelectedCriteriaIds(selectedCriteriaIds.filter((id) => id !== c.id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-xs text-blue-700">{c.code}</span>
                          <span className="text-xs text-muted-foreground">({c.max_score} điểm)</span>
                        </div>
                        <p className="font-medium text-slate-800 text-xs mt-0.5">{c.title}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {configPeriod?.status === "draft" && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={() => saveCriteriaSnapshotMutation.mutate()}
                    disabled={saveCriteriaSnapshotMutation.isPending}
                  >
                    {saveCriteriaSnapshotMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Lưu danh sách tiêu chí
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* TAB: SELECT ORGANIZATIONS */}
            <TabsContent value="orgs" className="flex-1 flex flex-col overflow-hidden space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Chọn các Đoàn cơ sở được giao nộp bài trong đợt này:
                </p>
                {configPeriod?.status === "draft" && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setSelectedOrgIds((allOrgs ?? []).map((o) => o.id))}
                    >
                      Chọn tất cả
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setSelectedOrgIds([])}
                    >
                      Bỏ chọn
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto border rounded-md divide-y divide-slate-100 max-h-80">
                {(allOrgs ?? []).map((org) => {
                  const checked = selectedOrgIds.includes(org.id);
                  return (
                    <label
                      key={org.id}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={configPeriod?.status !== "draft"}
                        onCheckedChange={(val) => {
                          if (val) {
                            setSelectedOrgIds([...selectedOrgIds, org.id]);
                          } else {
                            setSelectedOrgIds(selectedOrgIds.filter((id) => id !== org.id));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <span className="font-mono text-xs font-semibold mr-2">{org.code}</span>
                        <span className="font-medium text-slate-800">{org.name}</span>
                        {org.contact_name && (
                          <span className="text-xs text-muted-foreground ml-2">({org.contact_name})</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {configPeriod?.status === "draft" && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={() => saveOrgsMutation.mutate()}
                    disabled={saveOrgsMutation.isPending}
                  >
                    {saveOrgsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Lưu danh sách đơn vị
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setConfigPeriod(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
