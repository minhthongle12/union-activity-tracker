import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Notification } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  CheckCheck,
  Clock,
  Sparkles,
  AlertCircle,
  FileCheck,
  Calendar,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);

  // Fetch notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ["user_notifications", profile?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!profile?.id,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_notifications"] });
      toast.success("Đã đánh dấu đọc tất cả thông báo.");
    },
  });

  // Check initial notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      setPushEnabled(true);
    }
  }, []);

  // Request browser push permission
  const handleTogglePush = async (enabled: boolean) => {
    if (enabled) {
      if (!("Notification" in window)) {
        toast.error("Trình duyệt của bạn không hỗ trợ Web Push Notification.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setPushEnabled(true);

        if ("serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.register("/sw.js");
            const sub = await reg.pushManager.getSubscription();
            if (sub && profile?.id) {
              const p256dh = sub.getKey("p256dh")
                ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!)))
                : "";
              const auth = sub.getKey("auth")
                ? btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!)))
                : "";

              await supabase.from("push_subscriptions").upsert(
                {
                  user_id: profile.id,
                  endpoint: sub.endpoint,
                  p256dh,
                  auth,
                  is_active: true,
                },
                { onConflict: "endpoint" }
              );
            }
          } catch (err) {
            console.warn("ServiceWorker registration notice:", err);
          }
        }

        toast.success("Đã kích hoạt nhận thông báo đẩy trên trình duyệt thành công!");
      } else {
        toast.error("Bạn đã từ chối cấp quyền thông báo trên trình duyệt.");
      }
    } else {
      setPushEnabled(false);
      toast.info("Đã tắt thông báo đẩy.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Thông báo hệ thống
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cập nhật tức thì các quyết định thẩm định, thông báo mở đợt và nhắc nhở thời hạn
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => markAllReadMutation.mutate()}
          disabled={!notifications || notifications.length === 0}
        >
          <CheckCheck className="h-4 w-4" />
          Đánh dấu đã đọc tất cả
        </Button>
      </div>

      {/* Web Push Configuration Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-900">
                Thông báo đẩy trên trình duyệt (Browser Push Notification)
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Nhận cảnh báo ngay lập tức ngay cả khi không mở tab hệ thống (sử dụng VAPID & Service Worker)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-700">
              {pushEnabled ? "Đang bật" : "Chưa bật"}
            </span>
            <Switch checked={pushEnabled} onCheckedChange={handleTogglePush} />
          </div>
        </CardContent>
      </Card>

      {/* Notification List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tải thông báo...</p>
            </div>
          ) : (notifications ?? []).length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Bell className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Bạn không có thông báo mới nào.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications?.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 flex items-start gap-3 transition-colors ${
                    !item.is_read ? "bg-blue-50/40" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0 mt-0.5">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-sm text-slate-900">{item.title}</h4>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono shrink-0">
                        <Clock className="h-3 w-3" />
                        {new Date(item.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{item.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
