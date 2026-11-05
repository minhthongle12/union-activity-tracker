import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Notification, Organization } from "@/types/database";
import {
  triggerPushNotification,
  getPushStatus,
  subscribeUserToPush,
  sendTestPush,
  isPushSupported,
} from "@/lib/push";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bell,
  Send,
  CheckCheck,
  Clock,
  Building,
  Plus,
  Loader2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Radio,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);

  const [form, setForm] = useState({
    title: "",
    message: "",
    targetOrgId: "all",
  });

  // Fetch all organizations
  const { data: orgs } = useQuery({
    queryKey: ["admin_notifications_orgs"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, code, name").eq("is_active", true);
      return (data ?? []) as Organization[];
    },
  });

  // Fetch active push subscriptions count
  const { data: pushStats } = useQuery({
    queryKey: ["admin_push_subscriptions_stats"],
    queryFn: async () => {
      const { count } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      return { activeSubscriptions: count ?? 0 };
    },
  });

  // Fetch sent/system notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ["admin_notifications_list"],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  // Broadcast mutation
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      // Find recipient users
      let query = supabase.from("profiles").select("id").eq("role", "user");
      if (form.targetOrgId !== "all") {
        query = query.eq("organization_id", form.targetOrgId);
      }
      const { data: users } = await query;

      if (!users || users.length === 0) {
        throw new Error("Không tìm thấy tài khoản người dùng nào thuộc phạm vi gửi.");
      }

      const rows = users.map((u) => ({
        recipient_id: u.id,
        title: form.title.trim(),
        message: form.message.trim(),
        type: "broadcast",
      }));

      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;

      // Trigger Web Push Notification to recipients
      try {
        await triggerPushNotification({
          recipientUserIds: users.map((u) => u.id),
          title: form.title.trim(),
          message: form.message.trim(),
          url: "/user/notifications",
          broadcast: form.targetOrgId === "all",
        });
      } catch (pushErr) {
        console.warn("Lỗi gửi push notification:", pushErr);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_notifications_list"] });
      queryClient.invalidateQueries({ queryKey: ["admin_push_subscriptions_stats"] });
      toast.success("Đã gửi thông báo trong ứng dụng & Web Push thành công!");
      setBroadcastDialogOpen(false);
      setForm({ title: "", message: "", targetOrgId: "all" });
    },
    onError: (err: Error) => toast.error("Lỗi khi gửi thông báo: " + err.message),
  });

  const handleTestBroadcastPush = async () => {
    setIsTestingPush(true);
    try {
      const res = await sendTestPush();
      toast.success(res.message || "Đã gửi thông báo đẩy kiểm tra thành công!");
    } catch (e: any) {
      toast.error("Không thể gửi push: " + e.message);
    } finally {
      setIsTestingPush(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý thông báo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gửi thông báo nhắc nhở, thông tri hoặc chỉ đạo công tác Đội đến các đơn vị
          </p>
        </div>

        <Button onClick={() => setBroadcastDialogOpen(true)} className="gap-2 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-700/20 font-semibold">
          <Plus className="h-4 w-4" />
          Gửi thông báo mới
        </Button>
      </div>

      {/* VAPID & Web Push Status Overview */}
      <Card className="bg-gradient-to-r from-emerald-50/90 via-[#f4faf5] to-lime-50/50 border-emerald-200/80 shadow-2xs rounded-2xl">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-sm sm:text-base text-slate-900">
                  Hệ thống thông báo đẩy Web Push (VAPID RFC 8292)
                </h4>
                <Badge variant="outline" className="text-[10px] font-mono bg-emerald-100/80 text-emerald-800 border-emerald-300">
                  Vercel Serverless API
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đang có <strong className="text-blue-700 font-semibold">{pushStats?.activeSubscriptions || 0} thiết bị</strong> của đoàn viên / cơ sở đăng ký nhận thông báo đẩy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestBroadcastPush}
              disabled={isTestingPush}
              className="text-xs h-8 gap-1.5 bg-white border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {isTestingPush ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Gửi thông báo đẩy thử nghiệm
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600" />
            Lịch sử gửi thông báo gần đây ({notifications?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
              <p>Đang tải thông báo...</p>
            </div>
          ) : (notifications ?? []).length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Bell className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              Chưa có thông báo nào được gửi.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications?.map((item) => (
                <div key={item.id} className="p-4 flex items-start gap-3 hover:bg-slate-50">
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

      {/* Broadcast Dialog */}
      <Dialog open={broadcastDialogOpen} onOpenChange={setBroadcastDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gửi thông báo đến đơn vị</DialogTitle>
            <DialogDescription>
              Soạn nội dung chỉ đạo hoặc nhắc nhở tiến độ đánh giá.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Phạm vi gửi *</Label>
              <Select value={form.targetOrgId} onValueChange={(v) => setForm({ ...form, targetOrgId: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Chọn đơn vị nhận" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả các Liên đội</SelectItem>
                  {(orgs ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.code} – {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Tiêu đề thông báo *</Label>
              <Input
                placeholder="VD: Nhắc nhở hạn chót nộp minh chứng đợt 1/2026"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Nội dung chi tiết *</Label>
              <Textarea
                placeholder="Nhập nội dung thông báo gửi đến các đồng chí phụ trách..."
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold rounded-xl shadow-md shadow-emerald-700/20"
              onClick={() => {
                if (!form.title.trim() || !form.message.trim()) {
                  toast.error("Vui lòng nhập đầy đủ tiêu đề và nội dung.");
                  return;
                }
                broadcastMutation.mutate();
              }}
              disabled={broadcastMutation.isPending}
            >
              {broadcastMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Gửi thông báo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
