import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { EvaluationPeriod, Notification } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  Calendar,
  Building,
  Bell,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function UserDashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // 1. Fetch active evaluation period
  const { data: period, isLoading: periodLoading } = useQuery({
    queryKey: ["user_dashboard_period"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluation_periods")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        const { data: anyP } = await supabase
          .from("evaluation_periods")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return anyP as EvaluationPeriod | null;
      }
      return data as EvaluationPeriod | null;
    },
  });

  // 2. Fetch stats for user's organization in this period
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["user_dashboard_stats", period?.id, profile?.organization_id],
    queryFn: async () => {
      if (!period?.id || !profile?.organization_id) {
        return {
          totalCriteria: 0,
          submitted: 0,
          verified: 0,
          revisionRequested: 0,
          remaining: 0,
        };
      }

      // Get total criteria for this period
      const { count: totalCrit } = await supabase
        .from("period_criteria")
        .select("id", { count: "exact", head: true })
        .eq("period_id", period.id);

      // Get org period
      const { data: orgPeriod } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", period.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (!orgPeriod) {
        return {
          totalCriteria: totalCrit || 0,
          submitted: 0,
          verified: 0,
          revisionRequested: 0,
          remaining: totalCrit || 0,
        };
      }

      const { data: subs } = await supabase
        .from("submissions")
        .select("status")
        .eq("organization_period_id", orgPeriod.id);

      const subList = subs ?? [];
      const submitted = subList.filter((s) => s.status === "submitted" || s.status === "verified").length;
      const verified = subList.filter((s) => s.status === "verified").length;
      const revisionRequested = subList.filter((s) => s.status === "revision_requested").length;
      const remaining = Math.max(0, (totalCrit || 0) - submitted);

      return {
        totalCriteria: totalCrit || 0,
        submitted,
        verified,
        revisionRequested,
        remaining,
      };
    },
    enabled: !!period?.id,
  });

  // 3. Fetch recent notifications
  const { data: notifications } = useQuery({
    queryKey: ["user_dashboard_notifications", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(3);
      return (data ?? []) as Notification[];
    },
    enabled: !!profile?.id,
  });

  const totalCriteria = stats?.totalCriteria ?? 0;
  const submitted = stats?.submitted ?? 0;
  const progress = totalCriteria > 0 ? Math.round((submitted / totalCriteria) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Xin chào, {profile?.display_name || "Đoàn cơ sở"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Building className="h-4 w-4 text-blue-600" />
            Bảng điều khiển theo dõi tiến độ nộp minh chứng và kết quả đánh giá
          </p>
        </div>

        <Button
          onClick={() => navigate("/user/criteria")}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          <ClipboardList className="h-4 w-4" />
          Vào nộp minh chứng
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Current Period Info */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 shadow-2xs">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-700" />
                <span className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
                  Đợt đánh giá hiện tại
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 pt-1">
                {period?.name || "Đang cập nhật đợt đánh giá..."}
              </h3>
              {period?.description && (
                <p className="text-xs text-muted-foreground max-w-xl">{period.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-slate-700 pt-2 flex-wrap">
                <span>
                  Hạn nộp minh chứng:{" "}
                  <b className="text-amber-700">
                    {period?.submission_deadline
                      ? new Date(period.submission_deadline).toLocaleDateString("vi-VN")
                      : "Theo thông báo"}
                  </b>
                </span>
                <span>
                  Hạn thẩm định:{" "}
                  <b className="text-blue-700">
                    {period?.review_deadline
                      ? new Date(period.review_deadline).toLocaleDateString("vi-VN")
                      : "Theo thông báo"}
                  </b>
                </span>
              </div>
            </div>
            <Badge className="bg-emerald-600 text-white shrink-0">
              {period?.status === "active" ? "Đang mở" : "Chưa kích hoạt"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Tiến độ hoàn thành tiêu chí</span>
            <span className="text-blue-700 font-bold">{progress}%</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} className="h-2.5" />
          <p className="text-xs text-muted-foreground">
            Đơn vị đã nộp {submitted} trên tổng số {totalCriteria} tiêu chí được giao.
          </p>
        </CardContent>
      </Card>

      {/* Stat Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.submitted ?? 0}</p>
                <p className="text-xs text-muted-foreground">Đã nộp</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">{stats?.verified ?? 0}</p>
                <p className="text-xs text-muted-foreground">Đã xác thực</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-500">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-700">{stats?.revisionRequested ?? 0}</p>
                <p className="text-xs text-muted-foreground">Cần bổ sung</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-700">{stats?.remaining ?? 0}</p>
                <p className="text-xs text-muted-foreground">Chưa nộp</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600" />
            Thông báo mới nhận
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-blue-600 hover:text-blue-700"
            onClick={() => navigate("/user/notifications")}
          >
            Xem tất cả
          </Button>
        </CardHeader>
        <CardContent>
          {!notifications || notifications.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Không có thông báo mới nào.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div key={n.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-800">{n.title}</p>
                    <p className="text-slate-600 line-clamp-1">{n.message}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-3">
                    {new Date(n.created_at).toLocaleDateString("vi-VN")}
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
