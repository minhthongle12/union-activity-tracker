import { useState, useRef, useEffect } from "react";
import type {
  PeriodCriterion,
  Submission,
  SubmissionRevision,
  EvidenceItem,
  ReviewAction,
  EvidenceType,
  SubmissionStatus,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera,
  FileText,
  Link as LinkIcon,
  Globe,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Send,
  Save,
  Clock,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  validateEvidenceFile,
  uploadEvidenceFile,
  getEvidenceSignedUrl,
} from "@/lib/storage";
import { useGlobalLoading } from "@/contexts/LoadingContext";

export interface CriterionWithSubmission {
  criterion: PeriodCriterion;
  submission?: Submission | null;
  currentRevision?: SubmissionRevision | null;
  evidenceItems?: EvidenceItem[];
  reviewActions?: ReviewAction[];
}

interface UnifiedCriteriaAccordionProps {
  item: CriterionWithSubmission;
  mode: "user" | "admin";
  onSaveDraft?: (criterionId: string, selfScore: number, evidence: EvidenceItem[]) => Promise<void>;
  onSubmit?: (criterionId: string, selfScore: number, evidence: EvidenceItem[]) => Promise<void>;
  onAdminVerify?: (submissionId: string, officialScore: number, comment: string) => Promise<void>;
  onAdminRequestRevision?: (submissionId: string, comment: string) => Promise<void>;
  onAdminReopen?: (submissionId: string, reason: string) => Promise<void>;
}

