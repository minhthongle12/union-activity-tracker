import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import { getBonusCriteriaList, DEFAULT_BONUS_CRITERIA, BonusCriterion } from "@/lib/bonusCriteria";
import type { EvaluationPeriod } from "@/types/database";

export interface ExportReviewExcelOptions {
  period: EvaluationPeriod;
  targetOrgId?: string; // "all" or specific organization id
  onProgress?: (message: string) => void;
}

/**
 * Format clean sheet name for each school (max 30 chars, no special chars, unique)
 */
function getSheetName(orgName: string, index: number, seenNames: Set<string>): string {
  const normalized = (orgName || "")
    .normalize("NFC")
    .replace(/^Liên\s*đội\s*/i, "")
    .replace(/^Liên\s*đội\s*/i, "")
    .replace(/^Trường\s*/i, "")
    .replace(/^Trường\s*/i, "")
    .trim();

  let clean = normalized
    .replace(/Tiểu\s*học/gi, "TH")
    .replace(/Tiểu\s*học/gi, "TH")
    .replace(/Trung\s*học\s*cơ\s*sở/gi, "THCS")
    .replace(/Trung\s*học\s*cơ\s*sở/gi, "THCS")
    .replace(/TH-THCS&THPT/gi, "")
    .replace(/[\\/?*[\]:]/g, "")
    .trim();

  if (clean.length > 28) {
    clean = clean.slice(0, 28);
  }
  if (!clean) clean = `Đơn vị ${index + 1}`;

  let finalName = clean;
  let counter = 1;
  while (seenNames.has(finalName.toLowerCase())) {
    finalName = `${clean.slice(0, 24)} (${counter++})`;
  }
  seenNames.add(finalName.toLowerCase());
  return finalName;
}

/**
 * Export evaluation and review results to Excel matching the exact official template
 */
