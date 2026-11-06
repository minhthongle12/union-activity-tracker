import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Notification } from "@/types/database";
import { PushNotificationCard } from "@/components/notifications/PushNotificationCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCheck,
  Clock,
  AlertCircle,
  FileCheck,
  Calendar,
  Building,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Thông báo hệ thống
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-emerald-900 inline-flex items-center gap-1">
              <Building className="h-4 w-4 text-emerald-700" />
              Đơn vị: <b className="text-slate-950 font-bold">{profile?.organization?.name || "Liên đội"}</b>
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span>Cập nhật tức thì các quyết định thẩm định, thông báo mở đợt và nhắc nhở thời hạn</span>
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
      <PushNotificationCard />

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
