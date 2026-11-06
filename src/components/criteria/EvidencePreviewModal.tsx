import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Globe,
  ImageIcon,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { EvidenceItem } from "@/types/database";

interface EvidencePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EvidenceItem | null;
  previewUrl: string | null;
  isLoading?: boolean;
  error?: string | null;
}

export function EvidencePreviewModal({
  open,
  onOpenChange,
  item,
  previewUrl,
  isLoading = false,
  error = null,
}: EvidencePreviewModalProps) {
  if (!item && !open) return null;

  const fileName = item?.file_name || "Tệp minh chứng";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeType = item?.mime_type || "";

  const isImage =
    mimeType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);

  const isPdf = mimeType === "application/pdf" || ext === "pdf";

  const isExcel =
    ["xls", "xlsx", "csv"].includes(ext) ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel");

  const isWord =
    ["doc", "docx"].includes(ext) ||
    mimeType.includes("word") ||
    mimeType.includes("wordprocessingml");

  const isExternalUrl = !!item?.external_url;

  const effectiveUrl = previewUrl || item?.external_url;

  const handleDownload = () => {
    if (!effectiveUrl) return;
    const a = document.createElement("a");
    a.href = effectiveUrl;
    a.download = fileName;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenNewTab = () => {
    if (!effectiveUrl) return;
    window.open(effectiveUrl, "_blank", "noopener,noreferrer");
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return null;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b pb-3 shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge
                  variant="outline"
                  className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200"
                >
                  {isImage
                    ? "Hình ảnh"
                    : isPdf
                    ? "Tài liệu PDF"
                    : isExcel
                    ? "Bảng tính Excel"
                    : isWord
                    ? "Văn bản Word"
                    : isExternalUrl
                    ? "Liên kết ngoài"
                    : "Tệp đính kèm"}
                </Badge>
                {item?.file_size ? (
                  <span className="text-[11px] text-slate-500 font-medium">
                    • {formatFileSize(item.file_size)}
                  </span>
                ) : null}
              </div>
              <DialogTitle className="text-sm sm:text-base font-bold text-slate-900 truncate block" title={fileName}>
                {fileName}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {/* Preview Content Area */}
        <div className="flex-1 overflow-y-auto py-4 min-h-[260px] sm:min-h-[380px] flex items-center justify-center bg-slate-50/70 rounded-lg border border-slate-200/80 p-2 sm:p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center text-slate-500 gap-2.5 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-xs sm:text-sm font-medium">Đang mở tệp minh chứng...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center text-center p-6 max-w-md gap-3">
              <AlertCircle className="h-10 w-10 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-800">Không thể tải tệp xem trực tiếp</p>
                <p className="text-xs text-slate-500 mt-1">{error}</p>
              </div>
              {effectiveUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenNewTab}
                  className="text-xs gap-1.5 mt-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Thử mở trong tab mới
                </Button>
              )}
            </div>
          ) : isImage && effectiveUrl ? (
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
              <img
                src={effectiveUrl}
                alt={fileName}
                className="max-h-[65vh] w-auto max-w-full rounded-md object-contain shadow-xs border border-slate-200 bg-white"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : isPdf && effectiveUrl ? (
            <div className="w-full h-full flex flex-col items-center">
              <iframe
                src={effectiveUrl}
                title={fileName}
                className="w-full h-[60vh] rounded-md border border-slate-200 bg-white shadow-2xs"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Nếu không xem được PDF trên thiết bị di động, vui lòng bấm "Mở tab mới" hoặc "Tải về" bên dưới.
              </p>
            </div>
          ) : isExternalUrl && effectiveUrl ? (
            <div className="flex flex-col items-center justify-center text-center p-6 max-w-lg space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shadow-xs">
                <Globe className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm sm:text-base text-slate-900">{fileName}</h4>
                <p className="text-xs text-slate-500 break-all font-mono max-h-16 overflow-y-auto px-2">
                  {effectiveUrl}
                </p>
              </div>
              <Button
                onClick={handleOpenNewTab}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-2 px-5 py-2"
              >
                <ExternalLink className="h-4 w-4" />
                Truy cập liên kết
              </Button>
            </div>
          ) : isExcel || isWord ? (
            <div className="flex flex-col items-center justify-center text-center p-6 max-w-md space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shadow-xs">
                {isExcel ? <FileSpreadsheet className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm sm:text-base text-slate-900">{fileName}</h4>
                <p className="text-xs text-slate-500">
                  Tài liệu {isExcel ? "bảng tính Excel" : "văn bản Word"}. Trình duyệt không hỗ trợ hiển thị chỉnh sửa trực tiếp, vui lòng tải về hoặc mở bằng ứng dụng trên máy.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
                <Button
                  onClick={handleDownload}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải tệp về máy
                </Button>
                {effectiveUrl && effectiveUrl.startsWith("http") && !effectiveUrl.startsWith("blob:") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.open(
                        `https://docs.google.com/viewer?url=${encodeURIComponent(effectiveUrl)}&embedded=true`,
                        "_blank"
                      );
                    }}
                    className="text-xs gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Xem qua Google Docs
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 max-w-md space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-slate-200 text-slate-600 flex items-center justify-center">
                <FileText className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900">{fileName}</h4>
                <p className="text-xs text-slate-500">Tệp minh chứng đã đính kèm.</p>
              </div>
              {effectiveUrl && (
                <Button
                  onClick={handleDownload}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải tệp về máy
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="border-t pt-3 flex flex-row items-center justify-between sm:justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {effectiveUrl && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleOpenNewTab}
                  className="text-xs gap-1.5 cursor-pointer"
                  title="Mở trong tab mới"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mở tab mới</span>
                </Button>
                {!isExternalUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleDownload}
                    className="text-xs gap-1.5 cursor-pointer"
                    title="Tải tệp về máy"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Tải về</span>
                  </Button>
                )}
              </>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs bg-slate-800 hover:bg-slate-900 text-white"
          >
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
