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
  Trophy,
  Sparkles,
  ChevronRight,
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
    <div className="space-y-6 text-slate-900">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            Xin chào, {profile?.display_name || "Liên đội"}
          </h1>
          <p className="text-sm text-slate-700 mt-1 flex items-center gap-2">
            <Building className="h-4 w-4 text-emerald-700" />
            Bảng điều khiển theo dõi tiến độ nộp minh chứng và kết quả đánh giá Công tác Đội
          </p>
        </div>

        <Button
          onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
          className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold shrink-0 shadow-md shadow-emerald-900/20 rounded-xl"
        >
          <ClipboardList className="h-4 w-4" />
          Vào nộp minh chứng
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Current Period Info (Clickable) */}
      <Card
        onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
        className="border-2 border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 via-[#f7fbf8] to-lime-50/70 shadow-2xs rounded-2xl cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group active:scale-[0.99]"
        title="Nhấn để xem danh sách tiêu chí của đợt đánh giá này"
      >
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-700" />
                <span className="text-xs font-bold text-slate-950 uppercase tracking-wider">
                  Đợt đánh giá hiện tại
                </span>
                <span className="text-[11px] text-slate-900 bg-emerald-100 px-2.5 py-0.5 rounded-full font-bold border border-emerald-300 group-hover:bg-emerald-200 transition-colors">
                  Bấm để vào tự chấm →
                </span>
              </div>
              <h3 className="text-xl font-extrabold text-slate-950 pt-1 group-hover:text-emerald-900 transition-colors">
                {period?.name || "Đang cập nhật đợt đánh giá..."}
              </h3>
              {period?.description && (
                <p className="text-xs text-slate-700 max-w-xl font-medium">{period.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-slate-800 pt-2 flex-wrap">
                <span>
                  Hạn nộp minh chứng:{" "}
                  <b className="text-amber-800 font-bold">
                    {period?.submission_deadline
                      ? new Date(period.submission_deadline).toLocaleDateString("vi-VN")
                      : "Theo thông báo"}
                  </b>
                </span>
                <span>
                  Hạn thẩm định:{" "}
                  <b className="text-emerald-800 font-bold">
                    {period?.review_deadline
                      ? new Date(period.review_deadline).toLocaleDateString("vi-VN")
                      : "Theo thông báo"}
                  </b>
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge className="bg-emerald-700 text-white font-bold shadow-xs">
                {period?.status === "active" ? "Đang mở" : "Chưa kích hoạt"}
              </Badge>
              <div className="text-xs text-slate-900 font-bold hidden sm:flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                <span>Chi tiết</span>
                <ChevronRight className="h-4 w-4 text-emerald-700" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress (Clickable) */}
      <Card
        onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
        className="border-emerald-200/90 shadow-2xs rounded-2xl cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group active:scale-[0.99]"
        title="Nhấn để tiếp tục hoàn thành các tiêu chí"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold flex items-center justify-between text-slate-950">
            <span>Tiến độ hoàn thành tiêu chí</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 hidden sm:inline">Bấm để hoàn thiện</span>
              <span className="text-emerald-800 font-black text-xl">{progress}%</span>
              <ChevronRight className="h-4 w-4 text-emerald-700 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} className="h-2.5 bg-emerald-100" />
          <p className="text-xs text-slate-700 flex justify-between items-center">
            <span>Đơn vị đã nộp <b className="text-black font-black">{submitted}</b> trên tổng số <b className="text-black font-black">{totalCriteria}</b> tiêu chí được giao.</span>
            <span className="text-emerald-800 font-bold group-hover:underline text-[11px]">Vào danh sách tiêu chí →</span>
          </p>
        </CardContent>
      </Card>

      {/* Stat Grid (Clickable to respective sections) */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Đã nộp -> Tiêu chí */}
        <Card
          onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
          className="border-emerald-200/80 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer rounded-2xl group active:scale-[0.98]"
          title="Bấm để xem danh sách tiêu chí đã nộp"
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 group-hover:scale-110 transition-transform">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-950">
                    {stats?.submitted ?? 0}
                  </p>
                  <p className="text-xs text-slate-700 font-bold">Đã nộp</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>

        {/* Đã xác thực -> Kết quả đánh giá */}
        <Card
          onClick={() => navigate(period?.id ? `/user/results?period=${period.id}` : "/user/results")}
          className="border-emerald-200/80 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer rounded-2xl group active:scale-[0.98]"
          title="Bấm để xem bảng điểm và kết quả chính thức"
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-emerald-800">
                    {stats?.verified ?? 0}
                  </p>
                  <p className="text-xs text-slate-700 font-bold">Đã xác thực</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>

        {/* Cần bổ sung -> Tiêu chí */}
        <Card
          onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
          className="border-orange-200 hover:border-orange-400 hover:shadow-md transition-all cursor-pointer rounded-2xl group active:scale-[0.98]"
          title="Bấm để xem các tiêu chí cần bổ sung minh chứng"
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-700 group-hover:scale-110 transition-transform">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-orange-800">
                    {stats?.revisionRequested ?? 0}
                  </p>
                  <p className="text-xs text-slate-700 font-bold">Cần bổ sung</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>

        {/* Chưa nộp -> Tiêu chí */}
        <Card
          onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
          className="border-slate-200 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer rounded-2xl group active:scale-[0.98]"
          title="Bấm để tiếp tục hoàn thiện tiêu chí"
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-950">
                    {stats?.remaining ?? 0}
                  </p>
                  <p className="text-xs text-slate-700 font-bold">Chưa nộp</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-800 group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Hub - Lối tắt tác vụ nhanh */}
      <div>
        <h2 className="text-sm font-extrabold text-slate-950 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-700" />
          Lối tắt tác vụ
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tự chấm & Nộp minh chứng */}
          <div
            onClick={() => navigate(period?.id ? `/user/criteria?period=${period.id}` : "/user/criteria")}
            className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-slate-950 group-hover:text-emerald-800 transition-colors">
                  Tự chấm & Minh chứng
                </h3>
                <p className="text-[11px] text-slate-600 truncate font-medium">
                  Nộp tài liệu theo tiêu chí
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          {/* Điểm cộng thi đua */}
          <div
            onClick={() => navigate("/user/bonus")}
            className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-slate-950 group-hover:text-emerald-800 transition-colors">
                  Điểm cộng thi đua
                </h3>
                <p className="text-[11px] text-slate-600 truncate font-medium">
                  Đề xuất điểm thưởng phong trào
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          {/* Kết quả đánh giá */}
          <div
            onClick={() => navigate(period?.id ? `/user/results?period=${period.id}` : "/user/results")}
            className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-lime-100 text-lime-900 flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                <Trophy className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-slate-950 group-hover:text-emerald-800 transition-colors">
                  Kết quả đánh giá
                </h3>
                <p className="text-[11px] text-slate-600 truncate font-medium">
                  Bảng điểm & điểm chính thức
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>

          {/* Hộp thư thông báo */}
          <div
            onClick={() => navigate("/user/notifications")}
            className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center group-hover:bg-teal-700 group-hover:text-white transition-colors">
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-slate-950 group-hover:text-emerald-800 transition-colors">
                  Hộp thư thông báo
                </h3>
                <p className="text-[11px] text-slate-600 truncate font-medium">
                  Phản hồi từ Hội đồng Đội
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Notifications (Clickable) */}
      <Card className="border-emerald-200 shadow-2xs rounded-2xl">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-950">
            <Bell className="h-4 w-4 text-emerald-700" />
            Thông báo mới nhận
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-slate-900 font-bold hover:text-emerald-800 hover:bg-emerald-50 rounded-lg gap-1"
            onClick={() => navigate("/user/notifications")}
          >
            <span>Xem tất cả</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {!notifications || notifications.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-600 font-medium">
              Không có thông báo mới nào.
            </div>
          ) : (
            <div className="divide-y divide-emerald-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => navigate("/user/notifications")}
                  className="py-3 px-2 flex items-center justify-between text-xs rounded-xl hover:bg-emerald-50/70 cursor-pointer transition-colors group"
                >
                  <div className="space-y-0.5 pr-2">
                    <p className="font-bold text-slate-950 group-hover:text-emerald-900 transition-colors">
                      {n.title}
                    </p>
                    <p className="text-slate-700 line-clamp-1 text-[11px] font-medium">{n.message}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 font-mono font-medium">
                      {new Date(n.created_at).toLocaleDateString("vi-VN")}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
