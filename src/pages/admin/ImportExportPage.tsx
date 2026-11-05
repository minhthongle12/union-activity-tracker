import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { saveBonusCriteriaList, DEFAULT_BONUS_CRITERIA, BonusCriterion } from "@/lib/bonusCriteria";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Loader2,
  Sparkles,
  Info,
  Calendar,
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

/**
 * Robustly extract text from an ExcelJS cell value
 * Handles string, number, boolean, Date, RichText, Formulas, and Hyperlinks
 */
function extractCellText(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) return "";
  if (typeof cellValue === "string") return cellValue.trim();
  if (typeof cellValue === "number" || typeof cellValue === "boolean") return String(cellValue).trim();
  if (cellValue instanceof Date) return cellValue.toISOString();

  if (typeof cellValue === "object") {
    // 1. Rich Text: { richText: [{ text: "..." }, ...] }
    if (Array.isArray(cellValue.richText)) {
      return cellValue.richText
        .map((part: any) => (part && typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }
    // 2. Formula with result: { formula: string, result: any }
    if ("result" in cellValue) {
      return extractCellText(cellValue.result);
    }
    // 3. Hyperlink: { text: string, hyperlink: string }
    if ("text" in cellValue && typeof cellValue.text === "string") {
      return cellValue.text.trim();
    }
    if ("hyperlink" in cellValue && typeof cellValue.hyperlink === "string") {
      return cellValue.hyperlink.trim();
    }
    // 4. Fallback if toString is not [object Object]
    const str = String(cellValue);
    if (str !== "[object Object]") {
      return str.trim();
    }
  }

  return "";
}

export default function ImportExportPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [detectedFormat, setDetectedFormat] = useState<"doi_framework" | "technical" | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [hasErrors, setHasErrors] = useState(false);
  const [detectedBonusList, setDetectedBonusList] = useState<BonusCriterion[]>([]);
  const [syncBonus, setSyncBonus] = useState(true);
  const [applyToActivePeriod, setApplyToActivePeriod] = useState(true);

  // Workbook and multiple sheet navigation
  const [workbookRef, setWorkbookRef] = useState<ExcelJS.Workbook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);

  // Fetch active evaluation period
  const { data: activePeriod } = useQuery({
    queryKey: ["admin_active_period"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluation_periods")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // ============================================================
  // Download Template: Mẫu Khung Tiêu Chí Công Tác Đội (Thực tế)
  // ============================================================
  const downloadDoiFrameworkTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Khung_Tieu_Chi_Doi");

    // Title rows
    sheet.addRow(["ĐỘI TNTP HỒ CHÍ MINH"]);
    sheet.addRow(["HỘI ĐỒNG ĐỘI XÃ BẾN LỨC"]);
    sheet.addRow(["KHUNG TIÊU CHÍ ĐÁNH GIÁ, XẾP LOẠI DANH HIỆU 'LIÊN ĐỘI MẠNH'"]);
    sheet.addRow(["* KHUNG ĐIỂM (100 điểm)"]);

    // Header row
    const headerRow = sheet.addRow([
      "TT",
      "Tiêu chí",
      "Nội dung thực hiện",
      "Điểm",
      "Yêu cầu minh chứng",
      "Đường link bài viết về hoạt động",
      "Ghi chú điểm HĐĐ chấm",
    ]);

    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF15803D" }, // Emerald-700
    };

    // Sample data rows matching the actual Excel
    sheet.addRow([
      1,
      "1. Thực hiện chỉ tiêu năm học (16đ)",
      "1.1. Liên đội tổ chức sinh hoạt chuyên đề “Mỗi tuần 01 câu chuyện đẹp; 01 cuốn sách hay; 01 tấm gương sáng”",
      2,
      "- Hội đồng Đội cấp xã theo dõi\n- Hình ảnh đường link bài viết phải có Logo Hội đồng Đội minh chứng rõ nội dung, thời gian, địa điểm.",
      "https://facebook.com/share/...",
      "",
    ]);
    sheet.addRow([
      2,
      "",
      "1.2. Liên đội tổ chức hoạt động, công trình măng non chào mừng kỷ niệm các ngày lễ lớn",
      4,
      "- Hình ảnh đường link bài viết có Logo Hội đồng Đội",
      "",
      "",
    ]);
    sheet.addRow([
      3,
      "",
      "1.3. Liên đội tổ chức cho đội viên, thiếu nhi đến với địa chỉ đỏ.",
      2,
      "- Tổ chức tối thiểu cho 20 học sinh/trường, có bài viết và logo HĐĐ.",
      "",
      "",
    ]);
    sheet.addRow([
      4,
      "",
      "1.4. Liên đội hỗ trợ, giúp đỡ ít nhất 15 thiếu nhi có hoàn cảnh khó khăn.",
      3,
      "- Danh sách học sinh được hỗ trợ kèm hình ảnh bài viết",
      "",
      "",
    ]);
    sheet.addRow([
      5,
      "",
      "1.5. Liên đội triển khai ít nhất 01 mô hình trải nghiệm sáng tạo, trang bị kỹ năng số cho thiếu nhi",
      5,
      "- Báo cáo kết quả và hình ảnh bài viết có logo HĐĐ",
      "",
      "",
    ]);
    sheet.addRow([
      6,
      "2. Phong trào “Thiếu nhi Việt Nam thi đua làm theo 5 điều Bác Hồ dạy” (29đ)",
      "2.1. 100% Liên đội tham gia hoạt động tìm hiểu, viết thư gửi Đại hội Đoàn các cấp.",
      3,
      "- Hình ảnh đường link bài viết có Logo Hội đồng Đội",
      "",
      "",
    ]);

    // Bonus section
    sheet.addRow([]);
    sheet.addRow(["** ĐIỂM THƯỞNG (5 điểm)"]);
    sheet.addRow([
      35,
      "7. ĐIỂM THƯỞNG",
      "1. Có mô hình hoặc cách làm mới, sáng tạo hiệu quả trong công tác Đội và phong trào thiếu nhi.",
      1,
      "- Báo cáo kết quả mô hình\n- Link bài viết có Logo Hội đồng Đội",
      "",
      "",
    ]);
    sheet.addRow([
      36,
      "",
      "2. Có sản phẩm đạt giải từ cấp tỉnh trở lên khi tham gia các cuộc thi do Hội đồng Đội cấp trên phát động.",
      1,
      "- Hội đồng Đội xã theo dõi (1đ cho mỗi em/sản phẩm đạt giải)",
      "",
      "",
    ]);
    sheet.addRow([
      37,
      "",
      "3. Có giáo viên hoặc học sinh được Hội đồng Đội tỉnh chọn cử tham gia hoạt động cấp Trung ương.",
      1,
      "- Quyết định / công văn chọn cử của HĐĐ tỉnh",
      "",
      "",
    ]);
    sheet.addRow([
      38,
      "",
      "4. Đăng cai, hỗ trợ tổ chức các hoạt động của Hội đồng Đội xã.",
      1,
      "- Kế hoạch phối hợp hoặc xác nhận của HĐĐ xã",
      "",
      "",
    ]);
    sheet.addRow([
      39,
      "",
      "5. Phối hợp Hội đồng Đội xã xây dựng mô hình không gian đọc sách tương tác và sinh hoạt Đội",
      1,
      "- Hình ảnh hoặc bài viết truyền thông",
      "",
      "",
    ]);

    // Set column widths
    sheet.columns = [
      { width: 8 },
      { width: 35 },
      { width: 45 },
      { width: 10 },
      { width: 40 },
      { width: 35 },
      { width: 25 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mau_Khung_Tieu_Chi_Cong_Tac_Doi.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống Mẫu Khung Tiêu Chí Công tác Đội!");
  };

  // ============================================================
  // Download Template: Mẫu Kỹ Thuật Chi Tiết
  // ============================================================
  const downloadTechnicalTemplate = async () => {
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

    sheet.addRow({
      Category_Code: "CAT01",
      Category_Name: "Thực hiện chỉ tiêu năm học",
      Criterion_Code: "1.1",
      Criterion_Title: "Sinh hoạt chuyên đề Mỗi tuần 01 câu chuyện đẹp",
      Description: "Tổ chức sinh hoạt chuyên đề theo quy định",
      Scoring_Guidelines: "Có hình ảnh và logo Hội đồng Đội",
      Max_Score: 2.0,
      Requires_Doc1: "TRUE",
      Requires_Doc2: "TRUE",
      Requires_Link3: "TRUE",
      Responsible_Unit: "Liên đội",
      Deadline: "2026-05-15",
      Display_Order: 1,
    });

    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF15803D" },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mau_Ky_Thuat_Tieu_Chi.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống file Excel mẫu kỹ thuật!");
  };

  // ============================================================
  // Parse Worksheet & Intelligent Deduplication
  // ============================================================
  const parseWorksheet = (worksheet: ExcelJS.Worksheet) => {
    // Detect format by scanning first 15 rows
    let headerRowIndex = -1;
    let isDoiFramework = false;
    let colTT = -1;
    let colCategory = -1;
    let colTitle = -1;
    let colScore = -1;
    let colEvidence = -1;

    for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      let hasTitle = false;
      let hasScore = false;
      let hasCategoryOrTT = false;

      row.eachCell((cell, colNumber) => {
        const val = extractCellText(cell.value).toLowerCase();
        if (val === "criterion_code" || val === "criterion_title") {
          // Technical format
          headerRowIndex = r;
          isDoiFramework = false;
        }
        if (val.includes("nội dung thực hiện") || val.includes("nội dung")) {
          hasTitle = true;
          colTitle = colNumber;
        }
        if (val === "điểm" || val.includes("điểm")) {
          hasScore = true;
          colScore = colNumber;
        }
        if (val === "tiêu chí" || val.includes("tiêu chí") || val === "tt" || val === "stt") {
          hasCategoryOrTT = true;
          if (val.includes("tiêu chí")) colCategory = colNumber;
          if (val === "tt" || val === "stt") colTT = colNumber;
        }
        if (val.includes("minh chứng") || val.includes("yêu cầu")) {
          colEvidence = colNumber;
        }
      });

      if (hasTitle && (hasScore || hasCategoryOrTT)) {
        headerRowIndex = r;
        isDoiFramework = true;
        break;
      }
      if (headerRowIndex !== -1 && !isDoiFramework) break;
    }

    if (headerRowIndex === -1) {
      throw new Error(
        "Không tìm thấy dòng tiêu đề bảng tiêu chí trong trang tính này. Vui lòng đảm bảo file có các cột: 'Tiêu chí', 'Nội dung thực hiện', 'Điểm', 'Yêu cầu minh chứng'."
      );
    }

    setDetectedFormat(isDoiFramework ? "doi_framework" : "technical");

    const rows: ImportRow[] = [];
    const bonusItems: BonusCriterion[] = [];
    const codesSeen = new Set<string>();
    let foundErrors = false;
    let skippedDuplicatesCount = 0;

    // ── PARSER 1: MẪU KHUNG TIÊU CHÍ CÔNG TÁC ĐỘI (Thực tế) ──
    if (isDoiFramework) {
      let currentCategoryName = "Chung";
      let inBonusSection = false;
      let categoryCount = 0;
      let autoCriterionNum = 1;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIndex) return;

        const getCellVal = (col: number) => {
          if (col <= 0) return "";
          const cell = row.getCell(col);
          const text = extractCellText(cell.value);
          if (text) return text;
          if (cell.text && typeof cell.text === "string" && cell.text !== "[object Object]") {
            return cell.text.trim();
          }
          return "";
        };

        const rawCategory = getCellVal(colCategory);
        const rawTitle = getCellVal(colTitle);
        const rawScore = getCellVal(colScore);
        const rawEvidence = getCellVal(colEvidence);
        const fullRowText = [rawCategory, rawTitle, rawScore, rawEvidence].join(" ").toLowerCase();

        // Check if this row enters the Bonus section
        if (
          fullRowText.includes("điểm thưởng") ||
          fullRowText.includes("** điểm thưởng") ||
          rawCategory.toUpperCase().includes("ĐIỂM THƯỞNG")
        ) {
          inBonusSection = true;
          // Skip the section heading row if it has no specific bonus content
          if (!rawTitle || rawTitle.toLowerCase().includes("điểm thưởng")) {
            return;
          }
        }

        // Check for summary or note rows to skip
        if (
          fullRowText.startsWith("tổng") ||
          fullRowText.startsWith("tổng điểm") ||
          fullRowText.includes("ghi chú:") ||
          fullRowText.includes("xếp loại thi đua")
        ) {
          return;
        }

        // Empty row
        if (!rawTitle && !rawCategory && !rawScore) return;

        // Carry forward merged category
        if (rawCategory && !inBonusSection) {
          // Strip any numeric prefix like "1. ", "2. " and normalize line breaks
          currentCategoryName = rawCategory
            .replace(/^\d+\.\s*/, "")
            .replace(/\r?\n+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          categoryCount++;
        }

        // Process normal criteria row
        if (!inBonusSection) {
          if (!rawTitle) return; // Skip rows without criterion content

          // Extract Criterion Code: look for "1.1", "2.1", "3.13", etc.
          let criterionCode = "";
          let cleanTitle = rawTitle;

          const codeMatch = rawTitle.match(/^(\d+\.\d+)/);
          if (codeMatch) {
            criterionCode = codeMatch[1];
            cleanTitle = rawTitle.replace(/^\d+\.\d+\.?\s*/, "").trim();
          } else {
            // Generate code if missing (e.g. 5.1, 6.1)
            const catNumber = rawCategory.match(/^(\d+)/)?.[1] || String(categoryCount || 1);
            criterionCode = `${catNumber}.${autoCriterionNum++}`;
          }

          // Parse score
          let maxScore = parseFloat(rawScore);
          if (isNaN(maxScore)) {
            // Try to find first number in score cell
            const numMatch = rawScore.match(/\d+(\.\d+)?/);
            maxScore = numMatch ? parseFloat(numMatch[0]) : 0;
          }

          // Smart Deduplication: check if this code was already seen
          const existingRow = rows.find(
            (r) => r.criterionCode.toLowerCase() === criterionCode.toLowerCase()
          );

          if (existingRow) {
            const normOld = existingRow.criterionTitle.toLowerCase().replace(/\s+/g, " ");
            const normNew = cleanTitle.toLowerCase().replace(/\s+/g, " ");
            const isDuplicateContent =
              normOld === normNew ||
              (normOld.length > 20 && normNew.includes(normOld.slice(0, 30))) ||
              (normNew.length > 20 && normOld.includes(normNew.slice(0, 30)));

            if (isDuplicateContent) {
              // Exactly identical row (e.g. accidental copy-paste row in Excel like row 23 in TH Mai Thị Non)
              skippedDuplicatesCount++;
              return;
            }

            // Same code but different title: auto-disambiguate with suffix (e.g. 3.2a, 3.2b)
            let letterCode = "a";
            let newCode = `${criterionCode}${letterCode}`;
            while (codesSeen.has(newCode.toLowerCase())) {
              letterCode = String.fromCharCode(letterCode.charCodeAt(0) + 1);
              newCode = `${criterionCode}${letterCode}`;
            }
            criterionCode = newCode;
            codesSeen.add(criterionCode.toLowerCase());
          } else {
            codesSeen.add(criterionCode.toLowerCase());
          }

          const errors: string[] = [];
          if (!cleanTitle) {
            errors.push("Nội dung tiêu chí trống");
          }
          if (maxScore <= 0) {
            errors.push("Điểm tối đa không hợp lệ (phải > 0)");
          }

          if (errors.length > 0) foundErrors = true;

          rows.push({
            rowIndex: rowNumber,
            categoryCode: `CAT_${categoryCount || 1}`,
            categoryName: currentCategoryName,
            criterionCode,
            criterionTitle: cleanTitle,
            description: rawEvidence || "Thực hiện theo chỉ đạo của Hội đồng Đội",
            scoringGuidelines: rawEvidence,
            maxScore: maxScore || 1.0,
            reqDoc1: true,
            reqDoc2: true,
            reqLink3: true,
            responsibleUnit: "Liên đội",
            deadline: "",
            displayOrder: rows.length + 1,
            errors,
          });
        } else {
          // In Bonus section: extract bonus items
          if (rawTitle && rawTitle.length > 5) {
            // Skip section header rows like "** ĐIỂM THƯỞNG (5 điểm)"
            if (rawTitle.toLowerCase().includes("điểm thưởng") && rawTitle.length < 35) {
              return;
            }

            let bonusCode = "BONUS_OTHER";
            if (rawTitle.toLowerCase().includes("mô hình") || rawTitle.toLowerCase().includes("sáng tạo")) {
              bonusCode = "MO_HINH";
            } else if (rawTitle.toLowerCase().includes("đạt giải") || rawTitle.toLowerCase().includes("cuộc thi")) {
              bonusCode = "DAT_GIAI";
            } else if (rawTitle.toLowerCase().includes("trung ương") || rawTitle.toLowerCase().includes("tỉnh chọn cử")) {
              bonusCode = "CAP_TW";
            } else if (rawTitle.toLowerCase().includes("đăng cai") || rawTitle.toLowerCase().includes("hỗ trợ tổ chức")) {
              bonusCode = "DANG_CAI";
            } else if (rawTitle.toLowerCase().includes("không gian đọc sách") || rawTitle.toLowerCase().includes("tương tác")) {
              bonusCode = "KHONG_GIAN_DOC";
            } else {
              bonusCode = `BONUS_${bonusItems.length + 1}`;
            }

            const cleanBonusName = rawTitle.replace(/^\d+\.\s*/, "").trim();
            const score = parseFloat(rawScore) || 1.0;

            bonusItems.push({
              id: `bonus_${bonusCode.toLowerCase()}`,
              code: bonusCode,
              name: cleanBonusName,
              base_points: score,
              unit: bonusCode === "DAT_GIAI" ? "học sinh / giải thưởng" : bonusCode === "MO_HINH" ? "mô hình" : "lần",
              max_points: 5.0,
              evidence_guidelines: rawEvidence,
              sort_order: bonusItems.length + 1,
              is_active: true,
            });
          }
        }
      });

      setDetectedBonusList(bonusItems.length > 0 ? bonusItems : DEFAULT_BONUS_CRITERIA);
    } else {
      // ── PARSER 2: MẪU KỸ THUẬT CHI TIẾT ──
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIndex) return;

        const getCellVal = (colIndex: number) => {
          const cell = row.getCell(colIndex);
          const text = extractCellText(cell.value);
          if (text) return text;
          if (cell.text && typeof cell.text === "string" && cell.text !== "[object Object]") {
            return cell.text.trim();
          }
          return "";
        };

        const categoryCode = getCellVal(1);
        const categoryName = getCellVal(2);
        let criterionCode = getCellVal(3);
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

        if (!criterionCode && !criterionTitle) return;

        const existingRow = rows.find(
          (r) => r.criterionCode.toLowerCase() === criterionCode.toLowerCase()
        );

        if (existingRow) {
          const normOld = existingRow.criterionTitle.toLowerCase().replace(/\s+/g, " ");
          const normNew = criterionTitle.toLowerCase().replace(/\s+/g, " ");
          if (normOld === normNew) {
            skippedDuplicatesCount++;
            return;
          }
          let letterCode = "a";
          let newCode = `${criterionCode}${letterCode}`;
          while (codesSeen.has(newCode.toLowerCase())) {
            letterCode = String.fromCharCode(letterCode.charCodeAt(0) + 1);
            newCode = `${criterionCode}${letterCode}`;
          }
          criterionCode = newCode;
          codesSeen.add(criterionCode.toLowerCase());
        } else if (criterionCode) {
          codesSeen.add(criterionCode.toLowerCase());
        }

        const errors: string[] = [];
        if (!criterionCode) {
          errors.push("Thiếu mã tiêu chí (Criterion_Code)");
        }
        if (!criterionTitle) {
          errors.push("Thiếu nội dung tiêu chí");
        }

        const maxScore = parseFloat(maxScoreRaw);
        if (isNaN(maxScore) || maxScore <= 0) {
          errors.push("Điểm tối đa phải là số dương lớn hơn 0");
        }

        if (errors.length > 0) foundErrors = true;

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
          displayOrder: parseInt(displayOrderRaw) || rows.length + 1,
          errors,
        });
      });
    }

    setPreviewRows(rows);
    setHasErrors(foundErrors);

    if (rows.length === 0) {
      toast.error("Trang tính này không tìm thấy dòng tiêu chí nào.");
    } else if (foundErrors) {
      toast.warning(`Đã đọc ${rows.length} tiêu chí nhưng có một số dòng chưa hợp lệ.`);
    } else {
      if (skippedDuplicatesCount > 0) {
        toast.success(`Đọc thành công ${rows.length} tiêu chí (đã tự động lọc bỏ ${skippedDuplicatesCount} dòng trùng lặp)!`);
      } else {
        toast.success(`Đọc thành công ${rows.length} tiêu chí từ file Excel!`);
      }
    }
  };

  // ============================================================
  // File Upload & Sheet Change Handlers
  // ============================================================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setFileName(file.name);
    setPreviewRows([]);
    setDetectedBonusList([]);
    setDetectedFormat(null);

    try {
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);

      setWorkbookRef(workbook);
      const sheets = workbook.worksheets.map((ws) => ws.name);
      setAvailableSheets(sheets);
      setSelectedSheetIndex(0);

      // Search worksheet with data
      let targetWs = workbook.worksheets[0];
      for (let i = 0; i < workbook.worksheets.length; i++) {
        if (workbook.worksheets[i].rowCount > 5) {
          targetWs = workbook.worksheets[i];
          setSelectedSheetIndex(i);
          break;
        }
      }

      if (!targetWs) {
        throw new Error("File Excel không có trang tính nào chứa dữ liệu.");
      }

      parseWorksheet(targetWs);
    } catch (err: any) {
      toast.error("Lỗi khi đọc file: " + err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleSelectSheet = (sheetIndex: number) => {
    if (!workbookRef || !workbookRef.worksheets[sheetIndex]) return;
    setSelectedSheetIndex(sheetIndex);
    try {
      parseWorksheet(workbookRef.worksheets[sheetIndex]);
    } catch (err: any) {
      toast.error("Lỗi khi đọc trang tính: " + err.message);
    }
  };

  // ============================================================
  // Inline Code Editing & Real-time Validation
  // ============================================================
  const handleUpdateRowCode = (rowIndex: number, newCode: string) => {
    setPreviewRows((prev) => {
      const updated = prev.map((r) => {
        if (r.rowIndex === rowIndex) {
          return { ...r, criterionCode: newCode.trim() };
        }
        return r;
      });

      const codeCounts = new Map<string, number>();
      updated.forEach((r) => {
        const c = r.criterionCode.toLowerCase();
        codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
      });

      let hasErr = false;
      const revalidated = updated.map((r) => {
        const c = r.criterionCode.toLowerCase();
        const errs = r.errors.filter((e) => !e.startsWith("Trùng mã tiêu chí"));
        if ((codeCounts.get(c) || 0) > 1) {
          errs.push(`Trùng mã tiêu chí: "${r.criterionCode}"`);
          hasErr = true;
        }
        if (!r.criterionTitle) hasErr = true;
        if (r.maxScore <= 0) hasErr = true;
        return { ...r, errors: errs };
      });

      setHasErrors(hasErr);
      return revalidated;
    });
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

      for (let i = 0; i < uniqueCats.length; i++) {
        const catName = uniqueCats[i];
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
            .insert({
              name: catName,
              code: `CAT_${String(i + 1).padStart(2, "0")}`,
              sort_order: i + 1,
            })
            .select("id")
            .single();
          if (catError) throw catError;
          categoryMap.set(catName, inserted.id);
        }
      }

      // 2. Insert valid criteria into criteria_library
      const validRows = previewRows.filter((r) => r.errors.length === 0);
      const criteriaPayload = validRows.map((r, idx) => ({
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
        sort_order: r.displayOrder || idx + 1,
        is_active: true,
      }));

      const { data: upsertedLib, error: critError } = await supabase
        .from("criteria_library")
        .upsert(criteriaPayload, { onConflict: "code" })
        .select("id, code");

      if (critError) throw critError;

      // 3. If "Sync Bonus Criteria" is checked, sync the 5 bonus items
      if (syncBonus && detectedBonusList.length > 0) {
        await saveBonusCriteriaList(detectedBonusList);
      }

      // 4. If "Apply to active period" is checked, insert snapshots into period_criteria
      if (applyToActivePeriod && activePeriod?.id) {
        const libMap = new Map((upsertedLib ?? []).map((l) => [l.code, l.id]));

        const periodCriteriaPayload = validRows.map((r, idx) => ({
          period_id: activePeriod.id,
          source_criteria_id: libMap.get(r.criterionCode) || null,
          code_snapshot: r.criterionCode,
          title_snapshot: r.criterionTitle,
          category_name_snapshot: r.categoryName.trim(),
          description_snapshot: r.description || null,
          scoring_snapshot: r.scoringGuidelines || null,
          max_score_snapshot: r.maxScore,
          req_doc1: r.reqDoc1,
          req_doc2: r.reqDoc2,
          req_link3: r.reqLink3,
          responsible_unit_snapshot: r.responsibleUnit || null,
          deadline_snapshot: r.deadline ? new Date(r.deadline).toISOString() : null,
          sort_order: r.displayOrder || idx + 1,
        }));

        await supabase.from("period_criteria").insert(periodCriteriaPayload);
      }

      // 5. Log into import_jobs
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
      queryClient.invalidateQueries({ queryKey: ["admin_bonus_criteria_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["bonus_criteria_catalog"] });
      toast.success(
        `Import thành công ${previewRows.filter((r) => r.errors.length === 0).length} tiêu chí vào hệ thống!`
      );
      setPreviewRows([]);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: Error) => toast.error("Lỗi khi import: " + err.message),
  });

  // Calculate total score of parsed criteria
  const totalParsedScore = useMemo(() => {
    return previewRows.reduce((acc, r) => acc + (r.maxScore || 0), 0);
  }, [previewRows]);

  // Unique categories count
  const uniqueCategoryCount = useMemo(() => {
    return new Set(previewRows.map((r) => r.categoryName.trim()).filter(Boolean)).size;
  }, [previewRows]);

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
          Import / Export Tiêu chí Excel
        </h1>
        <p className="text-sm text-slate-700 mt-1">
          Nạp danh sách bộ tiêu chí hàng loạt từ file Excel và xuất dữ liệu tiêu chí Công tác Đội
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full sm:w-[380px] grid-cols-2 rounded-xl">
          <TabsTrigger value="import" className="gap-2 font-bold text-xs rounded-lg">
            <Upload className="h-4 w-4" />
            Nhập tiêu chí (Import)
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2 font-bold text-xs rounded-lg">
            <Download className="h-4 w-4" />
            Xuất dữ liệu (Export)
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: IMPORT */}
        <TabsContent value="import" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1: Download Templates */}
            <Card className="border-emerald-200 shadow-2xs rounded-2xl">
              <CardHeader className="pb-3">
                <Badge className="w-fit mb-1 bg-emerald-700 text-white font-bold">
                  Bước 1
                </Badge>
                <CardTitle className="text-base font-bold text-slate-950">Tải file mẫu Excel</CardTitle>
                <CardDescription className="text-xs text-slate-600 font-medium">
                  Hệ thống hỗ trợ cả file Khung tiêu chí Đội thực tế (cột Tiêu chí, Nội dung thực hiện, Điểm) và file kỹ thuật.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold text-xs h-9 rounded-xl justify-start"
                  onClick={downloadDoiFrameworkTemplate}
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span className="truncate">Mẫu Khung Tiêu chí Đội (Chuẩn)</span>
                </Button>

                <Button
                  variant="ghost"
                  className="w-full gap-2 text-slate-700 hover:bg-slate-100 font-medium text-xs h-8 rounded-xl justify-start"
                  onClick={downloadTechnicalTemplate}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Mẫu kỹ thuật chi tiết (.xlsx)</span>
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Upload File */}
            <Card className="md:col-span-2 border-emerald-200 shadow-2xs rounded-2xl">
              <CardHeader className="pb-3">
                <Badge className="w-fit mb-1 bg-emerald-700 text-white font-bold">
                  Bước 2
                </Badge>
                <CardTitle className="text-base font-bold text-slate-950">Tải lên file Excel</CardTitle>
                <CardDescription className="text-xs text-slate-600 font-medium">
                  Chọn file Excel chứa khung tiêu chí để hệ thống tự động bóc tách nhóm, từng tiêu chí, điểm số và yêu cầu minh chứng.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-700 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
                  />
                  {parsing && (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 shrink-0">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang phân tích file...</span>
                    </div>
                  )}
                </div>

                {availableSheets.length > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-3 pt-3 border-t border-emerald-100">
                    <span className="text-xs font-bold text-slate-900 shrink-0">
                      Chọn trang tính (Sheet):
                    </span>
                    <Select
                      value={String(selectedSheetIndex)}
                      onValueChange={(val) => handleSelectSheet(parseInt(val))}
                    >
                      <SelectTrigger className="h-8 text-xs font-bold bg-white border-emerald-300 w-full sm:w-auto min-w-[220px] rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[50vh]">
                        {availableSheets.map((name, idx) => (
                          <SelectItem key={name} value={String(idx)} className="text-xs font-medium">
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-slate-500 font-medium">
                      (File có {availableSheets.length} trang tính)
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Step 3: Preview Data & Options */}
          {previewRows.length > 0 && (
            <Card className="border-emerald-200 shadow-2xs rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-emerald-100 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-bold text-slate-950">
                        Xem trước dữ liệu ({previewRows.length} tiêu chí)
                      </CardTitle>
                      {detectedFormat === "doi_framework" && (
                        <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 font-bold text-[10px]">
                          ✓ Khung tiêu chí Đội thực tế
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Đã nhận diện: <b>{uniqueCategoryCount} nhóm tiêu chí</b> • Tổng điểm:{" "}
                      <b className="text-emerald-800 font-black">{totalParsedScore} điểm</b>
                    </p>
                  </div>

                  <Button
                    onClick={() => commitImportMutation.mutate()}
                    disabled={commitImportMutation.isPending || previewRows.filter((r) => r.errors.length === 0).length === 0}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs h-9 rounded-xl gap-2 shadow-sm"
                  >
                    {commitImportMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang lưu dữ liệu...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Xác nhận Nhập ({previewRows.filter((r) => r.errors.length === 0).length} tiêu chí)
                      </>
                    )}
                  </Button>
                </div>

                {/* Import Options */}
                <div className="pt-3 flex flex-col sm:flex-row gap-4 border-t border-slate-100 mt-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                    <Checkbox
                      checked={syncBonus}
                      onCheckedChange={(c) => setSyncBonus(!!c)}
                    />
                    <span>
                      Đồng thời cập nhật 5 mã Điểm thưởng vào hệ thống (MO_HINH, DAT_GIAI, CAP_TW, DANG_CAI, KHONG_GIAN_DOC)
                    </span>
                  </label>

                  {activePeriod && (
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                      <Checkbox
                        checked={applyToActivePeriod}
                        onCheckedChange={(c) => setApplyToActivePeriod(!!c)}
                      />
                      <span>
                        Áp dụng ngay vào đợt đang mở: <b>{activePeriod.name}</b>
                      </span>
                    </label>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="bg-emerald-50/70 sticky top-0 z-10 border-b border-emerald-200">
                      <TableRow>
                        <TableHead className="w-12 font-bold text-slate-950">Dòng</TableHead>
                        <TableHead className="w-24 font-bold text-slate-950">Mã</TableHead>
                        <TableHead className="w-48 font-bold text-slate-950">Nhóm tiêu chí</TableHead>
                        <TableHead className="font-bold text-slate-950">Nội dung thực hiện</TableHead>
                        <TableHead className="w-20 text-center font-bold text-slate-950">Điểm</TableHead>
                        <TableHead className="w-60 font-bold text-slate-950">Yêu cầu minh chứng</TableHead>
                        <TableHead className="w-28 font-bold text-slate-950">Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow
                          key={row.rowIndex}
                          className={row.errors.length > 0 ? "bg-red-50/50" : "hover:bg-emerald-50/30"}
                        >
                          <TableCell className="font-mono text-xs text-slate-500">{row.rowIndex}</TableCell>
                          <TableCell className="font-mono text-xs font-bold text-slate-950">
                            <Input
                              type="text"
                              value={row.criterionCode}
                              onChange={(e) => handleUpdateRowCode(row.rowIndex, e.target.value)}
                              className="h-7 w-20 font-mono text-xs font-bold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center focus:border-emerald-500"
                              title="Nhấp để sửa mã tiêu chí nếu cần"
                            />
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-800">
                            {row.categoryName}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-950 max-w-md whitespace-pre-line leading-relaxed">
                            {row.criterionTitle}
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs text-slate-950 whitespace-nowrap">
                            {row.maxScore}đ
                          </TableCell>
                          <TableCell className="text-xs text-slate-700 max-w-xs whitespace-pre-line leading-relaxed" title={row.scoringGuidelines}>
                            {row.scoringGuidelines || "—"}
                          </TableCell>
                          <TableCell>
                            {row.errors.length === 0 ? (
                              <Badge className="bg-emerald-700 text-white font-bold text-[10px]">Hợp lệ</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px] font-bold" title={row.errors.join(", ")}>
                                {row.errors[0]}
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
        <TabsContent value="export" className="space-y-6 mt-4">
          <Card className="border-emerald-200 shadow-2xs rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-950">Xuất danh sách tiêu chí chính thức</CardTitle>
              <CardDescription className="text-xs text-slate-600 font-medium">
                Tải xuống toàn bộ danh sách tiêu chí hiện có trong Thư viện tiêu chí dưới định dạng Excel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={downloadDoiFrameworkTemplate}
                className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs h-9 rounded-xl"
              >
                <Download className="h-4 w-4" />
                Xuất file Excel Khung Tiêu Chí Đội (.xlsx)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
