import { useState, useEffect } from "react";
import {
  getPushStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestPush,
  type PushStatusInfo,
} from "@/lib/push";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  Sparkles,
  AlertTriangle,
  Send,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  Info,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PushNotificationCardProps {
  className?: string;
}

export function PushNotificationCard({ className }: PushNotificationCardProps) {
  const { profile } = useAuth();
  const [pushStatus, setPushStatus] = useState<PushStatusInfo | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);

  const refreshStatus = async () => {
    try {
      const status = await getPushStatus();
      setPushStatus(status);
      setPushEnabled(status.isSubscribed && status.permission === "granted");
    } catch (e) {
      console.warn("Không thể tải trạng thái push:", e);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [profile?.id]);

  const handleToggle = async (checked: boolean) => {
    if (!profile?.id) {
      toast.error("Vui lòng đăng nhập để thiết lập nhận thông báo.");
      return;
    }

    // Check if on iOS in regular browser (not PWA)
    if (pushStatus?.needsHomeScreenInstall) {
      setIosModalOpen(true);
      return;
    }

    setIsSubscribing(true);
    try {
      if (checked) {
        await subscribeUserToPush(profile.id);
        setPushEnabled(true);
        toast.success("Đã bật quyền thông báo đẩy thành công!");
      } else {
        await unsubscribeUserFromPush(profile.id);
        setPushEnabled(false);
        toast.info("Đã tắt thông báo đẩy trên thiết bị này.");
      }
      await refreshStatus();
    } catch (err: any) {
      console.error("Lỗi khi chuyển trạng thái push:", err);
      toast.error(err.message || "Không thể cập nhật quyền thông báo.");
      await refreshStatus();
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      await sendTestPush(pushStatus?.subscription);
      toast.success("Đã gửi thử thông báo đến thiết bị của bạn!");
    } catch (err: any) {
      toast.error(err.message || "Gửi thử thông báo thất bại.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <Card
        className={`bg-gradient-to-r from-emerald-50/95 via-[#f4faf5] to-lime-50/60 border border-emerald-200/90 shadow-2xs rounded-2xl ${
          className || ""
        }`}
      >
        <CardContent className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Bell className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-sm sm:text-base text-slate-950">
                    Thông báo đẩy trên thiết bị (Push Notification)
                  </h4>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono bg-emerald-100 text-emerald-800 border-emerald-300 font-bold"
                  >
                    VAPID Web Push
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Nhận tin nhắn thông báo tức thời khi có đợt đánh giá mới, thẩm định điểm hoặc duyệt minh chứng
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  {isSubscribing
                    ? "Đang xử lý..."
                    : pushEnabled
                    ? "Đang bật"
                    : "Chưa bật"}
                </span>
                <Switch
                  checked={pushEnabled}
                  disabled={isSubscribing}
                  onCheckedChange={handleToggle}
                  aria-label="Bật tắt thông báo đẩy"
                />
              </div>

              {pushEnabled ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestNotification}
                  disabled={isTesting}
                  className="text-xs h-8 gap-1.5 bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-xl shadow-2xs font-semibold"
                >
                  {isTesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <Send className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                  Gửi thử thông báo
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleToggle(true)}
                  disabled={isSubscribing}
                  className="text-xs h-8 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow-2xs font-bold"
                >
                  {isSubscribing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Bật thông báo ngay
                </Button>
              )}
            </div>
          </div>

          {/* iOS Special Notice */}
          {pushStatus?.needsHomeScreenInstall && (
            <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-xl text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="h-4 w-4 text-amber-700 shrink-0" />
                <span>
                  <strong>Lưu ý cho iPhone/iPad:</strong> Apple quy định bạn cần <b>Thêm vào Màn hình chính</b> trước để kích hoạt thông báo đẩy.
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIosModalOpen(true)}
                className="text-xs h-7 gap-1 border-amber-300 bg-white text-amber-900 hover:bg-amber-100 font-bold self-start sm:self-auto shrink-0"
              >
                <Info className="h-3.5 w-3.5 text-amber-700" />
                Xem cách cài trên iPhone
              </Button>
            </div>
          )}

          {/* Diagnostic Info Pills */}
          <div className="flex items-center gap-2 pt-2 border-t border-emerald-200/60 flex-wrap text-[11px] text-slate-700 font-medium">
            <span className="flex items-center gap-1">
              Trạng thái quyền:
              {pushStatus?.permission === "granted" ? (
                <span className="text-emerald-700 font-bold inline-flex items-center gap-0.5">
                  <CheckCircle2 className="h-3 w-3" /> Đã cấp quyền
                </span>
              ) : pushStatus?.permission === "denied" ? (
                <span className="text-red-600 font-bold inline-flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" /> Đã chặn quyền (Cần mở lại trong Cài đặt máy)
                </span>
              ) : (
                <span className="text-amber-700 font-bold">Chưa yêu cầu</span>
              )}
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              Kết nối hệ thống:
              {pushEnabled ? (
                <span className="text-emerald-700 font-bold inline-flex items-center gap-0.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Sẵn sàng nhận tin
                </span>
              ) : (
                <span className="text-slate-500">Chưa kết nối</span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* iOS Install Guidance Modal */}
      <Dialog open={iosModalOpen} onOpenChange={setIosModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-950">
              <Smartphone className="h-5 w-5 text-emerald-700" />
              Cách bật thông báo đẩy trên iPhone / iPad
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Theo chính sách bảo mật của Apple (iOS 16.4+), thông báo đẩy Web Push chỉ hoạt động sau khi bạn lưu trang web ra màn hình chính.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-800">
            <div className="flex items-start gap-3 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80">
              <span className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                1
              </span>
              <div>
                <p className="font-bold text-slate-900">Bấm nút "Chia sẻ" ở thanh dưới cùng Safari</p>
                <p className="text-slate-600 mt-0.5">Biểu tượng hình vuông có mũi tên chỉ lên (⎋) ở thanh công cụ Safari.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80">
              <span className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                2
              </span>
              <div>
                <p className="font-bold text-slate-900">Chọn "Thêm vào Màn hình chính" (Add to Home Screen)</p>
                <p className="text-slate-600 mt-0.5">Cuộn menu xuống và bấm vào dòng có dấu cộng (+).</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80">
              <span className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                3
              </span>
              <div>
                <p className="font-bold text-slate-900">Mở ứng dụng từ Màn hình chính và Bật thông báo</p>
                <p className="text-slate-600 mt-0.5">Biểu tượng app sẽ xuất hiện ngoài màn hình iPhone. Mở app lên và gạt nút "Bật thông báo" để nhận tin tức thời.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs h-9 px-4"
              onClick={() => setIosModalOpen(false)}
            >
              Đã hiểu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

