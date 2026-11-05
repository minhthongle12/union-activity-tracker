import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface ImportRow {
  rowIndex: number;
  categoryCode: string;
  categoryName: string;
  criterionCode: string;
  criterionTitle: string;
  description: string;
  scoringGuidelines: string;
  maxScore: number;
  reqDoc1: boolean;
  reqDoc2: boolean;
  reqLink3: boolean;
  responsibleUnit: string;
  deadline: string;
  displayOrder: number;
  errors: string[];
}

export default function ImportExportPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [hasErrors, setHasErrors] = useState(false);

  // ============================================================
  // Download Template
  // ============================================================
  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Bo_Tieu_Chi_Chuan");

    sheet.columns = [
      { header: "Category_Code", key: "Category_Code", width: 16 },
      { header: "Category_Name", key: "Category_Name", width: 30 },
      { header: "Criterion_Code", key: "Criterion_Code", width: 16 },
      { header: "Criterion_Title", key: "Criterion_Title", width: 45 },
      { header: "Description", key: "Description", width: 35 },
      { header: "Scoring_Guidelines", key: "Scoring_Guidelines", width: 35 },
      { header: "Max_Score", key: "Max_Score", width: 12 },
      { header: "Requires_Doc1", key: "Requires_Doc1", width: 15 },
      { header: "Requires_Doc2", key: "Requires_Doc2", width: 15 },
      { header: "Requires_Link3", key: "Requires_Link3", width: 15 },
      { header: "Responsible_Unit", key: "Responsible_Unit", width: 25 },
      { header: "Deadline", key: "Deadline", width: 15 },
      { header: "Display_Order", key: "Display_Order", width: 14 },
    ];

    // Sample data rows
    sheet.addRow({
      Category_Code: "CAT01",
      Category_Name: "Công tác Tuyên giáo",
      Criterion_Code: "1.1",
      Criterion_Title: "Học tập và làm theo tư tưởng đạo đức Hồ Chí Minh",
      Description: "Tổ chức ít nhất 02 chuyên đề trong năm",
      Scoring_Guidelines: "Mỗi chuyên đề đạt yêu cầu được 2.5 điểm",
      Max_Score: 5.0,
      Requires_Doc1: "TRUE",
      Requires_Doc2: "TRUE",
      Requires_Link3: "TRUE",
      Responsible_Unit: "Ban Tuyên giáo",
      Deadline: "2026-11-30",
      Display_Order: 1,
    });

    sheet.addRow({
      Category_Code: "CAT02",
      Category_Name: "Phong trào Tình nguyện",
      Criterion_Code: "2.1",
      Criterion_Title: "Liên đội đồng loạt tổ chức Ngày hội Thiếu nhi vui khỏe - Tiến bước lên Đoàn",
      Description: "Tham gia các đợt ra quân và phong trào Đội",
      Scoring_Guidelines: "1 điểm / mỗi đợt có báo cáo và hình ảnh",
      Max_Score: 4.0,
      Requires_Doc1: "TRUE",
      Requires_Doc2: "TRUE",
      Requires_Link3: "FALSE",
      Responsible_Unit: "Ban Phong trào",
      Deadline: "2026-12-15",
      Display_Order: 2,
    });

    // Style headers
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mau_Nhap_Tieu_Chi_Doan.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống file Excel mẫu!");
  };

  // ============================================================
  // Parse Uploaded Excel File
  // ============================================================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setFileName(file.name);
    setPreviewRows([]);

    try {
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error("File Excel không có trang tính nào.");
      }

      // Check headers on row 1
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell) => {
        headers.push(String(cell.value || "").trim());
      });

      const requiredHeaders = ["Criterion_Code", "Criterion_Title", "Max_Score"];
      const missing = requiredHeaders.filter((rh) => !headers.includes(rh));
      if (missing.length > 0) {
        throw new Error(`File thiếu các cột bắt buộc: ${missing.join(", ")}`);
      }

      const rows: ImportRow[] = [];
      const codesSeen = new Set<string>();
      let foundErrors = false;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const getCellVal = (colIndex: number) => {
          const val = row.getCell(colIndex).value;
          if (val === null || val === undefined) return "";
          if (typeof val === "object" && "result" in val) return String(val.result || "");
          return String(val).trim();
        };

        const categoryCode = getCellVal(1);
        const categoryName = getCellVal(2);
        const criterionCode = getCellVal(3);
        const criterionTitle = getCellVal(4);
        const description = getCellVal(5);
        const scoringGuidelines = getCellVal(6);
        const maxScoreRaw = getCellVal(7);
        const reqDoc1Raw = getCellVal(8).toUpperCase();
        const reqDoc2Raw = getCellVal(9).toUpperCase();
        const reqLink3Raw = getCellVal(10).toUpperCase();
        const responsibleUnit = getCellVal(11);
        const deadline = getCellVal(12);
        const displayOrderRaw = getCellVal(13);

        const errors: string[] = [];

        if (!criterionCode) {
          errors.push("Thiếu mã tiêu chí (Criterion_Code)");
        } else if (codesSeen.has(criterionCode.toLowerCase())) {
          errors.push(`Trùng mã tiêu chí trong file: "${criterionCode}"`);
        } else {
          codesSeen.add(criterionCode.toLowerCase());
        }

        if (!criterionTitle) {
          errors.push("Thiếu nội dung tiêu chí (Criterion_Title)");
        }

        const maxScore = parseFloat(maxScoreRaw);
        if (isNaN(maxScore) || maxScore <= 0) {
          errors.push("Điểm tối đa phải là số dương lớn hơn 0");
        }

        if (errors.length > 0) {
          foundErrors = true;
        }

        rows.push({
          rowIndex: rowNumber,
          categoryCode,
          categoryName: categoryName || "Chung",
          criterionCode,
          criterionTitle,
          description,
          scoringGuidelines,
          maxScore: isNaN(maxScore) ? 0 : maxScore,
          reqDoc1: reqDoc1Raw === "TRUE" || reqDoc1Raw === "1",
          reqDoc2: reqDoc2Raw === "TRUE" || reqDoc2Raw === "1",
          reqLink3: reqLink3Raw === "TRUE" || reqLink3Raw === "1",
          responsibleUnit,
          deadline,
          displayOrder: parseInt(displayOrderRaw) || rowNumber - 1,
          errors,
        });
      });

      setPreviewRows(rows);
      setHasErrors(foundErrors);

      if (rows.length === 0) {
        toast.error("File Excel không có dữ liệu nào.");
      } else if (foundErrors) {
        toast.warning(`File có dữ liệu nhưng phát hiện lỗi ở một số dòng.`);
      } else {
        toast.success(`Đọc thành công ${rows.length} tiêu chí!`);
      }
    } catch (err: any) {
      toast.error("Lỗi khi đọc file: " + err.message);
    } finally {
      setParsing(false);
    }
  };

  // ============================================================
  // Commit Import Mutation
  // ============================================================
  const commitImportMutation = useMutation({
    mutationFn: async () => {
      if (previewRows.length === 0) throw new Error("Chưa có dữ liệu để import");

      // 1. Group categories and upsert categories
      const categoryMap = new Map<string, string>(); // name -> id
      const uniqueCats = Array.from(
        new Set(previewRows.map((r) => r.categoryName.trim()).filter(Boolean))
      );

      for (const catName of uniqueCats) {
        // check if exists
        const { data: existing } = await supabase
          .from("criteria_categories")
          .select("id")
          .eq("name", catName)
          .maybeSingle();

        if (existing) {
          categoryMap.set(catName, existing.id);
        } else {
          const { data: inserted, error: catError } = await supabase
            .from("criteria_categories")
            .insert({ name: catName })
            .select("id")
            .single();
          if (catError) throw catError;
          categoryMap.set(catName, inserted.id);
        }
      }

      // 2. Insert valid criteria
      const validRows = previewRows.filter((r) => r.errors.length === 0);
      const criteriaPayload = validRows.map((r) => ({
        code: r.criterionCode,
        title: r.criterionTitle,
        category_id: categoryMap.get(r.categoryName.trim()) || null,
        description: r.description || null,
        scoring_guidelines: r.scoringGuidelines || null,
        max_score: r.maxScore,
        req_doc1: r.reqDoc1,
        req_doc2: r.reqDoc2,
        req_link3: r.reqLink3,
        responsible_unit: r.responsibleUnit || null,
        deadline: r.deadline ? new Date(r.deadline).toISOString() : null,
        sort_order: r.displayOrder,
        is_active: true,
      }));

      const { error: critError } = await supabase
        .from("criteria_library")
        .upsert(criteriaPayload, { onConflict: "code" });
      if (critError) throw critError;

      // 3. Log into import_jobs
      await supabase.from("import_jobs").insert({
        imported_by: profile?.id || null,
        file_name: fileName,
        total_rows: previewRows.length,
        success_rows: validRows.length,
        failed_rows: previewRows.length - validRows.length,
        status: previewRows.length === validRows.length ? "completed" : "partial",
        error_report: previewRows
          .filter((r) => r.errors.length > 0)
          .map((r) => ({ row: r.rowIndex, errors: r.errors })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria_library"] });
      queryClient.invalidateQueries({ queryKey: ["criteria_categories"] });
      toast.success("Import dữ liệu vào thư viện tiêu chí thành công!");
      setPreviewRows([]);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: Error) => toast.error("Lỗi khi import: " + err.message),
  });

  // ============================================================
  // Export Master Criteria
  // ============================================================
  const exportMasterCriteria = async () => {
    try {
      const { data: criteria, error } = await supabase
        .from("criteria_library")
        .select("*, category:criteria_categories(*)")
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Bo_Tieu_Chi_Chinh_Thuc");

      sheet.columns = [
        { header: "STT", key: "stt", width: 8 },
        { header: "Mã tiêu chí", key: "code", width: 15 },
        { header: "Nhóm tiêu chí", key: "category", width: 25 },
        { header: "Nội dung tiêu chí", key: "title", width: 45 },
        { header: "Điểm tối đa", key: "max_score", width: 14 },
        { header: "Văn bản", key: "req_doc1", width: 12 },
        { header: "Báo cáo", key: "req_doc2", width: 12 },
        { header: "Tin bài", key: "req_link3", width: 12 },
        { header: "Đơn vị phụ trách", key: "unit", width: 25 },
        { header: "Trạng thái", key: "status", width: 15 },
      ];

      (criteria ?? []).forEach((c: any, idx) => {
        sheet.addRow({
          stt: idx + 1,
          code: c.code,
          category: c.category?.name || "Chung",
          title: c.title,
          max_score: c.max_score,
          req_doc1: c.req_doc1 ? "Có" : "Không",
          req_doc2: c.req_doc2 ? "Có" : "Không",
          req_link3: c.req_link3 ? "Có" : "Không",
          unit: c.responsible_unit || "",
          status: c.is_active ? "Áp dụng" : "Khóa",
        });
      });

      // Style header
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Danh_Sach_Tieu_Chi_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất danh sách tiêu chí thành công!");
    } catch (err: any) {
      toast.error("Lỗi khi xuất file: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Import / Export Excel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nạp danh sách bộ tiêu chí hàng loạt từ file Excel và xuất báo cáo kết quả theo mẫu chuẩn
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full sm:w-[360px] grid-cols-2">
          <TabsTrigger value="import" className="gap-2">
            <Upload className="h-4 w-4" />
            Nhập tiêu chí (Import)
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="h-4 w-4" />
            Xuất dữ liệu (Export)
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: IMPORT */}
        <TabsContent value="import" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1: Download Template */}
            <Card>
              <CardHeader className="pb-3">
                <Badge variant="outline" className="w-fit mb-1 border-blue-200 text-blue-700 bg-blue-50">
                  Bước 1
                </Badge>
                <CardTitle className="text-base">Tải file mẫu chuẩn</CardTitle>
                <CardDescription>
                  Tải mẫu Excel chuẩn định dạng PRD với đầy đủ cấu trúc 13 cột bắt buộc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full gap-2 border-slate-300" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  Tải file mẫu (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Upload File */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <Badge variant="outline" className="w-fit mb-1 border-emerald-200 text-emerald-700 bg-emerald-50">
                  Bước 2
                </Badge>
                <CardTitle className="text-base">Tải lên file dữ liệu</CardTitle>
                <CardDescription>
                  Chọn file Excel (.xlsx) đã điền dữ liệu tiêu chí để hệ thống kiểm tra và nạp dữ liệu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="excel-file-input"
                  />
                  <label htmlFor="excel-file-input" className="cursor-pointer">
                    <Button variant="secondary" asChild disabled={parsing}>
                      <span>
                        {parsing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {fileName ? "Chọn file khác" : "Chọn file Excel..."}
                      </span>
                    </Button>
                  </label>
                  {fileName && (
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      {fileName}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview Table */}
          {previewRows.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">
                    Xem trước dữ liệu ({previewRows.length} dòng)
                  </CardTitle>
                  <CardDescription>
                    {hasErrors ? (
                      <span className="text-red-600 font-medium flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-4 w-4" />
                        Phát hiện dòng có lỗi dữ liệu. Vui lòng kiểm tra các dòng màu đỏ trước khi nạp.
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-medium flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Dữ liệu hợp lệ, sẵn sàng lưu vào hệ thống.
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button
                  onClick={() => commitImportMutation.mutate()}
                  disabled={commitImportMutation.isPending || previewRows.filter((r) => r.errors.length === 0).length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {commitImportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck className="h-4 w-4" />
                  )}
                  Lưu vào hệ thống
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">Dòng</TableHead>
                        <TableHead className="w-[90px]">Mã</TableHead>
                        <TableHead className="w-[140px]">Nhóm</TableHead>
                        <TableHead>Nội dung tiêu chí</TableHead>
                        <TableHead className="w-[80px] text-center">Điểm</TableHead>
                        <TableHead className="w-[130px]">Minh chứng</TableHead>
                        <TableHead className="w-[200px]">Trạng thái kiểm tra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow
                          key={row.rowIndex}
                          className={row.errors.length > 0 ? "bg-red-50/70" : undefined}
                        >
                          <TableCell className="font-mono text-xs">{row.rowIndex}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{row.criterionCode || "—"}</TableCell>
                          <TableCell className="text-xs">{row.categoryName}</TableCell>
                          <TableCell className="text-xs font-medium">{row.criterionTitle}</TableCell>
                          <TableCell className="text-center font-semibold text-blue-700">{row.maxScore}đ</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            {[
                              row.reqDoc1 ? "VB" : null,
                              row.reqDoc2 ? "BC" : null,
                              row.reqLink3 ? "Tin" : null,
                            ]
                              .filter(Boolean)
                              .join(" + ") || "Không"}
                          </TableCell>
                          <TableCell>
                            {row.errors.length > 0 ? (
                              <div className="space-y-0.5">
                                {row.errors.map((err, i) => (
                                  <p key={i} className="text-xs text-red-600 font-medium">
                                    • {err}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-[10px]">
                                Hợp lệ
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: EXPORT */}
        <TabsContent value="export" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Xuất bộ tiêu chí gốc</CardTitle>
                    <CardDescription>
                      Xuất toàn bộ danh sách tiêu chí hiện có trong thư viện ra file Excel.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button onClick={exportMasterCriteria} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  Xuất file Excel tiêu chí
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Xuất kết quả đánh giá</CardTitle>
                    <CardDescription>
                      Xuất điểm số và tiến độ thẩm định của các Liên đội theo đợt đánh giá.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full gap-2" onClick={() => toast.info("Tính năng xuất kết quả theo đợt sẽ hoạt động sau khi có dữ liệu thẩm định ở Phase 4.")}>
                  <Download className="h-4 w-4" />
                  Xuất báo cáo kết quả
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
