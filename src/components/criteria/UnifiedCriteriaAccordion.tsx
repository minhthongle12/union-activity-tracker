import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  FileCheck2,
  Globe,
  Upload,
  Link as LinkIcon,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  validateEvidenceFile,
  uploadEvidenceFile,
  getEvidenceSignedUrl,
} from "@/lib/storage";

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
    currentRevision?.self_score ?? 0
  );

  // Local evidence list
  const [localEvidence, setLocalEvidence] = useState<EvidenceItem[]>(evidenceItems);

  // Add Link dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkType, setLinkType] = useState<EvidenceType>("link3");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");

  // Admin evaluation state
  const [adminScore, setAdminScore] = useState<number>(
    submission?.admin_score ?? criterion.max_score_snapshot ?? 0
  );
  const [adminComment, setAdminComment] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const status: SubmissionStatus = submission?.status || "draft";
  const isEditableUser = mode === "user" && (status === "draft" || status === "revision_requested");
  const isVerified = status === "verified";

  // Calculate required evidence status
  const doc1Count = localEvidence.filter((e) => e.evidence_type === "doc1").length;
  const doc2Count = localEvidence.filter((e) => e.evidence_type === "doc2").length;
  const link3Count = localEvidence.filter((e) => e.evidence_type === "link3").length;

  let totalReqTypes = 0;
  let fulfilledReqTypes = 0;

  if (criterion.req_doc1) {
    totalReqTypes++;
    if (doc1Count > 0) fulfilledReqTypes++;
  }
  if (criterion.req_doc2) {
    totalReqTypes++;
    if (doc2Count > 0) fulfilledReqTypes++;
  }
  if (criterion.req_link3) {
    totalReqTypes++;
    if (link3Count > 0) fulfilledReqTypes++;
  }

  // Real file upload to Supabase Storage with graceful offline fallback
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
      const res = await uploadEvidenceFile({
        bucket: "evidence",
        orgId: "org",
        periodId: criterion.period_id,
        entityId: submission?.id || criterion.id,
        revisionId: currentRevision?.id,
        file,
      });
      storagePath = res.path;
    } catch {
      // In development or when bucket is not yet created, save path structure locally
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

    setLocalEvidence([...localEvidence, newItem]);
    toast.success(`Đã thêm tệp "${file.name}"`);
    e.target.value = "";
  };

  const handleViewFile = async (evItem: EvidenceItem) => {
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

  const handleAddLink = () => {
    if (!linkUrl.trim()) {
      toast.error("Vui lòng nhập đường dẫn URL.");
      return;
    }
    try {
      new URL(linkUrl);
    } catch {
      toast.error("Đường dẫn không hợp lệ (phải bắt đầu bằng http:// hoặc https://).");
      return;
    }

    const linkItem: EvidenceItem = {
      id: "temp-link-" + Date.now(),
      revision_id: currentRevision?.id || "temp-rev",
      evidence_type: linkType,
      file_name: linkTitle.trim() || linkUrl,
      storage_path: null,
      external_url: linkUrl.trim(),
      mime_type: "text/uri-list",
      file_size: null,
      uploaded_by: null,
      created_at: new Date().toISOString(),
    };

    setLocalEvidence([...localEvidence, linkItem]);
    setLinkUrl("");
    setLinkTitle("");
    setLinkDialogOpen(false);
    toast.success("Đã thêm liên kết minh chứng!");
  };

  const handleRemoveEvidence = (id: string) => {
    setLocalEvidence(localEvidence.filter((e) => e.id !== id));
    toast.info("Đã xóa minh chứng.");
  };

  const getStatusBadge = () => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-300">Chưa nộp</Badge>;
      case "submitted":
        return <Badge className="bg-blue-600 text-white">Đã nộp</Badge>;
      case "revision_requested":
        return <Badge className="bg-amber-600 text-white gap-1"><AlertCircle className="h-3 w-3" /> Cần bổ sung</Badge>;
      case "verified":
        return <Badge className="bg-emerald-700 text-white gap-1"><CheckCircle2 className="h-3 w-3" /> Đã xác thực</Badge>;
    }
  };

  return (
    <Card className={cn(
      "border transition-all duration-200 overflow-hidden",
      isOpen ? "border-blue-400 shadow-md ring-1 ring-blue-100" : "hover:border-slate-300"
    )}>
      {/* ============================================================ */}
      {/* 8.2 COLLAPSED ACCORDION HEADER */}
      {/* ============================================================ */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 cursor-pointer select-none bg-white hover:bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Badge className="bg-slate-900 text-white font-mono text-xs shrink-0 mt-0.5">
            {criterion.code_snapshot}
          </Badge>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-sm text-slate-900 leading-snug line-clamp-2">
              {criterion.title_snapshot}
            </h4>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              <span>Điểm tối đa: <b className="text-slate-800">{criterion.max_score_snapshot}đ</b></span>
              {currentRevision?.self_score !== null && currentRevision?.self_score !== undefined && (
                <span>Tự chấm: <b className="text-blue-700">{currentRevision.self_score}đ</b></span>
              )}
              {submission?.admin_score !== null && submission?.admin_score !== undefined && (
                <span>Chính thức: <b className="text-emerald-700 font-bold">{submission.admin_score}đ</b></span>
              )}
              {totalReqTypes > 0 ? (
                <span className={cn(
                  "font-medium",
                  fulfilledReqTypes === totalReqTypes ? "text-emerald-600" : "text-amber-600"
                )}>
                  {fulfilledReqTypes}/{totalReqTypes} loại minh chứng
                </span>
              ) : (
                <span className="italic text-slate-400">Không yêu cầu MC</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
          {getStatusBadge()}
          <button className="text-slate-400 hover:text-slate-600 p-1">
            {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 8.3 EXPANDED TWO-COLUMN LAYOUT */}
      {/* ============================================================ */}
      {isOpen && (
        <div className="border-t border-slate-100 p-4 sm:p-6 bg-slate-50/40">
          {/* Admin Feedback Box if under revision */}
          {status === "revision_requested" && reviewActions.length > 0 && (
            <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Yêu cầu bổ sung từ Quản trị viên:
              </div>
              <p className="text-xs sm:text-sm pl-6">{reviewActions[reviewActions.length - 1].comment || "Vui lòng kiểm tra và bổ sung đầy đủ minh chứng theo hướng dẫn."}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ------------------------------------------------------------ */}
            {/* LEFT COLUMN: THÔNG TIN TIÊU CHÍ (5 cols) */}
            {/* ------------------------------------------------------------ */}
            <div className="lg:col-span-5 space-y-4 bg-white p-5 rounded-lg border border-slate-200 shadow-2xs">
              <div className="border-b pb-2">
                <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                  Thông tin tiêu chí
                </span>
                <h3 className="font-semibold text-slate-900 text-base mt-1">
                  [{criterion.code_snapshot}] {criterion.title_snapshot}
                </h3>
              </div>

              {criterion.description_snapshot && (
                <div>
                  <Label className="text-xs text-muted-foreground">Nội dung chi tiết</Label>
                  <p className="text-xs sm:text-sm text-slate-700 mt-0.5 leading-relaxed">
                    {criterion.description_snapshot}
                  </p>
                </div>
              )}

              {criterion.scoring_snapshot && (
                <div className="p-3 rounded-md bg-blue-50/60 border border-blue-100">
                  <Label className="text-xs text-blue-900 font-semibold">Nguyên tắc chấm điểm</Label>
                  <p className="text-xs text-blue-800 mt-1 whitespace-pre-line leading-relaxed">
                    {criterion.scoring_snapshot}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <span className="text-muted-foreground block">Đơn vị phụ trách</span>
                  <span className="font-medium text-slate-800">
                    {criterion.responsible_unit_snapshot || "Theo quy định"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Điểm tối đa</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {criterion.max_score_snapshot} điểm
                  </span>
                </div>
              </div>

              {/* USER: Self-score input */}
              <div className="pt-2 border-t">
                <Label htmlFor={`self-score-${criterion.id}`} className="text-xs font-semibold text-slate-800">
                  Điểm tự chấm (Đoàn cơ sở) <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id={`self-score-${criterion.id}`}
                    type="number"
                    step="0.25"
                    min="0"
                    max={criterion.max_score_snapshot || 10}
                    disabled={!isEditableUser}
                    value={selfScore}
                    onChange={(e) => setSelfScore(parseFloat(e.target.value) || 0)}
                    className="w-32 font-bold text-blue-700 text-base"
                  />
                  <span className="text-xs text-muted-foreground">
                    / {criterion.max_score_snapshot} điểm
                  </span>
                </div>
              </div>

              {/* ADMIN: Official Grading Section */}
              {mode === "admin" && (
                <div className="pt-4 border-t border-slate-200 space-y-3 bg-slate-50 p-3 rounded-md">
                  <Label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-blue-700" />
                    Thẩm định & Chấm điểm (Admin)
                  </Label>

                  <div>
                    <Label className="text-xs">Điểm chính thức (0 - {criterion.max_score_snapshot})</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max={criterion.max_score_snapshot || 10}
                      value={adminScore}
                      onChange={(e) => setAdminScore(parseFloat(e.target.value) || 0)}
                      className="mt-1 font-bold text-emerald-700 text-base"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Nhận xét / Ý kiến thẩm định</Label>
                    <Textarea
                      placeholder="Ghi chú thẩm định hoặc lý do yêu cầu bổ sung..."
                      rows={2}
                      value={adminComment}
                      onChange={(e) => setAdminComment(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>

                  {/* Admin Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 flex-1"
                      disabled={isSubmitting || isVerified}
                      onClick={async () => {
                        if (adminScore < 0 || adminScore > (criterion.max_score_snapshot || 0)) {
                          toast.error(`Điểm thẩm định phải từ 0 đến ${criterion.max_score_snapshot}`);
                          return;
                        }
                        if (submission?.id && onAdminVerify) {
                          setIsSubmitting(true);
                          await onAdminVerify(submission.id, adminScore, adminComment);
                          setIsSubmitting(false);
                        }
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Xác thực tiêu chí
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-700 border-amber-300 hover:bg-amber-50 gap-1 flex-1"
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
                      <AlertCircle className="h-4 w-4" />
                      Yêu cầu bổ sung
                    </Button>

                    {isVerified && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-600 hover:bg-slate-200 text-xs w-full gap-1"
                        onClick={() => setReopenDialogOpen(true)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Mở lại thẩm định
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* USER ACTION BUTTONS */}
              {mode === "user" && isEditableUser && (
                <div className="flex items-center gap-2 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isSubmitting}
                    onClick={async () => {
                      if (onSaveDraft) {
                        setIsSubmitting(true);
                        await onSaveDraft(criterion.id, selfScore, localEvidence);
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    Lưu bản nháp
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1"
                    disabled={isSubmitting}
                    onClick={async () => {
                      if (selfScore <= 0) {
                        toast.error("Vui lòng tự chấm điểm lớn hơn 0 trước khi nộp.");
                        return;
                      }
                      if (onSubmit) {
                        setIsSubmitting(true);
                        await onSubmit(criterion.id, selfScore, localEvidence);
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Nộp tiêu chí
                  </Button>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------ */}
            {/* RIGHT COLUMN: MINH CHỨNG CẦN NỘP (7 cols) */}
            {/* ------------------------------------------------------------ */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                  Minh chứng cần nộp (Hỗ trợ nhiều tệp & liên kết)
                </span>
                <span className="text-xs text-muted-foreground">
                  Định dạng: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG
                </span>
              </div>

              {/* If no evidence required at all */}
              {!criterion.req_doc1 && !criterion.req_doc2 && !criterion.req_link3 && (
                <div className="p-8 text-center bg-white rounded-lg border text-sm text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  Tiêu chí này không yêu cầu minh chứng.
                </div>
              )}

              {/* SECTION 1: Văn bản triển khai (doc1) */}
              {criterion.req_doc1 && (
                <EvidenceSection
                  title="1. Văn bản triển khai"
                  badgeText="Bắt buộc"
                  type="doc1"
                  items={localEvidence.filter((e) => e.evidence_type === "doc1")}
                  isEditable={isEditableUser}
                  onUpload={(e) => handleFileUpload("doc1", e)}
                  onOpenAddLink={() => {
                    setLinkType("doc1");
                    setLinkDialogOpen(true);
                  }}
                  onRemove={handleRemoveEvidence}
                  onViewFile={handleViewFile}
                />
              )}

              {/* SECTION 2: Báo cáo kết quả (doc2) */}
              {criterion.req_doc2 && (
                <EvidenceSection
                  title="2. Báo cáo kết quả"
                  badgeText="Bắt buộc"
                  type="doc2"
                  items={localEvidence.filter((e) => e.evidence_type === "doc2")}
                  isEditable={isEditableUser}
                  onUpload={(e) => handleFileUpload("doc2", e)}
                  onOpenAddLink={() => {
                    setLinkType("doc2");
                    setLinkDialogOpen(true);
                  }}
                  onRemove={handleRemoveEvidence}
                  onViewFile={handleViewFile}
                />
              )}

              {/* SECTION 3: Tin bài hoạt động (link3) */}
              {criterion.req_link3 && (
                <EvidenceSection
                  title="3. Tin bài về hoạt động"
                  subtitle="Hình ảnh phải rõ nội dung, thời gian tổ chức"
                  badgeText="Bắt buộc"
                  type="link3"
                  items={localEvidence.filter((e) => e.evidence_type === "link3")}
                  isEditable={isEditableUser}
                  onUpload={(e) => handleFileUpload("link3", e)}
                  onOpenAddLink={() => {
                    setLinkType("link3");
                    setLinkDialogOpen(true);
                  }}
                  onRemove={handleRemoveEvidence}
                  onViewFile={handleViewFile}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DIALOG: ADD EVIDENCE LINK */}
      {/* ============================================================ */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm liên kết minh chứng</DialogTitle>
            <DialogDescription>
              Nhập đường dẫn bài viết, trang tin hoặc lưu trữ đám mây.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Tiêu đề / Ghi chú liên kết</Label>
              <Input
                placeholder="VD: Bài viết ra quân Ngày Chủ nhật xanh trên Fanpage"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Đường dẫn URL (http:// hoặc https://) *</Label>
              <Input
                placeholder="https://facebook.com/... hoặc https://drive.google.com/..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleAddLink}>
              Thêm liên kết
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: ADMIN REOPEN SUBMISSION (Requires Reason) */}
      {/* ============================================================ */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mở lại thẩm định tiêu chí</DialogTitle>
            <DialogDescription>
              Theo quy chuẩn PRD, việc mở lại tiêu chí đã xác thực bắt buộc phải nhập lý do và được lưu vào Nhật ký hoạt động (Audit log).
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs">Lý do mở lại thẩm định *</Label>
            <Textarea
              placeholder="Nhập lý do cụ thể..."
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (!reopenReason.trim()) {
                  toast.error("Bắt buộc phải nhập lý do mở lại.");
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
    </Card>
  );
}

// ============================================================
// HELPER COMPONENT: Evidence Section Card
// ============================================================

interface EvidenceSectionProps {
  title: string;
  subtitle?: string;
  badgeText: string;
  type: EvidenceType;
  items: EvidenceItem[];
  isEditable: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenAddLink: () => void;
  onRemove: (id: string) => void;
  onViewFile: (item: EvidenceItem) => void;
}

function EvidenceSection({
  title,
  subtitle,
  badgeText,
  type,
  items,
  isEditable,
  onUpload,
  onOpenAddLink,
  onRemove,
  onViewFile,
}: EvidenceSectionProps) {
  const inputId = `upload-${type}-${Math.random().toString(36).substring(7)}`;

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h5 className="font-semibold text-sm text-slate-800">{title}</h5>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
              {badgeText}
            </Badge>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        {/* Upload buttons if user has edit rights */}
        {isEditable && (
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="file"
              onChange={onUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            />
            <label htmlFor={inputId} className="cursor-pointer">
              <Button size="sm" variant="outline" asChild className="h-7 text-xs gap-1">
                <span>
                  <Upload className="h-3.5 w-3.5 text-blue-600" />
                  Thêm tệp
                </span>
              </Button>
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenAddLink}
              className="h-7 text-xs gap-1 text-slate-700"
            >
              <LinkIcon className="h-3.5 w-3.5 text-emerald-600" />
              Thêm link
            </Button>
          </div>
        )}
      </div>

      {/* Uploaded items list */}
      {items.length === 0 ? (
        <div className="border border-dashed rounded-md p-4 text-center text-xs text-slate-400 bg-slate-50/50">
          Chưa có minh chứng nào được tải lên.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-2 rounded-md border border-slate-100 bg-slate-50/70 text-xs hover:bg-slate-100/70 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                {item.external_url ? (
                  <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                )}
                <span className="font-medium truncate text-slate-800">
                  {item.file_name}
                </span>
                {item.file_size && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    ({Math.round(item.file_size / 1024)} KB)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {item.external_url ? (
                  <a
                    href={item.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-slate-500 hover:text-blue-600"
                    title="Mở liên kết"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button
                    className="p-1 text-slate-500 hover:text-blue-600"
                    title="Xem tệp"
                    onClick={() => onViewFile(item)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                {isEditable && (
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-1 text-slate-400 hover:text-red-500"
                    title="Xóa minh chứng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

