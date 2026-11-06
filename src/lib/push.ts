import { supabase } from "./supabase";

export const DEFAULT_VAPID_PUBLIC_KEY =
  "BDIKrhiAvwiOUP4Q6NCSv-e9PgTpswXxRxaRUaa1JCS8__haCd00_bCT9GNoOqEWQwQxbarNpjewDDE4aXl_4ps";

/**
 * Lấy khóa VAPID Public Key từ biến môi trường
 */
export function getVapidPublicKey(): string {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (envKey && envKey.trim().length > 10 && !envKey.includes("your-vapid")) {
    return envKey.trim();
  }
  return DEFAULT_VAPID_PUBLIC_KEY;
}

/**
 * Chuyển đổi chuỗi base64 VAPID URL sang mảng Uint8Array theo chuẩn RFC 8292
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Kiểm tra xem người dùng đang mở trên thiết bị iOS (iPhone/iPad) hay không
 */
export function isIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Kiểm tra xem web app đang chạy ở chế độ PWA (Standalone / Đã thêm vào Màn hình chính) hay không
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

/**
 * Kiểm tra xem trình duyệt có hỗ trợ Web Push Notification và Service Worker không
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Lấy Service Worker registration an toàn trên mọi trình duyệt (đặc biệt iOS Safari)
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg) return reg;
  } catch {}
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs && regs.length > 0) return regs[0];
  } catch {}
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.warn("Không thể lấy Service Worker registration:", e);
    return null;
  }
}

export interface PushStatusInfo {
  supported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscription: PushSubscription | null;
  isIOSDevice: boolean;
  isStandaloneMode: boolean;
  needsHomeScreenInstall: boolean;
}

/**
 * Lấy trạng thái hiện tại của Web Push
 */
export async function getPushStatus(): Promise<PushStatusInfo> {
  const ios = isIOS();
  const standalone = isStandalone();
  const supported = isPushSupported();
  const needsHomeScreen = ios && !standalone;

  const permission: NotificationPermission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default";

  if (!supported) {
    return {
      supported: false,
      permission,
      isSubscribed: false,
      subscription: null,
      isIOSDevice: ios,
      isStandaloneMode: standalone,
      needsHomeScreenInstall: needsHomeScreen,
    };
  }

  if (permission !== "granted") {
    return {
      supported: true,
      permission,
      isSubscribed: false,
      subscription: null,
      isIOSDevice: ios,
      isStandaloneMode: standalone,
      needsHomeScreenInstall: false,
    };
  }

  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg) {
      return {
        supported: true,
        permission,
        isSubscribed: false,
        subscription: null,
        isIOSDevice: ios,
        isStandaloneMode: standalone,
        needsHomeScreenInstall: false,
      };
    }
    const sub = await reg.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      isSubscribed: !!sub,
      subscription: sub,
      isIOSDevice: ios,
      isStandaloneMode: standalone,
      needsHomeScreenInstall: false,
    };
  } catch (err) {
    console.warn("Không thể kiểm tra push subscription:", err);
    return {
      supported: true,
      permission,
      isSubscribed: false,
      subscription: null,
      isIOSDevice: ios,
      isStandaloneMode: standalone,
      needsHomeScreenInstall: false,
    };
  }
}

/**
 * Đăng ký nhận thông báo đẩy trên trình duyệt và lưu vào Supabase
 */
export async function subscribeUserToPush(userId: string): Promise<PushSubscription> {
  if (typeof window === "undefined") {
    throw new Error("Không thể thực hiện trên môi trường máy chủ.");
  }

  // 1. Kiểm tra trên iOS nếu chưa cài PWA
  if (isIOS() && !isStandalone()) {
    throw new Error(
      "Trên iPhone/iPad, Apple yêu cầu bạn cần Thêm ứng dụng vào Màn hình chính (PWA) để nhận thông báo đẩy."
    );
  }

  if (!("Notification" in window)) {
    throw new Error("Trình duyệt hiện tại chưa hỗ trợ Web Push Notification.");
  }

  // 2. Yêu cầu quyền thông báo trực tiếp
  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("Bạn đã từ chối cấp quyền thông báo trên thiết bị.");
  }

  // 3. Đăng ký & lấy Service Worker
  const reg = await getServiceWorkerRegistration();
  if (!reg) {
    throw new Error("Không thể khởi tạo Service Worker trên thiết bị.");
  }

  // 4. Đăng ký Push Manager với VAPID Public Key
  const publicKey = getVapidPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });
  }

  // 5. Lưu thông tin subscription vào Supabase
  const rawP256dh = sub.getKey("p256dh");
  const rawAuth = sub.getKey("auth");

  const p256dh = rawP256dh
    ? btoa(String.fromCharCode(...new Uint8Array(rawP256dh)))
    : "";
  const auth = rawAuth
    ? btoa(String.fromCharCode(...new Uint8Array(rawAuth)))
    : "";

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh,
      auth,
      is_active: true,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("Lỗi khi lưu push_subscription vào Supabase:", error);
    throw new Error("Không thể đồng bộ đăng ký với máy chủ: " + error.message);
  }

  // 6. Kích hoạt thông báo xác nhận cục bộ
  try {
    if ("showNotification" in reg) {
      await reg.showNotification("Hội đồng Đội xã Bến Lức", {
        body: "Đã bật nhận thông báo đẩy thành công trên thiết bị của bạn!",
        icon: "/huy-hieu-doi.png",
        badge: "/huy-hieu-doi.png",
      });
    }
  } catch {}

  return sub;
}

/**
 * Hủy đăng ký thông báo đẩy
 */
export async function unsubscribeUserFromPush(userId: string): Promise<void> {
  try {
    const reg = await getServiceWorkerRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("endpoint", sub.endpoint);
      }
    }

    // Cập nhật tất cả bản ghi của user thành inactive
    await supabase
      .from("push_subscriptions")
      .update({ is_active: false })
      .eq("user_id", userId);
  } catch (err) {
    console.warn("Lỗi khi hủy đăng ký push:", err);
  }
}

/**
 * Gửi thông báo kiểm tra (Test Push Notification)
 */
export async function sendTestPush(subscription?: PushSubscription | null): Promise<any> {
  let subData: any = null;
  if (subscription) {
    const rawP256dh = subscription.getKey("p256dh");
    const rawAuth = subscription.getKey("auth");
    subData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: rawP256dh ? btoa(String.fromCharCode(...new Uint8Array(rawP256dh))) : "",
        auth: rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : "",
      },
    };
  }

  const res = await fetch("/api/send-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subData,
      title: "Kiểm tra Web Push Notification",
      message: "Hệ thống thông báo đẩy VAPID & Service Worker đang hoạt động bình thường!",
      url: "/user/notifications",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}: Gửi thông báo thất bại`);
  }

  return await res.json();
}

/**
 * Kích hoạt gửi Web Push từ client qua API serverless
 */
export async function triggerPushNotification(params: {
  recipientUserIds?: string[];
  userIds?: string[];
  title: string;
  message?: string;
  body?: string;
  url?: string;
  broadcast?: boolean;
  tag?: string;
}): Promise<any> {
  try {
    const payload = {
      recipientUserIds: params.recipientUserIds || params.userIds,
      title: params.title,
      message: params.message || params.body || "",
      url: params.url,
      broadcast: params.broadcast,
      tag: params.tag,
    };

    const res = await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("Không thể gửi push qua serverless function:", err);
      return { success: false, error: err };
    }

    return await res.json();
  } catch (e) {
    console.warn("Lỗi gọi /api/send-push:", e);
    return { success: false, error: e };
  }
}
