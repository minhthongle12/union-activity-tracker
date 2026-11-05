import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Notification } from "@/types/database";
import {
  getPushStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestPush,
  isPushSupported,
} from "@/lib/push";
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
  Send,
  ShieldCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission;
    isSubscribed: boolean;
    subscription: PushSubscription | null;
  }>({
    supported: isPushSupported(),
    permission: typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
    isSubscribed: false,
    subscription: null,
  });

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
      queryClient.invalidateQueries({ queryKey: ["unread_notifications_user"] });
      toast.success("Đã đánh dấu đọc tất cả thông báo.");
    },
  });

  // Check initial notification status
  useEffect(() => {
    async function checkStatus() {
      const status = await getPushStatus();
      setPushStatus(status);
      setPushEnabled(status.isSubscribed && status.permission === "granted");
    }
    checkStatus();
  }, [profile?.id]);

  // Handle Toggle Push Notification
  const handleTogglePush = async (enabled: boolean) => {
    if (!profile?.id) {
      toast.error("Vui lòng đăng nhập để thiết lập thông báo.");
      return;
    }

    setIsSubscribing(true);
    try {
      if (enabled) {
        await subscribeUserToPush(profile.id);
        const nextStatus = await getPushStatus();
        setPushStatus(nextStatus);
        setPushEnabled(true);
        toast.success("Đã kích hoạt Web Push Notification (VAPID) thành công!");
      } else {
        await unsubscribeUserFromPush(profile.id);
        const nextStatus = await getPushStatus();
        setPushStatus(nextStatus);
        setPushEnabled(false);
        toast.info("Đã tắt thông báo đẩy trên thiết bị này.");
      }
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi cấu hình thông báo đẩy");
      setPushEnabled(false);
    } finally {
      setIsSubscribing(false);
    }
  };

  // Handle Send Test Push
  const handleSendTestPush = async () => {
    setIsTesting(true);
    try {
      await sendTestPush(pushStatus.subscription);
      toast.success("Đã kích hoạt gửi thông báo kiểm tra! Vui lòng kiểm tra màn hình trình duyệt.");
    } catch (err: any) {
      toast.error("Không thể gửi thông báo thử nghiệm: " + err.message);
    } finally {
      setIsTesting(false);
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
      <Card className="bg-gradient-to-r from-emerald-50/90 via-[#f4faf5] to-lime-50/50 border-emerald-200/80 shadow-2xs rounded-2xl">
        <CardContent className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-sm sm:text-base text-slate-900">
                    Thông báo đẩy trên trình duyệt (Web Push Notification)
                  </h4>
                  <Badge variant="outline" className="text-[10px] font-mono bg-emerald-100/80 text-emerald-800 border-emerald-300">
                    VAPID RFC 8292
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nhận thông báo ngay lập tức ngay cả khi không mở tab hệ thống (thông qua Service Worker máy khách)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {isSubscribing ? "Đang xử lý..." : pushEnabled ? "Đang bật" : "Chưa bật"}
                </span>
                <Switch
                  checked={pushEnabled}
                  disabled={isSubscribing || !pushStatus.supported}
                  onCheckedChange={handleTogglePush}
                />
              </div>

              {pushEnabled && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendTestPush}
                  disabled={isTesting}
                  className="text-xs h-8 gap-1.5 bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl"
                >
                  {isTesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Gửi thử thông báo
                </Button>
              )}
            </div>
          </div>

          {/* Diagnostic Info Pills */}
          <div className="flex items-center gap-2 pt-2 border-t border-emerald-100 flex-wrap text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              Hỗ trợ:
              {pushStatus.supported ? (
                <span className="text-emerald-700 font-medium inline-flex items-center gap-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Trình duyệt hỗ trợ
                </span>
              ) : (
                <span className="text-red-600 font-medium inline-flex items-center gap-0.5">
                  <XCircle className="h-3 w-3" /> Không hỗ trợ
                </span>
              )}
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              Quyền thông báo:
              <strong className="font-semibold text-slate-800 uppercase">
                {pushStatus.permission}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              Kết nối máy chủ:
              {pushEnabled ? (
                <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Đã kết nối VAPID
                </span>
              ) : (
                <span className="text-slate-500">Chưa kết nối</span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Notification List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-700" />
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
                    !item.is_read ? "bg-emerald-50/50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
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
