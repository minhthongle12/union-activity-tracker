import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { PeriodCriterion, Submission, BonusRequest, EvaluationPeriod } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Award,
  CheckCircle2,
  Clock,
  Layers,
  Building,
  TrendingUp,
  Loader2,
} from "lucide-react";

export default function UserResultsPage() {
  const { profile } = useAuth();

  // 1. Fetch active period
  const { data: period, isLoading: periodLoading } = useQuery({
    queryKey: ["user_results_period"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluation_periods")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as EvaluationPeriod | null;
    },
  });

  // 2. Fetch criteria for period (excluding locked or deleted)
  const { data: criteria, isLoading: criteriaLoading } = useQuery({
    queryKey: ["user_results_criteria", period?.id],
    queryFn: async () => {
      if (!period) return [];
      const [critRes, libRes] = await Promise.all([
        supabase
          .from("period_criteria")
          .select("*")
          .eq("period_id", period.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("criteria_library")
          .select("id, is_active"),
      ]);
      const libMap = new Map((libRes.data ?? []).map((l) => [l.id, l.is_active]));
      return (critRes.data ?? []).filter((c) => {
        if (!c.source_criteria_id) return true;
        return libMap.get(c.source_criteria_id) === true;
      }) as PeriodCriterion[];
    },
    enabled: !!period?.id,
  });

  // 3. Fetch submissions for org
  const { data: submissions, isLoading: subsLoading } = useQuery({
    queryKey: ["user_results_submissions", period?.id, profile?.organization_id],
    queryFn: async () => {
      if (!period || !profile?.organization_id) return [];
      const { data: orgPeriod } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", period.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (!orgPeriod) return [];

      const { data: subs } = await supabase
        .from("submissions")
        .select("*, current_revision:submission_revisions(self_score)")
        .eq("organization_period_id", orgPeriod.id);

      return (subs ?? []) as (Submission & { current_revision?: { self_score: number | null } | null })[];
    },
    enabled: !!period?.id && !!profile?.organization_id,
  });

  // 4. Fetch approved bonus requests for org
  const { data: bonusRequests } = useQuery({
    queryKey: ["user_results_bonus", period?.id, profile?.organization_id],
    queryFn: async () => {
      if (!period || !profile?.organization_id) return [];
      const { data: orgPeriod } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", period.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (!orgPeriod) return [];

      const { data: bonus } = await supabase
        .from("bonus_requests")
        .select("*")
        .eq("organization_period_id", orgPeriod.id)
        .eq("status", "approved");

      return (bonus ?? []) as BonusRequest[];
    },
    enabled: !!period?.id && !!profile?.organization_id,
  });

  // PRD Part 12 Formula Calculations:
  // Verified Criteria Score = Sum of official scores of verified criteria
  const verifiedCriteriaScore = useMemo(() => {
    return (submissions ?? [])
      .filter((s) => s.status === "verified" && s.admin_score !== null)
      .reduce((acc, s) => acc + (s.admin_score || 0), 0);
  }, [submissions]);

  // Approved Bonus Score = Sum of approved bonus requests
  const approvedBonusScore = useMemo(() => {
    return (bonusRequests ?? []).reduce((acc, b) => acc + (b.approved_score || 0), 0);
  }, [bonusRequests]);

  // Final Score = Verified Criteria Score + Approved Bonus Score
  const finalScore = verifiedCriteriaScore + approvedBonusScore;

  // Maximum possible criteria score
  const maxPossibleScore = useMemo(() => {
    return (criteria ?? []).reduce((acc, c) => acc + (c.max_score_snapshot || 0), 0);
  }, [criteria]);

  // Counts
  const totalCriteria = criteria?.length || 0;
  const verifiedCount = (submissions ?? []).filter((s) => s.status === "verified").length;
  const pendingCount = (submissions ?? []).filter((s) => s.status === "submitted").length;
  const unsubmittedCount = totalCriteria - ((submissions ?? []).length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Kết quả đánh giá
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
          <Building className="h-4 w-4" />
          Đơn vị: <b className="text-slate-800">{profile?.display_name || "Đoàn cơ sở"}</b>
          <span>•</span>
          <span>{period?.name || "Kỳ đánh giá"}</span>
        </p>
      </div>

      {/* Main Score Board (PRD Part 12) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Final Score Card */}
        <Card className="border-2 border-blue-600 bg-gradient-to-br from-blue-900 to-slate-900 text-white shadow-md md:col-span-1">
          <CardHeader className="pb-2">
            <span className="text-xs uppercase font-bold tracking-wider text-blue-200">
              Tổng điểm chính thức (Final Score)
            </span>
            <CardTitle className="text-4xl font-extrabold text-white flex items-baseline gap-2 pt-2">
              {finalScore.toFixed(2)}
              <span className="text-sm font-normal text-blue-200">/ {maxPossibleScore} điểm</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-blue-100 pt-2 border-t border-blue-800/60">
            <div className="flex justify-between">
              <span>Điểm tiêu chí thẩm định:</span>
              <b className="text-white">{verifiedCriteriaScore.toFixed(2)}đ</b>
            </div>
            <div className="flex justify-between">
              <span>Điểm cộng thi đua:</span>
              <b className="text-emerald-400">+{approvedBonusScore.toFixed(2)}đ</b>
            </div>
            <p className="text-[11px] text-blue-300 pt-1 italic">
              * Điểm tự chấm không được tính vào tổng điểm chính thức.
            </p>
          </CardContent>
        </Card>

        {/* Detailed Status Breakdown */}
        <Card className="md:col-span-2 border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Tình trạng thẩm định tiêu chí
            </CardTitle>
            <CardDescription>
              Tiến độ xét duyệt của Hội đồng thẩm định cấp trên
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-xs text-emerald-800 font-medium block">Đã xác thực</span>
              <span className="text-2xl font-bold text-emerald-700 block mt-0.5">
                {verifiedCount} <span className="text-xs font-normal">tiêu chí</span>
              </span>
            </div>

            <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
              <span className="text-xs text-orange-800 font-medium block">Chờ thẩm định</span>
              <span className="text-2xl font-bold text-orange-700 block mt-0.5">
                {pendingCount} <span className="text-xs font-normal">tiêu chí</span>
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-600 font-medium block">Chưa nộp</span>
              <span className="text-2xl font-bold text-slate-800 block mt-0.5">
                {unsubmittedCount} <span className="text-xs font-normal">tiêu chí</span>
              </span>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-xs text-blue-800 font-medium block">Điểm thưởng</span>
              <span className="text-2xl font-bold text-blue-700 block mt-0.5">
                +{approvedBonusScore} <span className="text-xs font-normal">điểm</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Criteria Score Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-600" />
            Chi tiết kết quả từng tiêu chí
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {periodLoading || criteriaLoading || subsLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tổng hợp kết quả đánh giá...</p>
            </div>
          ) : (criteria ?? []).length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu tiêu chí đánh giá.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Mã</TableHead>
                    <TableHead>Nội dung tiêu chí</TableHead>
                    <TableHead className="w-[160px]">Nhóm</TableHead>
                    <TableHead className="w-[100px] text-center">Tối đa</TableHead>
                    <TableHead className="w-[110px] text-center">Tự chấm</TableHead>
                    <TableHead className="w-[130px] text-center">Điểm chính thức</TableHead>
                    <TableHead className="w-[120px]">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(criteria ?? []).map((c) => {
                    const sub = (submissions ?? []).find((s) => s.period_criteria_id === c.id);
                    const isVerified = sub?.status === "verified";

                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs font-semibold text-slate-900">
                          {c.code_snapshot}
                        </TableCell>
                        <TableCell className="text-xs font-medium max-w-md">
                          {c.title_snapshot}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.category_name_snapshot || "—"}
                        </TableCell>
                        <TableCell className="text-center font-medium text-xs">
                          {c.max_score_snapshot}đ
                        </TableCell>
                        <TableCell className="text-center text-xs text-blue-700 font-semibold">
                          {sub?.current_revision?.self_score !== undefined && sub?.current_revision?.self_score !== null
                            ? `${Number(sub.current_revision.self_score).toFixed(2)}đ`
                            : sub
                            ? "Đã nộp"
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">
                          {isVerified ? (
                            <span className="text-emerald-700 font-bold">{sub?.admin_score}đ</span>
                          ) : (
                            <span className="text-slate-400 font-normal">Chờ duyệt</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isVerified ? (
                            <Badge className="bg-emerald-600 text-white text-[10px]">Đã xác thực</Badge>
                          ) : sub?.status === "submitted" ? (
                            <Badge className="bg-blue-600 text-white text-[10px]">Đã nộp</Badge>
                          ) : sub?.status === "revision_requested" ? (
                            <Badge className="bg-amber-600 text-white text-[10px]">Cần bổ sung</Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 text-[10px]">Chưa nộp</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
