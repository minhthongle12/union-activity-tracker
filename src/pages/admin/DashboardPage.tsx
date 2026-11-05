import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: string;
  color?: string;
}

function KpiCard({ title, value, description, icon, trend, color = "text-primary" }: KpiCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <TrendingUp className="h-3 w-3" />
                {trend}
              </div>
            )}
          </div>
          <div className={`h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center ${color}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin_dashboard_stats"],
    queryFn: async () => {
      const [orgs, periods, criteria, subs, bonus, logs] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("evaluation_periods").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("criteria_library").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("submissions").select("status"),
        supabase.from("bonus_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("audit_logs").select("*, actor:profiles(display_name)").order("created_at", { ascending: false }).limit(5),
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

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tổng quan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bảng điều khiển quản trị trung tâm hệ thống đánh giá công tác Đoàn
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Tổng đơn vị"
          value={isLoading ? "—" : stats?.totalOrgs ?? 0}
          description="Đoàn cơ sở đang hoạt động"
          icon={<Building2 className="h-5 w-5" />}
          color="text-blue-600"
        />
        <KpiCard
          title="Đợt đánh giá đang mở"
          value={isLoading ? "—" : stats?.activePeriods ?? 0}
          description="Đang nhận nộp minh chứng"
          icon={<Calendar className="h-5 w-5" />}
          color="text-indigo-600"
        />
        <KpiCard
          title="Tổng tiêu chí gốc"
          value={isLoading ? "—" : stats?.totalCriteria ?? 0}
          description="Trong thư viện tiêu chí"
          icon={<ClipboardList className="h-5 w-5" />}
          color="text-slate-600"
        />
        <KpiCard
          title="Điểm cộng chờ duyệt"
          value={isLoading ? "—" : stats?.pendingBonus ?? 0}
          description="Yêu cầu điểm thưởng từ cơ sở"
          icon={<Award className="h-5 w-5" />}
          color="text-amber-600"
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
        />
        <KpiCard
          title="Chưa nộp"
          value={isLoading ? "—" : stats?.unsubmitted ?? 0}
          description="Tiêu chí chưa hoàn thành"
          icon={<AlertCircle className="h-5 w-5" />}
          color="text-slate-400"
        />
        <KpiCard
          title="Chờ thẩm định"
          value={isLoading ? "—" : stats?.pendingReview ?? 0}
          description="Hội đồng cần xét duyệt"
          icon={<Clock className="h-5 w-5" />}
          color="text-orange-500"
        />
        <KpiCard
          title="Đã xác thực"
          value={isLoading ? "—" : stats?.verified ?? 0}
          description="Đã chấm điểm chính thức"
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="text-emerald-600"
        />
      </div>

      {/* Progress Cards */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Tiến độ nộp bài toàn hệ thống</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats?.submitted ?? 0} / {(stats?.submitted ?? 0) + (stats?.unsubmitted ?? 0)} lượt tiêu chí
              </span>
              <span className="font-semibold">{submissionProgress}%</span>
            </div>
            <Progress value={submissionProgress} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Tiến độ thẩm định của Hội đồng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats?.verified ?? 0} / {stats?.submitted ?? 0} tiêu chí đã nộp
              </span>
              <span className="font-semibold">{verificationProgress}%</span>
            </div>
            <Progress value={verificationProgress} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            Nhật ký hoạt động gần đây
          </CardTitle>
          <CardDescription>
            Theo dõi các thao tác thẩm định và cập nhật trong hệ thống
          </CardDescription>
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
                <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
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