export async function exportReviewExcel({
  period,
  targetOrgId = "all",
  onProgress,
}: ExportReviewExcelOptions) {
  onProgress?.("Đang tải dữ liệu tiêu chí và bài nộp...");

  // 1. Fetch criteria for this period
  const { data: periodCriteria, error: critErr } = await supabase
    .from("period_criteria")
    .select("*")
    .eq("period_id", period.id)
    .order("sort_order", { ascending: true })
    .order("code_snapshot", { ascending: true });

  if (critErr) throw critErr;

  // 2. Fetch organizations assigned to this period
  let orgPeriodQuery = supabase
    .from("organization_periods")
    .select("id, organization_id, status, organization:organizations(*)")
    .eq("period_id", period.id);

  if (targetOrgId && targetOrgId !== "all") {
    orgPeriodQuery = orgPeriodQuery.eq("organization_id", targetOrgId);
  }

  const { data: orgPeriods, error: opErr } = await orgPeriodQuery;
  if (opErr) throw opErr;

  if (!orgPeriods || orgPeriods.length === 0) {
    throw new Error("Không tìm thấy đơn vị nào được phân công trong đợt đánh giá này.");
  }

  const orgPeriodIds = orgPeriods.map((op) => op.id);

  // 3. Fetch submissions, revisions, evidence, review actions
  onProgress?.("Đang tải minh chứng và kết quả thẩm định...");
  const [subRes, bonusRes, bonusCriteriaCatalog] = await Promise.all([
    supabase
      .from("submissions")
      .select("*, current_revision:submission_revisions(*, evidence:evidence_items(*)), actions:review_actions(*)")
      .in("organization_period_id", orgPeriodIds),
    supabase
      .from("bonus_requests")
      .select("*, evidence:bonus_evidence_items(*)")
      .in("organization_period_id", orgPeriodIds)
      .eq("status", "approved"),
    getBonusCriteriaList(),
  ]);

  const submissions = subRes.data ?? [];
  const bonusRequests = bonusRes.data ?? [];
  const standardBonusCriteria = bonusCriteriaCatalog.length > 0 ? bonusCriteriaCatalog : DEFAULT_BONUS_CRITERIA;

  // 4. Initialize Workbook
  onProgress?.("Đang khởi tạo bảng tính Excel...");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hội đồng Đội";
  workbook.created = new Date();

  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };

  // 5. Generate worksheet for each organization
  const seenSheetNames = new Set<string>();
  for (let idx = 0; idx < orgPeriods.length; idx++) {
    const op = orgPeriods[idx];
    const org: any = op.organization;
    const orgName = org?.name || `Đơn vị ${idx + 1}`;
    const sheetTitle = getSheetName(orgName, idx, seenSheetNames);

    onProgress?.(`Đang tạo trang tính: ${sheetTitle} (${idx + 1}/${orgPeriods.length})...`);
    const sheet = workbook.addWorksheet(sheetTitle);

    // Set Column Widths (matching the real excel)
    sheet.columns = [
      { width: 6.5 }, // Col 1 (A): TT
      { width: 24 },  // Col 2 (B): Tiêu chí (Category)
      { width: 60 },  // Col 3 (C): Nội dung thực hiện
      { width: 8.5 }, // Col 4 (D): Điểm
      { width: 48 },  // Col 5 (E): Yêu cầu minh chứng
      { width: 44 },  // Col 6 (F): Đường link bài viết về hoạt động
      { width: 14 },  // Col 7 (G): Điểm HĐĐ chấm
      { width: 34 },  // Col 8 (H): Ghi chú thẩm định
    ];

    // ROW 1: Header Org & Date
    const r1 = sheet.addRow([
      "ĐỘI TNTP HỒ CHÍ MINH\nHỘI ĐỒNG ĐỘI XÃ BẾN LỨC\n***",
      "",
      "",
      "Bến Lức, ngày       tháng      năm 2026",
      "",
      "",
      "",
      "",
    ]);
    r1.height = 48;
    sheet.mergeCells(`A1:C1`);
    sheet.mergeCells(`D1:G1`);
    const cellA1 = sheet.getCell("A1");
    cellA1.font = { name: "Times New Roman", size: 12, bold: true };
    cellA1.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    const cellD1 = sheet.getCell("D1");
    cellD1.font = { name: "Times New Roman", size: 12, italic: true, bold: true };
    cellD1.alignment = { horizontal: "center", vertical: "middle" };

    // ROW 2: Title & School Name
    const schoolDisplayName = orgName.replace(/^Liên\s+độ?i\s+/i, "");
    const r2 = sheet.addRow([
      `KHUNG TIÊU CHÍ\nĐánh giá, xếp loại danh hiệu “Liên đội mạnh” đội năm học 2025 - 2026\n------\n${schoolDisplayName}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    r2.height = 68;
    sheet.mergeCells(`A2:H2`);
    const cellA2 = sheet.getCell("A2");
    cellA2.font = { name: "Times New Roman", size: 13, bold: true };
    cellA2.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // ROW 3: Subtitle
    sheet.addRow([
      "* KHUNG ĐIỂM (100 điểm)",
      "",
      "",
      "",
      "",
      "",
      "Ghi chú điểm HĐĐ chấm",
      "",
    ]);
    sheet.mergeCells(`A3:F3`);
    sheet.mergeCells(`G3:H3`);
    sheet.getCell("A3").font = { name: "Times New Roman", size: 12, bold: true };
    sheet.getCell("G3").font = { name: "Times New Roman", size: 11, italic: true };
    sheet.getCell("G3").alignment = { horizontal: "center", vertical: "middle" };

    // ROW 4: Table Columns Header
    const r4 = sheet.addRow([
      "TT",
      "Tiêu chí",
      "Nội dung thực hiện",
      "Điểm",
      "Yêu cầu minh chứng",
      "Đường link bài viết về hoạt động",
      "Điểm HĐĐ chấm",
      "Ghi chú thẩm định",
    ]);
    r4.height = 32;

    for (let c = 1; c <= 8; c++) {
      const cell = r4.getCell(c);
      cell.font = { name: "Times New Roman", size: 12, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = borderThin;
      if (c === 6) {
        // Yellow highlight on evidence link column
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" },
        };
      }
    }

    // ROW 5+: Populate Standard Criteria
    let currentRowNum = 5;
    let standardScoreSum = 0;

    // Group criteria by Category
    const categoriesMap = new Map<string, typeof periodCriteria>();
    (periodCriteria ?? []).forEach((c) => {
      const cat = c.category_name_snapshot?.trim() || "Chung";
      if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
      categoriesMap.get(cat)!.push(c);
    });

    let ttCounter = 1;

    for (const [catName, critList] of categoriesMap.entries()) {
      const startRow = currentRowNum;

      for (const crit of critList) {
        // Find submission for this org and criterion
        const sub = submissions.find(
          (s) => s.organization_period_id === op.id && s.period_criteria_id === crit.id
        );

        // Evidence links
        const rev = sub?.current_revision as any;
        const evidenceItems: any[] = rev?.evidence ?? [];
        const links: string[] = [];

        evidenceItems.forEach((ev) => {
          if (ev.url) links.push(ev.url);
          else if (ev.file_name && (ev.file_name.startsWith("http://") || ev.file_name.startsWith("https://"))) {
            links.push(ev.file_name);
          }
        });

        // Review score & comments
        const verifiedScore = sub?.admin_score ?? (sub?.status === "verified" ? crit.max_score_snapshot : null);
        const actions = (sub?.actions as any[]) ?? [];
        const lastAction = actions[actions.length - 1];
        const comment = lastAction?.comment || (sub as any)?.notes || "";

        if (verifiedScore !== null && !isNaN(Number(verifiedScore))) {
          standardScoreSum += Number(verifiedScore);
        }

        const criterionDisplayTitle = crit.code_snapshot
          ? `${crit.code_snapshot}. ${crit.title_snapshot}`
          : crit.title_snapshot;

        const row = sheet.addRow([
          ttCounter++,
          catName,
          criterionDisplayTitle,
          crit.max_score_snapshot,
          crit.scoring_snapshot || crit.description_snapshot || "- Hội đồng Đội cấp xã theo dõi",
          links.join("\n"),
          verifiedScore !== null ? Number(verifiedScore) : "",
          comment,
        ]);

        // Style row cells
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(1).font = { name: "Times New Roman", size: 12 };
        row.getCell(1).border = borderThin;

        row.getCell(2).font = { name: "Times New Roman", size: 12, bold: true };
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        row.getCell(2).border = borderThin;

        row.getCell(3).font = { name: "Times New Roman", size: 12 };
        row.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(3).border = borderThin;

        row.getCell(4).font = { name: "Times New Roman", size: 12 };
        row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(4).border = borderThin;

        row.getCell(5).font = { name: "Times New Roman", size: 11 };
        row.getCell(5).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        row.getCell(5).border = borderThin;

        // Evidence links cell
        const cellF = row.getCell(6);
        cellF.font = { name: "Times New Roman", size: 11, color: { argb: "FF0000FF" }, underline: true };
        cellF.alignment = { horizontal: "left", vertical: "top", wrapText: true };
        cellF.border = borderThin;

        // Verified score cell
        const cellG = row.getCell(7);
        cellG.font = { name: "Times New Roman", size: 12, bold: true };
        cellG.alignment = { horizontal: "center", vertical: "middle" };
        cellG.border = borderThin;

        // Comment cell
        const cellH = row.getCell(8);
        cellH.font = { name: "Times New Roman", size: 11 };
        cellH.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        cellH.border = borderThin;

        currentRowNum++;
      }

      // Merge Category Cells in Column B across the group
      const endRow = currentRowNum - 1;
      if (endRow >= startRow) {
        sheet.mergeCells(`B${startRow}:B${endRow}`);
      }
    }

    // ROW: Subtotal for standard criteria
    const lastStandardRow = currentRowNum - 1;
    const subtotalRow = sheet.addRow([
      "",
      "Tổng ",
      "",
      "",
      "",
      "",
      { formula: `SUM(G5:G${lastStandardRow})`, result: standardScoreSum },
      "",
    ]);
    sheet.mergeCells(`B${currentRowNum}:F${currentRowNum}`);
    const subtotalCellB = sheet.getCell(`B${currentRowNum}`);
    subtotalCellB.font = { name: "Times New Roman", size: 13, bold: true };
    subtotalCellB.alignment = { horizontal: "center", vertical: "middle" };

    const subtotalCellG = sheet.getCell(`G${currentRowNum}`);
    subtotalCellG.font = { name: "Times New Roman", size: 13, bold: true };
    subtotalCellG.alignment = { horizontal: "center", vertical: "middle" };

    for (let c = 1; c <= 8; c++) {
      subtotalRow.getCell(c).border = borderThin;
    }
    const standardTotalRowIndex = currentRowNum;
    currentRowNum++;

    // ROW: Bonus Section Header
    const bonusHeaderRow = sheet.addRow([
      "** ĐIỂM THƯỞNG (5 điểm)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    sheet.mergeCells(`A${currentRowNum}:H${currentRowNum}`);
    const bonusHeaderCell = sheet.getCell(`A${currentRowNum}`);
    bonusHeaderCell.font = { name: "Times New Roman", size: 12, bold: true };
    bonusHeaderCell.alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 1; c <= 8; c++) {
      bonusHeaderRow.getCell(c).border = borderThin;
    }
    currentRowNum++;

    // 5 Bonus Criteria Rows
    const bonusStartRow = currentRowNum;
    let bonusScoreSum = 0;

    // Org bonus requests
    const orgBonusList = bonusRequests.filter((b) => b.organization_period_id === op.id);

    for (let bIdx = 0; bIdx < standardBonusCriteria.length; bIdx++) {
      const bc = standardBonusCriteria[bIdx];
      const matchedBonus = orgBonusList.find(
        (b) => b.bonus_code?.toUpperCase() === bc.code.toUpperCase()
      );

      // Extract bonus evidence links
      const bonusEvidence = (matchedBonus?.evidence as any[]) ?? [];
      const bonusLinks: string[] = [];
      bonusEvidence.forEach((ev) => {
        if (ev.external_url) bonusLinks.push(ev.external_url);
      });

      const approvedScore = matchedBonus ? matchedBonus.approved_score || matchedBonus.requested_score || 0 : "";
      if (typeof approvedScore === "number") {
        bonusScoreSum += approvedScore;
      }

      // Bonus notes/students list
      const bonusNote = matchedBonus ? matchedBonus.description || matchedBonus.title || "" : "";

      const bRow = sheet.addRow([
        ttCounter++,
        "7. ĐIỂM THƯỞNG ",
        `${bIdx + 1}. ${bc.name}`,
        bc.base_points,
        bc.evidence_guidelines || "Hội đồng Đội xã theo dõi",
        bonusLinks.join("\n"),
        approvedScore !== "" ? approvedScore : "",
        bonusNote,
      ]);

      bRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      bRow.getCell(1).font = { name: "Times New Roman", size: 12 };
      bRow.getCell(1).border = borderThin;

      bRow.getCell(2).font = { name: "Times New Roman", size: 12, bold: true };
      bRow.getCell(2).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      bRow.getCell(2).border = borderThin;

      bRow.getCell(3).font = { name: "Times New Roman", size: 12 };
      bRow.getCell(3).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      bRow.getCell(3).border = borderThin;

      bRow.getCell(4).font = { name: "Times New Roman", size: 12 };
      bRow.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      bRow.getCell(4).border = borderThin;

      bRow.getCell(5).font = { name: "Times New Roman", size: 11 };
      bRow.getCell(5).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      bRow.getCell(5).border = borderThin;

      const cellBF = bRow.getCell(6);
      cellBF.font = { name: "Times New Roman", size: 11, color: { argb: "FF0000FF" }, underline: true };
      cellBF.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      cellBF.border = borderThin;

      const cellBG = bRow.getCell(7);
      cellBG.font = { name: "Times New Roman", size: 12, bold: true };
      cellBG.alignment = { horizontal: "center", vertical: "middle" };
      cellBG.border = borderThin;

      const cellBH = bRow.getCell(8);
      cellBH.font = { name: "Times New Roman", size: 11 };
      cellBH.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      cellBH.border = borderThin;

      currentRowNum++;
    }

    const bonusEndRow = currentRowNum - 1;
    if (bonusEndRow >= bonusStartRow) {
      sheet.mergeCells(`B${bonusStartRow}:B${bonusEndRow}`);
    }

    // ROW: Grand Total Row [Tổng điểm (*) + (**)]
    const grandTotalRow = sheet.addRow([
      "",
      "Tổng điểm (*)  + (**)",
      "",
      "",
      "",
      "",
      { formula: `SUM(G${standardTotalRowIndex}, G${bonusStartRow}:G${bonusEndRow})`, result: standardScoreSum + bonusScoreSum },
      "",
    ]);
    sheet.mergeCells(`B${currentRowNum}:F${currentRowNum}`);
    const grandCellB = sheet.getCell(`B${currentRowNum}`);
    grandCellB.font = { name: "Times New Roman", size: 13, bold: true };
    grandCellB.alignment = { horizontal: "center", vertical: "middle" };

    const grandCellG = sheet.getCell(`G${currentRowNum}`);
    grandCellG.font = { name: "Times New Roman", size: 13, bold: true };
    grandCellG.alignment = { horizontal: "center", vertical: "middle" };

    for (let c = 1; c <= 8; c++) {
      grandTotalRow.getCell(c).border = borderThin;
    }
    currentRowNum++;

    // ROW: Notes Section (* Ghi chú:)
    const noteText =
      "* Ghi chú:\n" +
      "- Xếp loại thi đua:\n" +
      "+ Vững mạnh tiêu biểu: điểm thi đua từ 95 điểm trở lên (đảm bảo không có tiêu chí nào 0đ)\n" +
      "+ Vững mạnh: điểm thi đua từ 85 – dưới 95 điểm.\n" +
      "+ Khá: điểm thi đua từ 70 – dưới 85 điểm.\n" +
      "+ Điểm thi đua dưới 70 điểm, không xếp loại thi đua.\n" +
      "- Đối với nội dung minh chứng:\n" +
      "+ Báo cáo tự đánh giá của đơn vị có xác nhận BGH gửi trực tiếp về Hội đồng Đội xã.\n" +
      "+ Link bài viết minh chứng phải đảm bảo hình ảnh có phông chữ giống nội dung trong GƯTĐ quy định, ghi rõ thời gian, địa điểm, số lượng học sinh tham gia.";

    const noteRow = sheet.addRow([noteText, "", "", "", "", "", "", ""]);
    noteRow.height = 140;
    sheet.mergeCells(`A${currentRowNum}:H${currentRowNum}`);
    const noteCell = sheet.getCell(`A${currentRowNum}`);
    noteCell.font = { name: "Times New Roman", size: 11, italic: true };
    noteCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    for (let c = 1; c <= 8; c++) {
      noteRow.getCell(c).border = borderThin;
    }
  }

  // 6. Write to buffer and trigger download in browser
  onProgress?.("Đang nén file Excel...");
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const periodSlug = period.name
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/gi, "");

  const fileName = `Ket_Qua_Tham_Dinh_${periodSlug}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
