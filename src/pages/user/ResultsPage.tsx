import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { PeriodCriterion, Submission, BonusRequest, EvaluationPeriod } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  Award,
  CheckCircle2,
  Clock,
  Layers,
  Building,
  TrendingUp,
  Loader2,
  Calendar,
  Sparkles,
  AlertCircle,
} from "lucide-react";

export default function UserResultsPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodParam = searchParams.get("period");

  // 1. Fetch ALL evaluation periods for filtering
  const { data: allPeriods, isLoading: periodsLoading } = useQuery({
    queryKey: ["user_results_all_periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluation_periods")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EvaluationPeriod[];
    },
  });

  // Determine currently selected period id
  const selectedPeriodId = useMemo(() => {
    if (!allPeriods || allPeriods.length === 0) return "";
    if (periodParam && allPeriods.some((p) => p.id === periodParam)) {
      return periodParam;
    }
    // Default to active period, or the most recent period
    const active = allPeriods.find((p) => p.status === "active");
    return active ? active.id : allPeriods[0].id;
  }, [allPeriods, periodParam]);

  const selectedPeriod = useMemo(() => {
    return allPeriods?.find((p) => p.id === selectedPeriodId) || null;
  }, [allPeriods, selectedPeriodId]);

  const handlePeriodChange = (newPeriodId: string) => {
    setSearchParams({ period: newPeriodId });
  };

  // 2. Fetch criteria for the selected period
  const { data: criteria, isLoading: criteriaLoading } = useQuery({
    queryKey: ["user_results_criteria", selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return [];
      const [critRes, libRes] = await Promise.all([
        supabase
          .from("period_criteria")
          .select("*")
          .eq("period_id", selectedPeriodId)
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
    enabled: !!selectedPeriodId,
  });

  // 3. Fetch submissions for org in the selected period
  const { data: submissions, isLoading: subsLoading } = useQuery({
    queryKey: ["user_results_submissions", selectedPeriodId, profile?.organization_id],
    queryFn: async () => {
      if (!selectedPeriodId || !profile?.organization_id) return [];
      const { data: orgPeriod } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", selectedPeriodId)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();

      if (!orgPeriod) return [];

      const { data: subs } = await supabase
        .from("submissions")
        .select("*, current_revision:submission_revisions(self_score)")
        .eq("organization_period_id", orgPeriod.id);

      return (subs ?? []) as (Submission & { current_revision?: { self_score: number | null } | null })[];
    },
    enabled: !!selectedPeriodId && !!profile?.organization_id,
  });

  // 4. Fetch approved bonus requests for org in the selected period
  const { data: bonusRequests } = useQuery({
    queryKey: ["user_results_bonus", selectedPeriodId, profile?.organization_id],
    queryFn: async () => {
      if (!selectedPeriodId || !profile?.organization_id) return [];
      const { data: orgPeriod } = await supabase
        .from("organization_periods")
        .select("id")
        .eq("period_id", selectedPeriodId)
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
    enabled: !!selectedPeriodId && !!profile?.organization_id,
  });

  // Formula Calculations:
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

  // Total self score (for reference)
  const selfScoreTotal = useMemo(() => {
    return (submissions ?? []).reduce((acc, s) => {
      const score = s.current_revision?.self_score;
      return acc + (score ? Number(score) : 0);
    }, 0);
  }, [submissions]);

  // Final Official Score = Verified Criteria Score + Approved Bonus Score
  const finalScore = verifiedCriteriaScore + approvedBonusScore;

  // Maximum possible criteria score
  const maxPossibleScore = useMemo(() => {
    return (criteria ?? []).reduce((acc, c) => acc + (c.max_score_snapshot || 0), 0);
  }, [criteria]);

  // Counts
  const totalCriteria = criteria?.length || 0;
  const verifiedCount = (submissions ?? []).filter((s) => s.status === "verified").length;
  const pendingCount = (submissions ?? []).filter((s) => s.status === "submitted").length;
  const revisionCount = (submissions ?? []).filter((s) => s.status === "revision_requested").length;
  const unsubmittedCount = Math.max(0, totalCriteria - ((submissions ?? []).length));

  const isLoadingData = periodsLoading || criteriaLoading || subsLoading;

  return (
    <div className="space-y-6">
      {/* Header & Filter by Evaluation Period */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-emerald-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Kết quả đánh giá
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Building className="h-4 w-4 text-emerald-600" />
            Đơn vị: <b className="text-slate-800">{profile?.display_name || "Liên đội"}</b>
          </p>
        </div>

        {/* Evaluation Period Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 bg-white p-2.5 rounded-2xl border border-emerald-100 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 shrink-0 px-1">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <span>Đợt đánh giá:</span>
          </div>

          <Select
            value={selectedPeriodId}
            onValueChange={handlePeriodChange}
            disabled={periodsLoading || !allPeriods || allPeriods.length === 0}
          >
            <SelectTrigger className="w-full sm:w-[280px] bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 text-xs font-semibold rounded-xl h-9">
              <SelectValue placeholder="Chọn đợt đánh giá..." />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-xl">
              {(allPeriods ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs py-2">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                        p.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.status === "closed"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {p.status === "active" ? "Đang mở" : p.status === "closed" ? "Đã đóng" : "Dự thảo"}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Score Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Official Score Card - Natural, friendly, non-AI styling */}
        <Card className="border border-emerald-200/90 bg-gradient-to-br from-emerald-50/80 via-white to-lime-50/60 shadow-sm rounded-2xl overflow-hidden md:col-span-1">
          <CardHeader className="pb-3 bg-white/70 border-b border-emerald-100/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <Award className="h-4 w-4 text-emerald-600" />
                Tổng điểm chính thức
              </span>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px] font-semibold">
                {selectedPeriod?.status === "active" ? "Đang thẩm định" : "Kết quả chính thức"}
              </Badge>
            </div>
            <CardTitle className="text-4xl font-black text-emerald-800 flex items-baseline gap-2 pt-3">
              {finalScore.toFixed(2)}
              <span className="text-sm font-normal text-slate-600">/ {maxPossibleScore} điểm</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-xs text-slate-700">
            <div className="flex justify-between items-center py-1.5 border-b border-emerald-50">
              <span className="text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Điểm tiêu chí thẩm định:
              </span>
              <b className="text-emerald-700 font-bold text-sm">{verifiedCriteriaScore.toFixed(2)}đ</b>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-emerald-50">
              <span className="text-slate-600 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Điểm thưởng thi đua:
              </span>
              <b className="text-emerald-700 font-bold text-sm">+{approvedBonusScore.toFixed(2)}đ</b>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                Điểm Liên đội tự chấm:
              </span>
              <span className="text-slate-600 font-semibold">{selfScoreTotal.toFixed(2)}đ</span>
            </div>

            <div className="rounded-xl bg-emerald-50/80 p-3 border border-emerald-100 mt-2">
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                💡 <b>Ghi chú:</b> Tổng điểm chính thức được tính dựa trên các tiêu chí đã được Hội đồng Đội thẩm định đạt yêu cầu cùng các điểm thưởng phong trào được phê duyệt.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Status Breakdown */}
        <Card className="md:col-span-2 border-emerald-100/90 shadow-2xs rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Tình trạng thẩm định tiêu chí
            </CardTitle>
            <CardDescription className="text-xs">
              Tiến độ xét duyệt hồ sơ minh chứng của Hội đồng Đội cấp trên
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200">
              <span className="text-xs text-emerald-800 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Đã xác thực
              </span>
              <span className="text-2xl font-black text-emerald-700 block mt-1">
                {verifiedCount} <span className="text-xs font-normal text-emerald-600">tiêu chí</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200">
              <span className="text-xs text-amber-800 font-semibold flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Chờ thẩm định
              </span>
              <span className="text-2xl font-black text-amber-700 block mt-1">
                {pendingCount} <span className="text-xs font-normal text-amber-600">tiêu chí</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-orange-50/80 border border-orange-200">
              <span className="text-xs text-orange-800 font-semibold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                Cần bổ sung
              </span>
              <span className="text-2xl font-black text-orange-700 block mt-1">
                {revisionCount} <span className="text-xs font-normal text-orange-600">tiêu chí</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-600 font-semibold flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                Chưa nộp
              </span>
              <span className="text-2xl font-black text-slate-700 block mt-1">
                {unsubmittedCount} <span className="text-xs font-normal text-slate-500">tiêu chí</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Criteria Score Table */}
      <Card className="border-emerald-100 shadow-2xs rounded-2xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-emerald-50 bg-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Layers className="h-4 w-4 text-emerald-600" />
              Chi tiết kết quả từng tiêu chí ({totalCriteria} tiêu chí)
            </CardTitle>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Đợt: <b className="text-slate-800">{selectedPeriod?.name || "Đang tải..."}</b>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingData ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-600" />
              <p>Đang tổng hợp kết quả đánh giá...</p>
            </div>
          ) : (criteria ?? []).length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu tiêu chí đánh giá cho đợt này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-emerald-50/40">
                  <TableRow className="border-emerald-100">
                    <TableHead className="w-[80px] font-semibold text-emerald-950">Mã</TableHead>
                    <TableHead className="font-semibold text-emerald-950">Nội dung tiêu chí</TableHead>
                    <TableHead className="w-[160px] font-semibold text-emerald-950">Lĩnh vực / Nhóm</TableHead>
                    <TableHead className="w-[100px] text-center font-semibold text-emerald-950">Tối đa</TableHead>
                    <TableHead className="w-[110px] text-center font-semibold text-emerald-950">Tự chấm</TableHead>
                    <TableHead className="w-[130px] text-center font-semibold text-emerald-950">Điểm chính thức</TableHead>
                    <TableHead className="w-[120px] font-semibold text-emerald-950">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(criteria ?? []).map((c) => {
                    const sub = (submissions ?? []).find((s) => s.period_criteria_id === c.id);
                    const isVerified = sub?.status === "verified";

                    return (
                      <TableRow key={c.id} className="hover:bg-emerald-50/30 transition-colors">
                        <TableCell className="font-mono text-xs font-bold text-emerald-900">
                          {c.code_snapshot}
                        </TableCell>
                        <TableCell className="text-xs font-medium max-w-md text-slate-800">
                          {c.title_snapshot}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.category_name_snapshot || "—"}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-xs text-slate-700">
                          {c.max_score_snapshot}đ
                        </TableCell>
                        <TableCell className="text-center text-xs text-emerald-800 font-semibold">
                          {sub?.current_revision?.self_score !== undefined && sub?.current_revision?.self_score !== null
                            ? `${Number(sub.current_revision.self_score).toFixed(2)}đ`
                            : sub
                            ? "Đã nộp"
                            : "—"}
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold">
                          {isVerified ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              {sub?.admin_score}đ
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Chờ duyệt</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isVerified ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">Đã xác thực</Badge>
                          ) : sub?.status === "submitted" ? (
                            <Badge className="bg-teal-600 hover:bg-teal-600 text-white text-[10px]">Đã nộp</Badge>
                          ) : sub?.status === "revision_requested" ? (
                            <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px]">Cần bổ sung</Badge>
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
