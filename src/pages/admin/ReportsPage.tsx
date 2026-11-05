import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EvaluationPeriod, Organization } from "@/types/database";
import ExcelJS from "exceljs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Download,
  Printer,
  Building2,
  Calendar,
  Trophy,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface OrgRanking {
  id: string;
  code: string;
  name: string;
  submittedCriteria: number;
  verifiedCriteria: number;
  criteriaScore: number;
  bonusScore: number;
  finalScore: number;
}

export default function ReportsPage() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [showRanking, setShowRanking] = useState<boolean>(true); // PRD: admin can toggle ranking
  const [exportingExcel, setExportingExcel] = useState(false);

  // 1. Fetch periods
  const { data: periods } = useQuery({
    queryKey: ["reports_periods"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluation_periods")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as EvaluationPeriod[];
    },
  });

  // Default period
  const activePeriodId = selectedPeriodId || (periods?.[0]?.id ?? "");
  const currentPeriod = periods?.find((p) => p.id === activePeriodId);

  // 2. Fetch Organizations & Submissions & Bonus
  const { data: rankings, isLoading } = useQuery({
    queryKey: ["reports_rankings", activePeriodId],
    queryFn: async (): Promise<OrgRanking[]> => {
      if (!activePeriodId) return [];

      const { data: orgPeriods } = await supabase
        .from("organization_periods")
        .select("id, organization:organizations(*)")
        .eq("period_id", activePeriodId);

      if (!orgPeriods || orgPeriods.length === 0) return [];

      const result: OrgRanking[] = [];

      for (const op of orgPeriods) {
        const org: any = op.organization;
        if (!org) continue;

        // Fetch submissions
        const { data: subs } = await supabase
          .from("submissions")
          .select("status, admin_score")
          .eq("organization_period_id", op.id);

        // Fetch bonus
        const { data: bonus } = await supabase
          .from("bonus_requests")
          .select("approved_score")
          .eq("organization_period_id", op.id)
          .eq("status", "approved");

        const submittedCount = (subs ?? []).filter((s) => s.status === "submitted" || s.status === "verified").length;
        const verifiedCount = (subs ?? []).filter((s) => s.status === "verified").length;
        const criteriaScore = (subs ?? [])
          .filter((s) => s.status === "verified" && s.admin_score !== null)
          .reduce((acc, s) => acc + (s.admin_score || 0), 0);

        const bonusScore = (bonus ?? []).reduce((acc, b) => acc + (b.approved_score || 0), 0);
        const finalScore = criteriaScore + bonusScore;

        result.push({
          id: org.id,
          code: org.code,
          name: org.name,
          submittedCriteria: submittedCount,
          verifiedCriteria: verifiedCount,
          criteriaScore,
          bonusScore,
          finalScore,
        });
      }

      // Sort by final score descending
      return result.sort((a, b) => b.finalScore - a.finalScore);
    },
    enabled: !!activePeriodId,
  });

  // Export to Excel
  const handleExportExcel = async () => {
    if (!rankings || rankings.length === 0) {
      toast.error("Không có dữ liệu để xuất Excel.");
      return;
    }

    setExportingExcel(true);
    try {
      const periodName = currentPeriod?.name || "Dot_Danh_Gia";
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Bao_Cao_Xep_Hang");

      // Title banner
      sheet.mergeCells("A1:I1");
      sheet.getCell("A1").value = "HỆ THỐNG QUẢN LÝ TIÊU CHÍ & MINH CHỨNG CÔNG TÁC ĐỘI";
      sheet.getCell("A1").font = { name: "Arial", size: 12, bold: true, color: { argb: "FF1E3A8A" } };
      sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };

      sheet.mergeCells("A2:I2");
      sheet.getCell("A2").value = `BẢNG TỔNG HỢP KẾT QUẢ THI ĐUA - ${periodName.toUpperCase()}`;
      sheet.getCell("A2").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };
      sheet.getCell("A2").alignment = { vertical: "middle", horizontal: "center" };

      sheet.mergeCells("A3:I3");
      sheet.getCell("A3").value = `Thời gian xuất: ${new Date().toLocaleString("vi-VN")}`;
      sheet.getCell("A3").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
      sheet.getCell("A3").alignment = { vertical: "middle", horizontal: "center" };

      sheet.addRow([]);

      // Headers
      const headerRow = sheet.addRow([
        "Hạng",
        "Mã đơn vị",
        "Tên Liên đội",
        "Tiêu chí đã nộp",
        "Tiêu chí đã duyệt",
        "Điểm tiêu chí",
        "Điểm thưởng",
        "Tổng điểm",
        "Xếp loại thi đua",
      ]);

      headerRow.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E40AF" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Data rows
      rankings.forEach((r, idx) => {
        let classification = "Chưa hoàn thành nhiệm vụ";
        if (r.finalScore >= 90) classification = "Hoàn thành xuất sắc nhiệm vụ";
        else if (r.finalScore >= 70) classification = "Hoàn thành tốt nhiệm vụ";
        else if (r.finalScore >= 50) classification = "Hoàn thành nhiệm vụ";

        const row = sheet.addRow([
          idx + 1,
          r.code,
          r.name,
          `${r.submittedCriteria} TC`,
          `${r.verifiedCriteria} TC`,
          Number(r.criteriaScore.toFixed(2)),
          Number(r.bonusScore.toFixed(2)),
          Number(r.finalScore.toFixed(2)),
          classification,
        ]);

        row.getCell(1).alignment = { horizontal: "center" };
        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(4).alignment = { horizontal: "center" };
        row.getCell(5).alignment = { horizontal: "center" };
        row.getCell(6).numFmt = "#,##0.00";
        row.getCell(7).numFmt = "+#,##0.00";
        row.getCell(8).numFmt = "#,##0.00";
        row.getCell(8).font = { bold: true };
        row.getCell(9).alignment = { horizontal: "center" };

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });
      });

      // Column widths
      sheet.columns = [
        { width: 10 },
        { width: 14 },
        { width: 36 },
        { width: 18 },
        { width: 18 },
        { width: 16 },
        { width: 14 },
        { width: 16 },
        { width: 32 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_Cao_Xep_Hang_${periodName.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất file Excel báo cáo thành công!");
    } catch (err) {
      toast.error("Lỗi xuất Excel: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Báo cáo & thống kê
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tổng hợp kết quả thi đua, xếp hạng Liên đội và xuất báo cáo tổng kết
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={activePeriodId} onValueChange={setSelectedPeriodId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Chọn đợt đánh giá" />
            </SelectTrigger>
            <SelectContent>
              {(periods ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className="gap-2 shrink-0 border-slate-300"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" />
            In / PDF
          </Button>

          <Button
            variant="default"
            className="gap-2 shrink-0 bg-blue-700 hover:bg-blue-800 text-white"
            onClick={handleExportExcel}
            disabled={exportingExcel}
          >
            {exportingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Xuất Excel báo cáo
          </Button>
        </div>
      </div>

      {/* Admin Setting: Toggle Ranking */}
      <Card className="bg-slate-50 border-slate-200 print:hidden">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-600" />
            <span className="text-xs sm:text-sm font-semibold text-slate-800">
              Chế độ hiển thị bảng xếp hạng thứ hạng thi đua
            </span>
            <span className="text-xs text-muted-foreground hidden md:inline">
              (Theo quy chuẩn PRD, Admin có thể bật/tắt hiển thị xếp hạng thi đua)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{showRanking ? "Đang bật" : "Đã tắt"}</span>
            <Switch checked={showRanking} onCheckedChange={setShowRanking} />
          </div>
        </CardContent>
      </Card>

      {/* Print-only official header */}
      <div className="hidden print:block text-center space-y-1 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          ĐỘI TNTP HỒ CHÍ MINH
        </p>
        <h2 className="text-lg font-bold text-slate-900 uppercase">
          BẢNG TỔNG HỢP KẾT QUẢ XẾP HẠNG THI ĐUA CÔNG TÁC ĐỘI
        </h2>
        <p className="text-sm font-medium text-slate-700">
          Đợt đánh giá: {currentPeriod?.name || "Tất cả"}
        </p>
        <p className="text-xs text-slate-500 italic">
          Thời điểm xuất báo cáo: {new Date().toLocaleString("vi-VN")}
        </p>
      </div>

      {/* Rankings Table */}
      <Card className="print:shadow-none print:border-none">
        <CardHeader className="pb-3 print:hidden">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Bảng tổng hợp xếp hạng kết quả đánh giá ({rankings?.length || 0} đơn vị)
          </CardTitle>
          <CardDescription>
            Điểm chính thức = Tổng điểm tiêu chí đã xác thực + Điểm cộng đã duyệt
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tổng hợp báo cáo...</p>
            </div>
          ) : (rankings ?? []).length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Building2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Chưa có dữ liệu đánh giá cho đợt này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {showRanking && <TableHead className="w-[80px] text-center">Hạng</TableHead>}
                    <TableHead className="w-[100px]">Mã đơn vị</TableHead>
                    <TableHead>Tên Liên đội</TableHead>
                    <TableHead className="w-[120px] text-center">Đã nộp</TableHead>
                    <TableHead className="w-[130px] text-center">Đã xác thực</TableHead>
                    <TableHead className="w-[120px] text-center">Điểm tiêu chí</TableHead>
                    <TableHead className="w-[110px] text-center">Điểm cộng</TableHead>
                    <TableHead className="w-[130px] text-center font-bold">Tổng điểm</TableHead>
                    <TableHead className="w-[160px] text-center">Xếp loại</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings?.map((r, idx) => {
                    let classification = "Chưa HT";
                    let classificationColor = "text-slate-600";
                    if (r.finalScore >= 90) {
                      classification = "Hoàn thành xuất sắc";
                      classificationColor = "text-emerald-700 font-semibold";
                    } else if (r.finalScore >= 70) {
                      classification = "Hoàn thành tốt";
                      classificationColor = "text-blue-700 font-medium";
                    } else if (r.finalScore >= 50) {
                      classification = "Hoàn thành";
                      classificationColor = "text-slate-700";
                    }

                    return (
                      <TableRow key={r.id} className={idx < 3 && showRanking ? "bg-amber-50/40" : undefined}>
                        {showRanking && (
                          <TableCell className="text-center font-bold">
                            {idx === 0 && <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-400 text-slate-900 text-xs shadow-xs">1</span>}
                            {idx === 1 && <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-300 text-slate-800 text-xs shadow-xs">2</span>}
                            {idx === 2 && <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-700 text-white text-xs shadow-xs">3</span>}
                            {idx > 2 && <span className="text-slate-500 text-xs">{idx + 1}</span>}
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs font-semibold">{r.code}</TableCell>
                        <TableCell className="font-medium text-slate-900">{r.name}</TableCell>
                        <TableCell className="text-center text-xs text-blue-700 font-medium">{r.submittedCriteria} TC</TableCell>
                        <TableCell className="text-center text-xs text-emerald-700 font-medium">{r.verifiedCriteria} TC</TableCell>
                        <TableCell className="text-center text-xs font-semibold">{r.criteriaScore.toFixed(2)}đ</TableCell>
                        <TableCell className="text-center text-xs text-emerald-600 font-semibold">+{r.bonusScore.toFixed(2)}đ</TableCell>
                        <TableCell className="text-center text-sm font-extrabold text-blue-800">
                          {r.finalScore.toFixed(2)}đ
                        </TableCell>
                        <TableCell className={`text-center text-xs ${classificationColor}`}>
                          {classification}
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

      {/* Print-only signature section */}
      <div className="hidden print:grid grid-cols-3 text-center text-xs font-medium pt-12 mt-8 border-t border-slate-300">
        <div>
          <p className="font-bold uppercase">NGƯỜI LẬP BIỂU</p>
          <p className="italic text-slate-500 mt-1">(Ký và ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="font-bold uppercase">HỘI ĐỒNG THẨM ĐỊNH</p>
          <p className="italic text-slate-500 mt-1">(Ký và ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="font-bold uppercase">TM. BAN THƯỜNG VỤ ĐOÀN CẤP TRÊN</p>
          <p className="italic text-slate-500 mt-1">(Ký tên và đóng dấu)</p>
        </div>
      </div>
    </div>
  );
}