export function UnifiedCriteriaAccordion({
  item,
  mode,
  onSaveDraft,
  onSubmit,
  onAdminVerify,
  onAdminRequestRevision,
  onAdminReopen,
}: UnifiedCriteriaAccordionProps) {
  const { criterion, submission, currentRevision, evidenceItems = [], reviewActions = [] } = item;
  const [isOpen, setIsOpen] = useState(false);

  // Self-assessed score state
  const [selfScore, setSelfScore] = useState<number>(
    currentRevision?.self_score ?? criterion.max_score_snapshot ?? 0
  );
  const { withLoading } = useGlobalLoading();

  // Local evidence list
  const [localEvidence, setLocalEvidence] = useState<EvidenceItem[]>(evidenceItems);

  // Add Link dialog state (supports multiple links & bulk paste)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkType, setLinkType] = useState<EvidenceType>("link3");
  const [linkRows, setLinkRows] = useState<{ id: string; title: string; url: string }[]>([
    { id: "1", title: "", url: "" },
  ]);
  const [bulkText, setBulkText] = useState("");
  const [inputTab, setInputTab] = useState<"rows" | "bulk">("rows");

  // Admin evaluation state
  const [adminScore, setAdminScore] = useState<number>(
    submission?.admin_score ?? criterion.max_score_snapshot ?? 0
  );
  const [adminComment, setAdminComment] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync internal state when item props change (e.g. after refetch)
  useEffect(() => {
    if (currentRevision?.self_score !== undefined && currentRevision?.self_score !== null) {
      setSelfScore(currentRevision.self_score);
    } else {
      setSelfScore(criterion.max_score_snapshot ?? 0);
    }
  }, [currentRevision?.self_score, criterion.max_score_snapshot]);

  useEffect(() => {
    if (submission?.admin_score !== undefined && submission?.admin_score !== null) {
      setAdminScore(submission.admin_score);
    } else {
      setAdminScore(criterion.max_score_snapshot ?? 0);
    }
  }, [submission?.admin_score, criterion.max_score_snapshot]);

  useEffect(() => {
    setLocalEvidence(evidenceItems);
  }, [evidenceItems]);

  const status: SubmissionStatus = submission?.status || "draft";
  const isEditableUser = mode === "user" && status !== "verified";
  const isVerified = status === "verified";

  // Calculate required evidence counts
  const hasDoc1 = !!criterion.req_doc1;
  const hasDoc2 = !!criterion.req_doc2;
  const hasLink3 = !!criterion.req_link3;
  const hasAnyReq = hasDoc1 || hasDoc2 || hasLink3;

  const doc1Items = localEvidence.filter((e) => e.evidence_type === "doc1");
  const doc2Items = localEvidence.filter((e) => e.evidence_type === "doc2");
  const link3Items = localEvidence.filter((e) => e.evidence_type === "link3");

  const doc1Count = doc1Items.length;
  const doc2Count = doc2Items.length;
  const link3Count = link3Items.length;

  let totalReqTypes = 0;
  let fulfilledReqTypes = 0;

  if (hasDoc1) {
    totalReqTypes++;
    if (doc1Count > 0) fulfilledReqTypes++;
  }
  if (hasDoc2) {
    totalReqTypes++;
    if (doc2Count > 0) fulfilledReqTypes++;
  }
  if (hasLink3) {
    totalReqTypes++;
    if (link3Count > 0) fulfilledReqTypes++;
  }

  // File upload handler
  const handleFileUpload = async (type: EvidenceType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateEvidenceFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    let storagePath: string | null = null;
    try {
      await withLoading(async () => {
        const res = await uploadEvidenceFile({
          bucket: "evidence",
          orgId: "org",
          periodId: criterion.period_id,
          entityId: submission?.id || criterion.id,
          revisionId: currentRevision?.id,
          file,
        });
        storagePath = res.path;
      }, `Đang tải tệp "${file.name}" lên máy chủ...`);
    } catch {
      storagePath = `evidence/${criterion.id}/${file.name}`;
    }

    const newItem: EvidenceItem = {
      id: "temp-" + Date.now(),
      revision_id: currentRevision?.id || "temp-rev",
      evidence_type: type,
      file_name: file.name,
      storage_path: storagePath,
      external_url: null,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      uploaded_by: null,
      created_at: new Date().toISOString(),
    };

    setLocalEvidence((prev) => [...prev, newItem]);
    toast.success(`Đã thêm tệp "${file.name}"`);
    e.target.value = "";
  };

  // View / Open file
  const handleViewFile = async (evItem: EvidenceItem) => {
    if (evItem.external_url) {
      window.open(evItem.external_url, "_blank");
      return;
    }
    if (evItem.storage_path) {
      try {
        const signedUrl = await getEvidenceSignedUrl("evidence", evItem.storage_path);
        window.open(signedUrl, "_blank");
      } catch {
        toast.info(`Tệp minh chứng: ${evItem.file_name}`);
      }
    } else {
      toast.info(`Tệp minh chứng: ${evItem.file_name}`);
    }
  };

  // Add Multiple Links (Rows or Bulk paste)
  const handleAddMultipleLinks = () => {
    const toAdd: { title: string; url: string }[] = [];

    if (inputTab === "rows") {
      for (const row of linkRows) {
        const trimmedUrl = row.url.trim();
        if (!trimmedUrl) continue;
        try {
          new URL(trimmedUrl);
          toAdd.push({
            title: row.title.trim() || trimmedUrl,
            url: trimmedUrl,
          });
        } catch {
          toast.error(`Đường dẫn không hợp lệ: "${trimmedUrl}" (phải bắt đầu bằng http:// hoặc https://)`);
          return;
        }
      }
    } else {
      // Bulk paste mode
      const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          new URL(line);
          toAdd.push({
            title: line,
            url: line,
          });
        } catch {
          toast.error(`Đường dẫn không hợp lệ trong danh sách: "${line}"`);
          return;
        }
      }
    }

    if (toAdd.length === 0) {
      toast.error("Vui lòng nhập ít nhất một đường dẫn URL hợp lệ.");
      return;
    }

    const newItems: EvidenceItem[] = toAdd.map((item, idx) => ({
      id: "temp-link-" + Date.now() + "-" + idx,
      revision_id: currentRevision?.id || "temp-rev",
      evidence_type: linkType,
      file_name: item.title,
      storage_path: null,
      external_url: item.url,
      mime_type: "text/uri-list",
      file_size: null,
      uploaded_by: null,
      created_at: new Date().toISOString(),
    }));

    setLocalEvidence((prev) => [...prev, ...newItems]);
    setLinkRows([{ id: Date.now().toString(), title: "", url: "" }]);
    setBulkText("");
    setLinkDialogOpen(false);
    toast.success(`Đã thêm ${newItems.length} liên kết minh chứng!`);
  };

  const openLinkDialogForType = (type: EvidenceType) => {
    setLinkType(type);
    setLinkRows([{ id: Date.now().toString(), title: "", url: "" }]);
    setBulkText("");
    setInputTab("rows");
    setLinkDialogOpen(true);
  };

  // Remove evidence
  const handleRemoveEvidence = (id: string) => {
    setLocalEvidence((prev) => prev.filter((e) => e.id !== id));
    toast.info("Đã xóa minh chứng.");
  };

  // Format date helper
  const formatDeadline = (dl: string | null | undefined) => {
    if (!dl) return "00:00 11/1/26";
    try {
      const d = new Date(dl);
      if (isNaN(d.getTime())) return dl;
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const day = d.getDate();
      const month = d.getMonth() + 1;
      const year = String(d.getFullYear()).slice(-2);
      return `${hours}:${minutes} ${day}/${month}/${year}`;
    } catch {
      return dl;
    }
  };

  // Construct default requirement overview string
  const generalRequirements =
    criterion.description_snapshot ||
    (!hasAnyReq
      ? "Không yêu cầu minh chứng. Chấm điểm theo đánh giá thực tế."
      : [
          hasDoc1 ? "1. Văn bản triển khai" : null,
          hasDoc2 ? "2. Báo cáo tóm tắt kết quả" : null,
          hasLink3 ? "3. Tin bài về hoạt động (hình ảnh phải rõ nội dung, thời gian tổ chức)" : null,
        ]
          .filter(Boolean)
          .join(". "));

  const displayScore =
    mode === "admin"
      ? (submission?.admin_score ?? currentRevision?.self_score ?? 0)
      : (currentRevision?.self_score ?? selfScore ?? 0);

  const maxScore = criterion.max_score_snapshot ?? 4;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white transition-all duration-200 shadow-2xs overflow-hidden",
        isOpen && "ring-1 ring-slate-300"
      )}
    >
      {/* ============================================================ */}
      {/* HEADER ROW - MATCHES EXACT DESIGN FROM SCREENSHOT */}
      {/* ============================================================ */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3 sm:px-6 sm:py-3.5 cursor-pointer select-none bg-white hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-slate-800"
      >
        {/* Left: Code + Title with Max Score */}
        <div className="flex items-baseline gap-3 flex-1 min-w-0">
          <span className="font-bold text-sm sm:text-base text-slate-900 shrink-0 w-8 sm:w-10">
            {criterion.code_snapshot || "1.0"}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
              {criterion.title_snapshot}
              {criterion.max_score_snapshot !== null && (
                <span className="text-slate-800 font-bold ml-1">
                  : {criterion.max_score_snapshot}đ
                </span>
              )}
            </h4>
          </div>
        </div>

        {/* Center: Score + Fulfilled Requirements */}
        <div className="flex items-center gap-6 sm:gap-10 shrink-0 text-xs sm:text-sm text-slate-700">
          <div className="font-semibold text-slate-800 min-w-10 text-center">
            {displayScore}/{maxScore}
          </div>
          <div className="font-medium text-slate-600 min-w-24 text-center">
            {hasAnyReq ? (
              `${fulfilledReqTypes}/${totalReqTypes} yêu cầu`
            ) : (
              <span className="italic text-slate-400 font-normal">Không yêu cầu MC</span>
            )}
          </div>
        </div>

        {/* Right: Badges & Toggle Action Button */}
        <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
          {/* Status Badges stacked vertically or inline */}
          <div className="flex flex-col items-center gap-1">
            {status === "submitted" || status === "verified" ? (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#eaf7ee] text-[#1b7e3f]">
                Đã nộp
              </span>
            ) : (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                Chưa nộp
              </span>
            )}

            {status === "verified" ? (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Đã thẩm định
              </span>
            ) : status === "submitted" ? (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
                Chờ xác thực
              </span>
            ) : status === "revision_requested" ? (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-300">
                Cần bổ sung
              </span>
            ) : (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-300">
                Chưa thẩm định
              </span>
            )}
          </div>

          {/* Toggle Button: Dark Navy pill button */}
          <button
            type="button"
            className="rounded-md bg-[#2d325a] hover:bg-[#232746] text-white text-xs font-medium px-3.5 py-1.5 shadow-2xs transition-colors shrink-0 ml-1"
          >
            {isOpen ? "Thu gọn" : "Chi tiết"}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* EXPANDED TWO-COLUMN SECTION */}
      {/* ============================================================ */}
      {isOpen && (
        <div className="border-t border-slate-200 p-4 sm:p-6 bg-slate-50/50">
          {/* Admin Evaluation, Score & Remarks Box */}
          {((submission?.admin_score !== null && submission?.admin_score !== undefined) || reviewActions.length > 0) && (
            <div
              className={cn(
                "mb-5 p-4 rounded-xl border text-xs sm:text-sm transition-all shadow-2xs",
                status === "verified"
                  ? "bg-emerald-50/90 border-emerald-300 text-emerald-950"
                  : status === "revision_requested"
                  ? "bg-amber-50/90 border-amber-300 text-amber-950"
                  : "bg-blue-50/90 border-blue-200 text-blue-950"
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 mb-2.5 border-black/10">
                <div className="flex items-center gap-2 font-bold">
                  {status === "verified" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>Kết quả thẩm định từ Hội đồng Đội</span>
                    </>
                  ) : status === "revision_requested" ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
                      <span>Ý kiến yêu cầu bổ sung từ Hội đồng Đội</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0" />
                      <span>Thông tin thẩm định từ Hội đồng Đội</span>
                    </>
                  )}
                </div>

                {/* Score comparison pill */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-600">
                    Điểm tự chấm: <strong>{currentRevision?.self_score ?? selfScore}đ</strong>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-xs font-bold text-emerald-800 bg-white/90 px-2.5 py-0.5 rounded border border-emerald-300 shadow-2xs">
                    Điểm thẩm định:{" "}
                    {submission?.admin_score !== null && submission?.admin_score !== undefined
                      ? `${submission.admin_score} / ${maxScore}đ`
                      : "Chưa chấm"}
                  </span>
                </div>
              </div>

              {/* Latest Comment / Remarks */}
              {reviewActions.length > 0 && reviewActions[reviewActions.length - 1].comment ? (
                <div className="space-y-1">
                  <div className="font-semibold text-slate-800 text-xs">
                    Nhận xét & Ý kiến đánh giá của Hội đồng:
                  </div>
                  <p className="bg-white/95 p-3 rounded-lg border border-slate-200 text-slate-800 leading-relaxed font-normal whitespace-pre-line text-xs shadow-2xs">
                    {reviewActions[reviewActions.length - 1].comment}
                  </p>
                </div>
              ) : status === "verified" ? (
                <p className="text-xs text-emerald-800">
                  Hồ sơ minh chứng đã được Hội đồng thẩm định và phê duyệt đạt yêu cầu.
                </p>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ------------------------------------------------------------ */}
            {/* LEFT COLUMN: THÔNG TIN TIÊU CHÍ (approx. 5 cols) */}
            {/* ------------------------------------------------------------ */}
            <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4 text-xs sm:text-sm">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base border-b pb-2">
                Thông tin tiêu chí
              </h3>

              {/* Definition list table style */}
              <div className="space-y-3.5 text-slate-800">
                {/* 1. Nội dung */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 font-bold text-slate-800">Nội dung</div>
                  <div className="col-span-8 text-slate-700 leading-relaxed font-normal">
                    {criterion.title_snapshot}
                  </div>
                </div>

                {/* 2. Nguyên tắc chấm */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 font-bold text-slate-800">Nguyên tắc chấm</div>
                  <div className="col-span-8 text-slate-700 leading-relaxed whitespace-pre-line font-normal">
                    {criterion.scoring_snapshot ||
                      `- Đảm bảo minh chứng: ${maxScore} điểm.\n- Thiếu 1 ngày hoặc 1 minh chứng trừ 1 điểm\n- Không đảm bảo: 0 điểm.`}
                  </div>
                </div>

                {/* 3. Yêu cầu chung */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 font-bold text-slate-800">Yêu cầu chung</div>
                  <div className="col-span-8 text-slate-700 leading-relaxed font-normal">
                    {generalRequirements}
                  </div>
                </div>

                {/* 4. Tổ phụ trách */}
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 font-bold text-slate-800">Tổ phụ trách</div>
                  <div className="col-span-8 font-medium text-slate-800">
                    {criterion.responsible_unit_snapshot || "Tổ Phong trào"}
                  </div>
                </div>

                {/* 5. Thời hạn */}
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 font-bold text-slate-800">Thời hạn</div>
                  <div className="col-span-8 font-medium text-slate-700">
                    {formatDeadline(criterion.deadline_snapshot)}
                  </div>
                </div>

                {/* 6. Điểm tự chấm (User) */}
                <div className="grid grid-cols-12 gap-2 items-center pt-2 border-t border-slate-100">
                  <div className="col-span-4 font-bold text-slate-800">Điểm tự chấm</div>
                  <div className="col-span-8 flex items-center gap-2">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      max={maxScore}
                      disabled={!isEditableUser}
                      value={selfScore}
                      onChange={(e) => setSelfScore(parseFloat(e.target.value) || 0)}
                      className={cn(
                        "w-16 h-8 text-center border border-slate-300 rounded font-semibold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600",
                        !isEditableUser && "bg-slate-50 text-slate-600"
                      )}
                    />
                    <span className="text-slate-600 font-medium">/ {maxScore} điểm</span>
                  </div>
                </div>
              </div>

              {/* ADMIN MODE GRADING SECTION */}
              {mode === "admin" && (
                <div className="pt-4 border-t border-slate-200 space-y-3 bg-slate-50/80 p-3.5 rounded-lg mt-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wide">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    Thẩm định & Chấm điểm (Admin)
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5 font-bold text-slate-700 text-xs">
                      Điểm chính thức:
                    </div>
                    <div className="col-span-7 flex items-center gap-2">
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max={maxScore}
                        value={adminScore}
                        onChange={(e) => setAdminScore(parseFloat(e.target.value) || 0)}
                        className="w-16 h-8 text-center border border-emerald-300 rounded font-bold text-emerald-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-slate-600">/ {maxScore} điểm</span>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Ý kiến thẩm định:
                    </Label>
                    <Textarea
                      placeholder="Nhập ghi chú hoặc lý do yêu cầu bổ sung..."
                      rows={2}
                      value={adminComment}
                      onChange={(e) => setAdminComment(e.target.value)}
                      className="mt-1 text-xs bg-white"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      className="bg-[#2e7d32] hover:bg-[#256629] text-white gap-1 flex-1 text-xs"
                      disabled={isSubmitting || isVerified}
                      onClick={async () => {
                        if (adminScore < 0 || adminScore > maxScore) {
                          toast.error(`Điểm thẩm định phải từ 0 đến ${maxScore}`);
                          return;
                        }
                        if (submission?.id && onAdminVerify) {
                          setIsSubmitting(true);
                          await onAdminVerify(submission.id, adminScore, adminComment);
                          setIsSubmitting(false);
                        }
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Xác thực
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-800 border-amber-300 hover:bg-amber-50 gap-1 flex-1 text-xs"
                      disabled={isSubmitting || isVerified}
                      onClick={async () => {
                        if (!adminComment.trim()) {
                          toast.error("Vui lòng nhập nhận xét/lý do yêu cầu bổ sung.");
                          return;
                        }
                        if (submission?.id && onAdminRequestRevision) {
                          setIsSubmitting(true);
                          await onAdminRequestRevision(submission.id, adminComment);
                          setIsSubmitting(false);
                        }
                      }}
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      Yêu cầu bổ sung
                    </Button>

                    {isVerified && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-600 hover:bg-slate-200 text-xs w-full gap-1 mt-1"
                        onClick={() => setReopenDialogOpen(true)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Mở lại thẩm định
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Information banner when waiting for verification */}
              {mode === "user" && status === "submitted" && (
                <div className="text-xs text-emerald-800 bg-emerald-50/80 p-2.5 rounded-md border border-emerald-200 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>Tiêu chí đang chờ thẩm định. Bạn có thể cập nhật minh chứng, sửa điểm và bấm lưu lại trước khi Hội đồng chấm điểm.</span>
                </div>
              )}

              {/* USER MODE BUTTONS */}
              {mode === "user" && isEditableUser && (
                <div className="flex items-center gap-2 pt-3 border-t">
                  {status === "submitted" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs gap-1"
                        disabled={isSubmitting}
                        onClick={async () => {
                          if (onSaveDraft) {
                            setIsSubmitting(true);
                            await onSaveDraft(criterion.id, selfScore, localEvidence);
                            setIsSubmitting(false);
                          }
                        }}
                      >
                        <Save className="h-3.5 w-3.5" />
                        Lưu bản nháp
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-[#2d325a] hover:bg-[#232746] text-white text-xs gap-1"
                        disabled={isSubmitting}
                        onClick={async () => {
                          if (selfScore <= 0) {
                            toast.error("Vui lòng tự cho điểm trước khi lưu.");
                            return;
                          }
                          if (onSubmit) {
                            setIsSubmitting(true);
                            await onSubmit(criterion.id, selfScore, localEvidence);
                            setIsSubmitting(false);
                          }
                        }}
                      >
                        <Save className="h-3.5 w-3.5" />
                        Lưu cập nhật minh chứng
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs gap-1"
                        disabled={isSubmitting}
                        onClick={async () => {
                          if (onSaveDraft) {
                            setIsSubmitting(true);
                            await onSaveDraft(criterion.id, selfScore, localEvidence);
                            setIsSubmitting(false);
                          }
                        }}
                      >
                        <Save className="h-3.5 w-3.5" />
                        Lưu nháp
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-[#2d325a] hover:bg-[#232746] text-white text-xs gap-1"
                        disabled={isSubmitting}
                        onClick={async () => {
                          if (selfScore <= 0) {
                            toast.error("Vui lòng tự cho điểm trước khi nộp.");
                            return;
                          }
                          if (onSubmit) {
                            setIsSubmitting(true);
                            await onSubmit(criterion.id, selfScore, localEvidence);
                            setIsSubmitting(false);
                          }
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Nộp tiêu chí (Chờ xác thực)
                      </Button>
                    </>
                  )}
                </div>
              )}

              {mode === "user" && isVerified && (
                <div className="pt-3 border-t text-xs text-emerald-700 font-medium flex items-center gap-1.5 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-100">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Tiêu chí đã được Hội đồng xác thực ({submission?.admin_score}đ). Hồ sơ đã khóa chỉnh sửa.</span>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------ */}
            {/* RIGHT COLUMN: MINH CHỨNG CẦN NỘP (approx. 7 cols) */}
            {/* ------------------------------------------------------------ */}
            <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="border-b pb-2 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Minh chứng cần nộp
                </h3>
                {hasAnyReq && (
                  <span className="text-xs text-slate-500">
                    Đã hoàn thành {fulfilledReqTypes}/{totalReqTypes} mục yêu cầu
                  </span>
                )}
              </div>

              {!hasAnyReq ? (
                <div className="p-8 text-center bg-[#fbfcfd] rounded-xl border border-dashed border-slate-200 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                  <h4 className="font-semibold text-slate-800 text-sm">
                    Tiêu chí không yêu cầu nộp minh chứng
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Đơn vị chỉ cần tự cho điểm theo hướng dẫn và bấm lưu/nộp bài để Hội đồng thẩm định xem xét.
                  </p>
                </div>
              ) : (
                <>
                  {/* SECTION 1: Văn bản triển khai (doc1) */}
                  {hasDoc1 && (
                    <EvidenceSubCard
                      title="Văn bản triển khai"
                      badgeText="Văn bản"
                      isRequired={true}
                      items={doc1Items}
                      isEditable={isEditableUser}
                      onUploadImage={(e) => handleFileUpload("doc1", e)}
                      onUploadFile={(e) => handleFileUpload("doc1", e)}
                      onOpenAddLink={() => openLinkDialogForType("doc1")}
                      onRemove={handleRemoveEvidence}
                      onViewFile={handleViewFile}
                    />
                  )}

                  {/* SECTION 2: Báo cáo tóm tắt kết quả (doc2) */}
                  {hasDoc2 && (
                    <EvidenceSubCard
                      title="Báo cáo tóm tắt kết quả."
                      badgeText="Báo cáo"
                      isRequired={true}
                      items={doc2Items}
                      isEditable={isEditableUser}
                      onUploadImage={(e) => handleFileUpload("doc2", e)}
                      onUploadFile={(e) => handleFileUpload("doc2", e)}
                      onOpenAddLink={() => openLinkDialogForType("doc2")}
                      onRemove={handleRemoveEvidence}
                      onViewFile={handleViewFile}
                    />
                  )}

                  {/* SECTION 3: Tin bài về hoạt động (link3) */}
                  {hasLink3 && (
                    <EvidenceSubCard
                      title="Tin bài về hoạt động (hình ảnh phải rõ nội dung, thời gian tổ chức)."
                      badgeText="Liên kết"
                      isRequired={true}
                      items={link3Items}
                      isEditable={isEditableUser}
                      onUploadImage={(e) => handleFileUpload("link3", e)}
                      onUploadFile={(e) => handleFileUpload("link3", e)}
                      onOpenAddLink={() => openLinkDialogForType("link3")}
                      onRemove={handleRemoveEvidence}
                      onViewFile={handleViewFile}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DIALOG: ADD EVIDENCE LINK (SUPPORTS MULTIPLE LINKS) */}
      {/* ============================================================ */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-5">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-emerald-700" />
              Thêm liên kết minh chứng
            </DialogTitle>
            <DialogDescription className="text-xs">
              Bạn có thể thêm một hoặc nhiều liên kết (Google Drive, Fanpage, tin bài, văn bản điện tử) cùng một lúc.
            </DialogDescription>
          </DialogHeader>

          {/* Tab selector */}
          <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold pt-1">
            <button
              type="button"
              onClick={() => setInputTab("rows")}
              className={cn(
                "pb-2 border-b-2 transition-colors cursor-pointer",
                inputTab === "rows"
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              Thêm từng liên kết (kèm tên)
            </button>
            <button
              type="button"
              onClick={() => setInputTab("bulk")}
              className={cn(
                "pb-2 border-b-2 transition-colors cursor-pointer",
                inputTab === "bulk"
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              Dán nhanh nhiều link (1 link/dòng)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 space-y-3 text-xs">
            {inputTab === "rows" ? (
              <div className="space-y-3">
                {linkRows.map((row, idx) => (
                  <div key={row.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2 relative">
                    <div className="flex items-center justify-between text-slate-600 font-medium">
                      <span>Liên kết #{idx + 1}</span>
                      {linkRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLinkRows((prev) => prev.filter((r) => r.id !== row.id))}
                          className="text-slate-400 hover:text-red-600 p-0.5 cursor-pointer"
                          title="Xóa dòng này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div>
                      <Input
                        placeholder="Tiêu đề / Tên liên kết (VD: Bài viết ngày Hội Đội)"
                        value={row.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLinkRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, title: val } : r))
                          );
                        }}
                        className="text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Input
                        placeholder="Đường dẫn URL * (VD: https://facebook.com/...)"
                        value={row.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLinkRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, url: val } : r))
                          );
                        }}
                        className="text-xs bg-white"
                      />
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLinkRows((prev) => [...prev, { id: Date.now().toString(), title: "", url: "" }])
                  }
                  className="w-full text-xs border-dashed border-slate-300 text-slate-600 hover:text-slate-900 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm liên kết khác
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs text-slate-700 font-medium">Danh sách đường dẫn (Mỗi dòng 1 URL)</Label>
                <Textarea
                  placeholder={`https://facebook.com/benluc/posts/123\nhttps://drive.google.com/file/d/abc\nhttps://doanthanhnien.vn/tin-tuc/...`}
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="text-xs font-mono bg-white"
                />
                <p className="text-[11px] text-slate-500">
                  Dán trực tiếp danh sách các link vào đây. Hệ thống sẽ tự động tạo từng mục minh chứng cho mỗi đường dẫn.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t flex items-center justify-between sm:justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={handleAddMultipleLinks}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Thêm các liên kết
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: ADMIN REOPEN SUBMISSION */}
      {/* ============================================================ */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mở lại thẩm định tiêu chí</DialogTitle>
            <DialogDescription>
              Theo quy định, thao tác mở lại bài thi đã xác thực phải ghi rõ lý do vào Nhật ký hoạt động.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs">Lý do mở lại thẩm định *</Label>
            <Textarea
              placeholder="Nhập lý do chi tiết..."
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReopenDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!reopenReason.trim()) {
                  toast.error("Vui lòng nhập lý do mở lại.");
                  return;
                }
                if (submission?.id && onAdminReopen) {
                  await onAdminReopen(submission.id, reopenReason);
                  setReopenDialogOpen(false);
                  setReopenReason("");
                }
              }}
            >
              Xác nhận mở lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// HELPER COMPONENT: EvidenceSubCard
// Matches the exact visual in the screenshot:
// - Title with asterisk + Badge on right ("Văn bản", "Báo cáo", "Liên kết")
// - Toolbar: [📷 Tải ảnh]  [📄 Tải tệp]  [🔗 Thêm liên kết]
// - Uploaded box: [📄 FILE_NAME.pdf • 190.9 KB] [Mở]
// ============================================================

interface EvidenceSubCardProps {
  title: string;
  badgeText: string;
  isRequired?: boolean;
  items: EvidenceItem[];
  isEditable: boolean;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenAddLink: () => void;
  onRemove: (id: string) => void;
  onViewFile: (item: EvidenceItem) => void;
}

function EvidenceSubCard({
  title,
  badgeText,
  isRequired = true,
  items,
  isEditable,
  onUploadImage,
  onUploadFile,
  onOpenAddLink,
  onRemove,
  onViewFile,
}: EvidenceSubCardProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return "0 KB";
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfcfd] p-3.5 space-y-3">
      {/* Category Header */}
      <div className="flex items-center justify-between gap-2">
        <h5 className="font-bold text-xs sm:text-sm text-slate-800 leading-snug">
          {title} {isRequired && <span className="text-slate-700 font-bold">*</span>}
        </h5>
        <Badge
          variant="outline"
          className="text-[11px] font-normal px-2 py-0.5 bg-slate-100 text-slate-700 border-slate-200 shrink-0"
        >
          {badgeText}
        </Badge>
      </div>

      {/* Action Toolbar */}
      {isEditable && (
        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
          {/* Hidden image input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUploadImage}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer py-0.5"
          >
            <Camera className="h-3.5 w-3.5 text-slate-500" />
            <span>Tải ảnh</span>
          </button>

          {/* Hidden doc/file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={onUploadFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer py-0.5"
          >
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            <span>Tải tệp</span>
          </button>

          {/* Add link button */}
          <button
            type="button"
            onClick={onOpenAddLink}
            className="flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer py-0.5"
          >
            <LinkIcon className="h-3.5 w-3.5 text-slate-500" />
            <span>Thêm liên kết</span>
          </button>
        </div>
      )}

      {/* Uploaded Items List */}
      {items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-md p-3 text-center text-[11px] text-slate-400">
          Chưa có minh chứng nào được tải lên
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((ev) => {
            const isUrl = !!ev.external_url;
            return (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-slate-200 bg-white hover:border-slate-300 transition-all text-xs"
              >
                {/* File icon + Name + Size */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isUrl ? (
                    <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-600 shrink-0" />
                  )}
                  <span className="font-bold text-slate-800 uppercase truncate">
                    {ev.file_name}
                  </span>
                  {ev.file_size ? (
                    <span className="text-slate-500 font-normal shrink-0">
                      • {formatFileSize(ev.file_size)}
                    </span>
                  ) : null}
                </div>

                {/* Open button & Delete action */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onViewFile(ev)}
                    className="font-medium text-slate-800 hover:text-emerald-800 hover:underline px-2 py-0.5 text-xs rounded transition-colors"
                  >
                    Mở
                  </button>

                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => onRemove(ev.id)}
                      className="text-slate-400 hover:text-red-600 p-0.5 transition-colors"
                      title="Xóa minh chứng này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
