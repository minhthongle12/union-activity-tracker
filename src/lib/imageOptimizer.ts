/**
 * Image Optimization Utility
 * Tối ưu hóa dung lượng hình ảnh phía client trước khi upload lên máy chủ.
 * Giảm 80% - 95% dung lượng ảnh chụp từ điện thoại mà vẫn giữ độ nét cao cho văn bản & hình ảnh minh chứng.
 */

export interface ImageOptimizationResult {
  file: File;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
  wasCompressed: boolean;
}

export interface OptimizeImageOptions {
  /** Chiều rộng tối đa (mặc định 1920px) */
  maxWidth?: number;
  /** Chiều cao tối đa (mặc định 1920px) */
  maxHeight?: number;
  /** Chất lượng nén 0.1 - 1.0 (mặc định 0.82 - giữ nguyên độ sắc nét) */
  quality?: number;
  /** Định dạng xuất (mặc định image/jpeg vì tính tương thích cao nhất) */
  outputType?: "image/jpeg" | "image/webp";
  /** Dung lượng tối thiểu cần nén tính bằng byte (mặc định 150KB, ảnh nhỏ hơn giữ nguyên) */
  minSizeToCompressBytes?: number;
}

/**
 * Kiểm tra xem tệp có phải hình ảnh dạng raster cần nén hay không
 */
export function isCompressibleImage(file: File): boolean {
  if (!file) return false;
  const mime = file.type?.toLowerCase() || "";
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  // Không nén ảnh vector (SVG) hoặc ảnh động (GIF) để tránh mất animation
  if (mime.includes("svg") || ext === "svg" || mime.includes("gif") || ext === "gif") {
    return false;
  }

  return (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "bmp", "heic", "heif"].includes(ext)
  );
}

/**
 * Nén và giảm kích thước ảnh bằng HTML5 Canvas API với chất lượng cao
 */
export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions = {}
): Promise<ImageOptimizationResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    outputType = "image/jpeg",
    minSizeToCompressBytes = 150 * 1024, // 150 KB
  } = options;

  const originalSize = file.size;

  // Nếu không phải ảnh hoặc ảnh đã rất nhẹ (<150KB) thì không cần nén
  if (!isCompressibleImage(file) || originalSize <= minSizeToCompressBytes) {
    return {
      file,
      originalSize,
      optimizedSize: originalSize,
      savingsPercent: 0,
      wasCompressed: false,
    };
  }

  try {
    // 1. Tải ảnh vào đối tượng Image
    const imageBitmap = await loadImage(file);
    const { width: origWidth, height: origHeight } = imageBitmap;

    // 2. Tính toán tỉ lệ co dãn phù hợp
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    // 3. Vẽ lên Canvas với thuật toán làm mịn mượt mà
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Không thể khởi tạo Canvas 2D context");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Nền trắng cho trường hợp PNG trong suốt chuyển sang JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    // 4. Xuất Blob đã nén
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Không thể chuyển Canvas thành Blob"));
        },
        outputType,
        quality
      );
    });

    // 5. Nếu kích thước sau nén nhỏ hơn ảnh gốc thì dùng ảnh nén
    if (blob.size < originalSize) {
      const extension = outputType === "image/webp" ? ".webp" : ".jpg";
      const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      const optimizedFileName = `${baseName}${extension}`;

      const optimizedFile = new File([blob], optimizedFileName, {
        type: outputType,
        lastModified: Date.now(),
      });

      const savingsPercent = Math.round(((originalSize - blob.size) / originalSize) * 100);

      return {
        file: optimizedFile,
        originalSize,
        optimizedSize: blob.size,
        savingsPercent,
        wasCompressed: true,
      };
    }

    // Nếu ảnh nén không nhỏ hơn (hiếm gặp), giữ nguyên ảnh gốc
    return {
      file,
      originalSize,
      optimizedSize: originalSize,
      savingsPercent: 0,
      wasCompressed: false,
    };
  } catch (error) {
    console.warn("Tối ưu hóa ảnh thất bại, sẽ sử dụng tệp ảnh gốc:", error);
    return {
      file,
      originalSize,
      optimizedSize: originalSize,
      savingsPercent: 0,
      wasCompressed: false,
    };
  }
}

/**
 * Helper tải tệp ảnh thành HTMLImageElement an toàn
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Định dạng dung lượng tệp cho người dùng dễ đọc
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

