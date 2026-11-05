import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "GET") {
    // Healthcheck / VAPID public key info
    const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "";
    return res.status(200).json({
      status: "ok",
      vapidConfigured: !!(publicKey && process.env.VAPID_PRIVATE_KEY),
      publicKey,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Please use POST." });
  }

  try {
    const {
      recipientUserIds = [],
      title = "Công tác Đoàn - Thông báo",
      message = "Bạn có thông báo mới từ hệ thống.",
      url = "/",
      broadcast = false,
      subscription, // Direct subscription for testing
    } = req.body || {};

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@doanthanhnien.vn";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return res.status(500).json({
        error: "VAPID keys are not configured in environment variables (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).",
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title,
      message,
      url,
      timestamp: Date.now(),
    });

    // 1. Direct subscription test
    if (subscription && subscription.endpoint && subscription.keys) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
          },
          payload
        );
        return res.status(200).json({
          success: true,
          sent: 1,
          failed: 0,
          message: "Đã gửi thông báo kiểm tra trực tiếp thành công!",
        });
      } catch (err: any) {
        return res.status(err.statusCode || 500).json({
          error: "Không thể gửi Web Push: " + (err.body || err.message),
        });
      }
    }

    // 2. Database-backed subscriptions
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Supabase connection not configured in environment variables.",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .eq("is_active", true);

    if (!broadcast && Array.isArray(recipientUserIds) && recipientUserIds.length > 0) {
      query = query.in("user_id", recipientUserIds);
    }

    const { data: subscriptions, error: dbError } = await query;

    if (dbError) {
      return res.status(500).json({ error: "Lỗi truy vấn push_subscriptions: " + dbError.message });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        failed: 0,
        message: "Không tìm thấy thiết bị nào đã đăng ký nhận thông báo đẩy.",
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    const pushPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        sentCount++;
      } catch (err: any) {
        failedCount++;
        // If subscription is expired or unregistered, deactivate it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
        }
      }
    });

    await Promise.all(pushPromises);

    return res.status(200).json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      total: subscriptions.length,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Lỗi nội bộ khi xử lý Web Push: " + (error?.message || error),
    });
  }
}

