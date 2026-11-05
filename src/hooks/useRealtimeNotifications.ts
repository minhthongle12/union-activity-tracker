import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useRealtimeNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile?.id) return;

    // Lắng nghe thông báo thời gian thực dành cho người dùng hiện tại
    const channel = supabase
      .channel(`realtime:notifications:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${profile.id}`,
        },
        (payload) => {
          const newNotif = payload.new as {
            id: string;
            title: string;
            message: string;
            type?: string;
            link_url?: string;
          };

          // 1. Cập nhật số lượng thông báo chưa đọc và danh sách thông báo
          queryClient.invalidateQueries({ queryKey: ["unread_notifications_user", profile.id] });
          queryClient.invalidateQueries({ queryKey: ["unread_notifications_admin", profile.id] });
          queryClient.invalidateQueries({ queryKey: ["user_notifications_list"] });
          queryClient.invalidateQueries({ queryKey: ["admin_notifications_list"] });

          const targetUrl =
            newNotif.link_url ||
            (profile.role === "admin" ? "/admin/notifications" : "/user/notifications");

          // 2. Hiển thị thông báo Toast trên màn hình
          toast.info(newNotif.title || "Thông báo mới", {
            description: newNotif.message,
            duration: 6000,
            action: {
              label: "Xem ngay",
              onClick: () => navigate(targetUrl),
            },
          });

          // 3. Nếu người dùng đang thu nhỏ hoặc ở tab khác và đã cấp quyền, hiển thị thông báo trình duyệt
          if (
            typeof window !== "undefined" &&
            document.hidden &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification(newNotif.title || "Công tác Đoàn", {
                body: newNotif.message,
                icon: "/huy-hieu-doan.png",
              });
            } catch (err) {
              console.warn("Lỗi kích hoạt thông báo cục bộ:", err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.role, queryClient, navigate]);
}

