import { supabase } from "./supabase";

export interface DeviceInfo {
  deviceType: "Desktop" | "Mobile" | "Tablet";
  os: string;
  browser: string;
  screen: string;
  viewport: string;
  language: string;
  url: string;
  userAgent: string;
  online: boolean;
}

/**
 * Phân tích môi trường client để lấy thông tin chi tiết về thiết bị, hệ điều hành và trình duyệt
 */
export function getClientDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceType: "Desktop",
      os: "Server",
      browser: "Unknown",
      screen: "N/A",
      viewport: "N/A",
      language: "vi-VN",
      url: "/",
      userAgent: "",
      online: true,
    };
  }

  const ua = navigator.userAgent || "";
  
  // 1. Phân loại thiết bị
  let deviceType: "Desktop" | "Mobile" | "Tablet" = "Desktop";
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk)/i.test(ua);
  const isMobile = /mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|android.*mobile/i.test(ua);

  if (isTablet) {
    deviceType = "Tablet";
  } else if (isMobile || (window.innerWidth < 768 && "ontouchstart" in window)) {
    deviceType = "Mobile";
  }

  // 2. Hệ điều hành
  let os = "Khác";
  if (/windows phone/i.test(ua)) os = "Windows Phone";
  else if (/win/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/cros/i.test(ua)) os = "ChromeOS";
  else if (/linux/i.test(ua)) os = "Linux";

  // 3. Trình duyệt
  let browser = "Khác";
  if (/coc_coc_browser|coccoc/i.test(ua)) browser = "Cốc Cốc";
  else if (/edg([ea]|ios)?/i.test(ua)) browser = "Microsoft Edge";
  else if (/opr|opera/i.test(ua)) browser = "Opera";
  else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = "Google Chrome";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Apple Safari";
  else if (/firefox|fxios/i.test(ua)) browser = "Mozilla Firefox";

  const screen = typeof window.screen !== "undefined"
    ? `${window.screen.width}x${window.screen.height}`
    : "N/A";

  const viewport = `${window.innerWidth}x${window.innerHeight}`;

  return {
    deviceType,
    os,
    browser,
    screen,
    viewport,
    language: navigator.language || "vi-VN",
    url: window.location.pathname + window.location.search,
    userAgent: ua,
    online: navigator.onLine,
  };
}

export interface RecordAuditParams {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string;
  details?: Record<string, any>;
  oldValues?: any;
  actorId?: string | null;
}

/**
 * Ghi nhật ký hoạt động kèm đầy đủ thông tin thiết bị, môi trường và tóm tắt thao tác
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<void> {
  try {
    const device = getClientDeviceInfo();

    let resolvedActorId = params.actorId;
    if (!resolvedActorId) {
      const { data: sessionData } = await supabase.auth.getSession();
      resolvedActorId = sessionData?.session?.user?.id || null;
    }

    const payloadNewValues = {
      _summary: params.summary || null,
      _device: {
        type: device.deviceType,
        os: device.os,
        browser: device.browser,
        screen: device.screen,
        viewport: device.viewport,
        language: device.language,
        url: device.url,
        userAgent: device.userAgent,
      },
      ...(params.details || {}),
    };

    await supabase.from("audit_logs").insert({
      actor_id: resolvedActorId,
      action: params.action,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      old_values: params.oldValues || null,
      new_values: payloadNewValues,
    });
  } catch (err) {
    console.warn("Không thể ghi audit log:", err);
  }
}
