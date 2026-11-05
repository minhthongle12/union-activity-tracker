import { supabase } from "./supabase";
import { triggerPushNotification } from "./push";

export interface NotifyAdminsParams {
  title: string;
  message: string;
  type?: string;
  relatedId?: string | null;
  url?: string;
}

export interface NotifyUsersParams {
  title: string;
  message: string;
  type?: string;
  relatedId?: string | null;
  userIds?: string[];
  organizationIds?: string[];
  url?: string;
}

/**
 * Gửi thông báo in-app và Web Push Notification tới toàn bộ Quản trị viên (Admin)
 */
export async function notifyAdmins(params: NotifyAdminsParams): Promise<{ success: boolean; adminCount: number }> {
  try {
    const { data: admins, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    if (error || !admins || admins.length === 0) {
      return { success: false, adminCount: 0 };
    }

    const adminIds = admins.map((a) => a.id);

    // 1. In-app notifications
    const inAppPayload = admins.map((a) => ({
      recipient_id: a.id,
      title: params.title,
      message: params.message,
      type: params.type || "admin_alert",
      related_id: params.relatedId || null,
    }));

    const { error: insErr } = await supabase.from("notifications").insert(inAppPayload);
    if (insErr) {
      console.warn("Lỗi lưu in-app notifications cho Admin:", insErr);
    }

    // 2. Web Push Notifications
    await triggerPushNotification({
      recipientUserIds: adminIds,
      title: params.title,
      message: params.message,
      url: params.url || "/admin/review",
    });

    return { success: true, adminCount: adminIds.length };
  } catch (err) {
    console.warn("Lỗi khi gửi thông báo tới Admins:", err);
    return { success: false, adminCount: 0 };
  }
}

/**
 * Gửi thông báo in-app và Web Push Notification tới các tài khoản Liên đội (Users)
 */
export async function notifyUsers(params: NotifyUsersParams): Promise<{ success: boolean; userCount: number }> {
  try {
    let targetUserIds: string[] = [];

    if (params.userIds && params.userIds.length > 0) {
      targetUserIds = params.userIds;
    } else if (params.organizationIds && params.organizationIds.length > 0) {
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .in("organization_id", params.organizationIds)
        .eq("role", "user");
      targetUserIds = (users || []).map((u) => u.id);
    } else {
      const { data: allUsers } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "user")
        .eq("is_active", true);
      targetUserIds = (allUsers || []).map((u) => u.id);
    }

    if (targetUserIds.length === 0) {
      return { success: false, userCount: 0 };
    }

    // 1. In-app notifications
    const inAppPayload = targetUserIds.map((uid) => ({
      recipient_id: uid,
      title: params.title,
      message: params.message,
      type: params.type || "user_alert",
      related_id: params.relatedId || null,
    }));

    const { error: insErr } = await supabase.from("notifications").insert(inAppPayload);
    if (insErr) {
      console.warn("Lỗi lưu in-app notifications cho Users:", insErr);
    }

    // 2. Web Push Notifications
    await triggerPushNotification({
      recipientUserIds: targetUserIds,
      title: params.title,
      message: params.message,
      url: params.url || "/user/criteria",
    });

    return { success: true, userCount: targetUserIds.length };
  } catch (err) {
    console.warn("Lỗi khi gửi thông báo tới Users:", err);
    return { success: false, userCount: 0 };
  }
}
