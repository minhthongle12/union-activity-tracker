import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Building2,
  Users,
  ClipboardList,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Award,
  TrendingUp,
  Calendar,
  History,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: string;
  color?: string;
  onClick?: () => void;
  actionText?: string;
}

function KpiCard({
  title,
  value,
  description,
  icon,
  trend,
  color = "text-primary",
  onClick,
  actionText,
}: KpiCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "transition-all duration-200 border-slate-200",
        onClick && "hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5 cursor-pointer group"
      )}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground group-hover:text-blue-700 transition-colors flex items-center gap-1">
              {title}
              {onClick && (
                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-blue-600" />
              )}
            </p>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <TrendingUp className="h-3 w-3" />
                {trend}
              </div>
            )}
            {actionText && (
              <p className="text-[11px] font-medium text-blue-600 pt-1 group-hover:underline">
                {actionText} →
              </p>
            )}
          </div>
          <div
            className={cn(
              "h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center transition-colors group-hover:bg-blue-50",
              color
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin_dashboard_stats"],
    queryFn: async () => {
      const [orgs, periods, criteria, subs, bonus, logs, activePeriod] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("evaluation_periods").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("criteria_library").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("submissions").select("status"),
        supabase.from("bonus_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("audit_logs").select("*, actor:profiles(display_name)").order("created_at", { ascending: false }).limit(5),
        supabase.from("evaluation_periods").select("id").eq("status", "active").limit(1).maybeSingle(),
      ]);

      const subList = subs.data ?? [];
      const submitted = subList.filter((s) => s.status === "submitted" || s.status === "verified").length;
      const verified = subList.filter((s) => s.status === "verified").length;
      const pendingReview = subList.filter((s) => s.status === "submitted").length;
      const revisionRequested = subList.filter((s) => s.status === "revision_requested").length;
      const unsubmitted = Math.max(0, (criteria.count || 0) * (orgs.count || 1) - submitted);

      return {
        totalOrgs: orgs.count ?? 0,
        activePeriods: periods.count ?? 0,
        totalCriteria: criteria.count ?? 0,
        submitted,
        unsubmitted,
        pendingReview,
        verified,
        revisionRequested,
        pendingBonus: bonus.count ?? 0,
        recentLogs: logs.data ?? [],
        activePeriodId: activePeriod.data?.id as string | undefined,
      };
    },
  });

  const submissionProgress =
    stats && stats.submitted + stats.unsubmitted > 0
      ? Math.round((stats.submitted / (stats.submitted + stats.unsubmitted)) * 100)
      : 0;

  const verificationProgress =
    stats && stats.submitted > 0
      ? Math.round((stats.verified / stats.submitted) * 100)
      : 0;

  const reviewUrl = stats?.activePeriodId
    ? `/admin/review?period=${stats.activePeriodId}`
    : "/admin/review";

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tổng quan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bảng điều khiển quản trị trung tâm hệ thống đánh giá công tác Đội
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Tổng đơn vị"
          value={isLoading ? "—" : stats?.totalOrgs ?? 0}
          description="Liên đội đang hoạt động"
          icon={<Building2 className="h-5 w-5" />}
          color="text-blue-600"
          onClick={() => navigate("/admin/organizations")}
          actionText="Quản lý đơn vị"
        />
        <KpiCard
          title="Đợt đánh giá đang mở"
          value={isLoading ? "—" : stats?.activePeriods ?? 0}
          description="Đang nhận nộp minh chứng"
          icon={<Calendar className="h-5 w-5" />}
          color="text-indigo-600"
          onClick={() => navigate("/admin/periods")}
          actionText="Quản lý đợt đánh giá"
        />
        <KpiCard
          title="Tổng tiêu chí gốc"
          value={isLoading ? "—" : stats?.totalCriteria ?? 0}
          description="Trong thư viện tiêu chí"
          icon={<ClipboardList className="h-5 w-5" />}
          color="text-slate-600"
          onClick={() => navigate("/admin/criteria")}
          actionText="Thư viện tiêu chí"
        />
        <KpiCard
          title="Điểm cộng chờ duyệt"
          value={isLoading ? "—" : stats?.pendingBonus ?? 0}
          description="Yêu cầu điểm thưởng từ cơ sở"
          icon={<Award className="h-5 w-5" />}
          color="text-amber-600"
          onClick={() => navigate("/admin/bonus")}
          actionText="Duyệt điểm cộng"
        />
      </div>

      {/* Submission & Verification Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Đã nộp minh chứng"
          value={isLoading ? "—" : stats?.submitted ?? 0}
          description="Tiêu chí các đơn vị đã nộp"
          icon={<FileCheck className="h-5 w-5" />}
          color="text-blue-600"
          onClick={() => navigate(reviewUrl)}
          actionText="Xem thẩm định"
        />
        <KpiCard
          title="Chưa nộp"
          value={isLoading ? "—" : stats?.unsubmitted ?? 0}
          description="Tiêu chí chưa hoàn thành"
          icon={<AlertCircle className="h-5 w-5" />}
          color="text-slate-400"
          onClick={() => navigate("/admin/reports")}
          actionText="Xem báo cáo tiến độ"
        />
        <KpiCard
          title="Chờ thẩm định"
          value={isLoading ? "—" : stats?.pendingReview ?? 0}
          description="Hội đồng cần xét duyệt"
          icon={<Clock className="h-5 w-5" />}
          color="text-orange-500"
          onClick={() => navigate(reviewUrl)}
          actionText="Vào chấm điểm ngay"
        />
        <KpiCard
          title="Đã xác thực"
          value={isLoading ? "—" : stats?.verified ?? 0}
          description="Đã chấm điểm chính thức"
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="text-emerald-600"
          onClick={() => navigate(reviewUrl)}
          actionText="Xem kết quả xác thực"
        />
      </div>

      {/* Progress Cards */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card
          onClick={() => navigate("/admin/reports")}
          className="cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold group-hover:text-blue-700 transition-colors">
              Tiến độ nộp bài toàn hệ thống
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats?.submitted ?? 0} / {(stats?.submitted ?? 0) + (stats?.unsubmitted ?? 0)} lượt tiêu chí
              </span>
              <span className="font-semibold text-slate-900">{submissionProgress}%</span>
            </div>
            <Progress value={submissionProgress} className="h-2" />
            <p className="text-[11px] text-blue-600 font-medium pt-1 text-right group-hover:underline">
              Xem chi tiết báo cáo & xuất Excel →
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => navigate(reviewUrl)}
          className="cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold group-hover:text-blue-700 transition-colors">
              Tiến độ thẩm định của Hội đồng
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats?.verified ?? 0} / {stats?.submitted ?? 0} tiêu chí đã nộp
              </span>
              <span className="font-semibold text-slate-900">{verificationProgress}%</span>
            </div>
            <Progress value={verificationProgress} className="h-2" />
            <p className="text-[11px] text-blue-600 font-medium pt-1 text-right group-hover:underline">
              Vào trang Thẩm định & xác thực →
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activities */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              Nhật ký hoạt động gần đây
            </CardTitle>
            <CardDescription className="mt-1">
              Theo dõi các thao tác thẩm định và cập nhật trong hệ thống
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/audit-logs")}
            className="text-xs gap-1.5 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
          >
            Xem tất cả nhật ký
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600" />
              <p>Đang tải nhật ký...</p>
            </div>
          ) : !stats?.recentLogs || stats.recentLogs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Chưa có thao tác nào gần đây.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.recentLogs.map((log: any) => (
                <div
                  key={log.id}
                  onClick={() => navigate("/admin/audit-logs")}
                  className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 px-2 rounded cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {log.actor?.display_name || "Quản trị viên"}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                      {log.action}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground font-mono">
                    {new Date(log.created_at).toLocaleString("vi-VN")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
