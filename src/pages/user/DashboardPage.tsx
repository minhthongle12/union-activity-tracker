import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  Calendar,
  Building,
  Bell,
} from "lucide-react";

export default function DashboardPage() {
  const { profile } = useAuth();

  // Phase 1: Static placeholder — will use real queries later
  const stats = {
    totalCriteria: 45,
    submitted: 12,
    verified: 5,
    revisionRequested: 2,
    remaining: 26,
  };

  const progress = stats.totalCriteria > 0
    ? Math.round((stats.submitted / stats.totalCriteria) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Xin chào, {profile?.display_name || "Đoàn cơ sở"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
          <Building className="h-4 w-4" />
          Tổng quan tình hình đánh giá của đơn vị
        </p>
      </div>

      {/* Current Period Info */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">Đợt đánh giá hiện tại</span>
              </div>
              <h3 className="text-lg font-bold text-blue-900">Đánh giá 6 tháng đầu năm 2024</h3>
              <p className="text-sm text-blue-700 mt-1">Hạn nộp: 30/06/2024</p>
            </div>
            <Badge className="bg-blue-600 text-white">Đang mở</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Tiến độ nộp bài</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {stats.submitted} / {stats.totalCriteria} tiêu chí
            </span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2.5" />
        </CardContent>
      </Card>

      {/* Stat Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.submitted}</p>
                <p className="text-xs text-muted-foreground">Đã nộp</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.verified}</p>
                <p className="text-xs text-muted-foreground">Đã xác thực</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-500">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.revisionRequested}</p>
                <p className="text-xs text-muted-foreground">Chờ bổ sung</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.remaining}</p>
                <p className="text-xs text-muted-foreground">Chưa nộp</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Thông báo gần đây
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <ClipboardList className="h-5 w-5 mr-2 text-slate-300" />
            Chưa có thông báo nào.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
