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
 * Kiểm tra xem trình duyệt có hỗ trợ Web Push Notification và Service Worker không
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Lấy trạng thái hiện tại của Web Push
 */
export async function getPushStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscription: PushSubscription | null;
}> {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission: "denied",
      isSubscribed: false,
      subscription: null,
    };
  }

  const permission = Notification.permission;
  if (permission !== "granted") {
    return {
      supported: true,
      permission,
      isSubscribed: false,
      subscription: null,
    };
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) {
      return { supported: true, permission, isSubscribed: false, subscription: null };
    }
    const sub = await reg.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      isSubscribed: !!sub,
      subscription: sub,
    };
  } catch (err) {
    console.warn("Không thể kiểm tra push subscription:", err);
    return { supported: true, permission, isSubscribed: false, subscription: null };
  }
}

/**
 * Đăng ký nhận thông báo đẩy trên trình duyệt và lưu vào Supabase
 */
export async function subscribeUserToPush(userId: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Trình duyệt hiện tại không hỗ trợ Web Push Notification.");
  }

  // 1. Yêu cầu quyền thông báo nếu chưa được cấp
  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("Bạn đã từ chối cấp quyền thông báo trên trình duyệt.");
  }

  // 2. Đăng ký Service Worker
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // 3. Đăng ký Push Manager với VAPID Public Key
  const publicKey = getVapidPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });
  }

  // 4. Lưu thông tin subscription vào Supabase
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

  return sub;
}

/**
 * Hủy đăng ký thông báo đẩy
 */
export async function unsubscribeUserFromPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
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
