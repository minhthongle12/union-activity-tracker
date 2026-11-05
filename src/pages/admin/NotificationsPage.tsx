import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Notification, Organization } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { toast } from "sonner";

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_notifications_list"] });
      toast.success("Đã gửi thông báo thành công!");
      setBroadcastDialogOpen(false);
      setForm({ title: "", message: "", targetOrgId: "all" });
    },
    onError: (err: Error) => toast.error("Lỗi khi gửi thông báo: " + err.message),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý thông báo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gửi thông báo nhắc nhở, thông tri hoặc chỉ đạo công tác Đoàn đến các đơn vị
          </p>
        </div>

        <Button onClick={() => setBroadcastDialogOpen(true)} className="gap-2 shrink-0 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Gửi thông báo mới
        </Button>
      </div>

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
                  <SelectItem value="all">Tất cả các Đoàn cơ sở</SelectItem>
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
                placeholder="VD: Nhắc nhở hạn chót nộp minh chứng đợt 1/2024"
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
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
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
