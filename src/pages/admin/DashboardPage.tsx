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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

export default function DashboardPage() {
  // Phase 1: Static data — will be replaced with real queries in Phase 2+
  const stats = {
    totalOrgs: 12,
    activePeriods: 2,
    totalCriteria: 45,
    submitted: 180,
    unsubmitted: 360,
    pendingReview: 95,
    verified: 85,
    pendingBonus: 8,
  };

  const submissionProgress = stats.totalCriteria > 0
    ? Math.round((stats.submitted / (stats.submitted + stats.unsubmitted)) * 100)
    : 0;

  const verificationProgress = stats.submitted > 0
    ? Math.round((stats.verified / stats.submitted) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tổng quan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bảng điều khiển quản trị hệ thống đánh giá công tác Đoàn
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Tổng đơn vị"
          value={stats.totalOrgs}
          description="Đoàn cơ sở đang hoạt động"
          icon={<Building2 className="h-5 w-5" />}
          color="text-blue-600"
        />
        <KpiCard
          title="Đợt đánh giá đang mở"
          value={stats.activePeriods}
          icon={<Calendar className="h-5 w-5" />}
          color="text-indigo-600"
        />
        <KpiCard
          title="Tổng tiêu chí"
          value={stats.totalCriteria}
          description="Trong bộ tiêu chí hiện hành"
          icon={<ClipboardList className="h-5 w-5" />}
          color="text-slate-600"
        />
        <KpiCard
          title="Điểm cộng chờ duyệt"
          value={stats.pendingBonus}
          icon={<Award className="h-5 w-5" />}
          color="text-amber-600"
        />
      </div>

      {/* Submission & Verification Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Đã nộp"
          value={stats.submitted}
          description="Tiêu chí đã được nộp"
          icon={<FileCheck className="h-5 w-5" />}
          color="text-emerald-600"
        />
        <KpiCard
          title="Chưa nộp"
          value={stats.unsubmitted}
          description="Tiêu chí chưa nộp"
          icon={<AlertCircle className="h-5 w-5" />}
          color="text-slate-400"
        />
        <KpiCard
          title="Chờ thẩm định"
          value={stats.pendingReview}
          description="Đang chờ xét duyệt"
          icon={<Clock className="h-5 w-5" />}
          color="text-orange-500"
        />
        <KpiCard
          title="Đã xác thực"
          value={stats.verified}
          description="Đã thẩm định xong"
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="text-green-600"
        />
      </div>

      {/* Progress Cards */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Tiến độ nộp bài</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats.submitted} / {stats.submitted + stats.unsubmitted} tiêu chí
              </span>
              <span className="font-semibold">{submissionProgress}%</span>
            </div>
            <Progress value={submissionProgress} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Tiến độ thẩm định</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats.verified} / {stats.submitted} tiêu chí đã nộp
              </span>
              <span className="font-semibold">{verificationProgress}%</span>
            </div>
            <Progress value={verificationProgress} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Hoạt động gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Users className="h-5 w-5 mr-2 text-slate-300" />
            Dữ liệu hoạt động sẽ hiển thị khi hệ thống được kết nối Supabase.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
