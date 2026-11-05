import { supabase } from "@/lib/supabase";

export const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"];
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
];
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export interface StorageUploadParams {
  bucket: "evidence" | "bonus-evidence";
  orgId: string;
  periodId: string;
  entityId: string; // submission_id or bonus_request_id
  revisionId?: string;
  file: File;
}

export function validateEvidenceFile(file: File): { valid: boolean; error?: string } {
  // 1. Check size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Dung lượng tệp (${Math.round(file.size / 1024 / 1024)}MB) vượt quá giới hạn 15MB.`,
    };
  }

  // 2. Check extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Định dạng tệp .${ext} không được hỗ trợ. Chỉ chấp nhận: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG.`,
    };
  }

  return { valid: true };
}

/**
 * Uploads evidence file following PRD Part 17 path structure:
 * evidence/{organization_id}/{period_id}/{submission_id}/{revision_id}/{timestamp}_{file_name}
 */
export async function uploadEvidenceFile({
  bucket,
  orgId,
  periodId,
  entityId,
  revisionId,
  file,
}: StorageUploadParams): Promise<{ path: string; fileName: string; fileSize: number; mimeType: string }> {
  const validation = validateEvidenceFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueName = `${Date.now()}_${cleanFileName}`;

  let storagePath = "";
  if (bucket === "evidence") {
    storagePath = `${orgId}/${periodId}/${entityId}/${revisionId || "rev1"}/${uniqueName}`;
  } else {
    storagePath = `${orgId}/${periodId}/${entityId}/${uniqueName}`;
  }

  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(`Lỗi tải lên máy chủ lưu trữ: ${error.message}`);
  }

  return {
    path: storagePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

/**
 * Creates a signed URL to securely view/download private evidence files
 */
export async function getEvidenceSignedUrl(
  bucket: "evidence" | "bonus-evidence",
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Không thể tạo liên kết tải tệp: ${error?.message}`);
  }
  return data.signedUrl;
}
