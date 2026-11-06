import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Building,
  KeyRound,
  Shield,
  Save,
  LogOut,
  Loader2,
  Smartphone,
  Download,
  CheckCircle2,
  Share,
  PlusSquare,
  MoreVertical,
  Laptop,
  Sparkles,
  Info,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function UserAccountPage() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  // PWA Install Guide states
  const [guideOpen, setGuideOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [activePlatform, setActivePlatform] = useState<"ios" | "android" | "desktop">("ios");

  useEffect(() => {
    // Detect standalone mode
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");
    setIsStandalone(standalone);

    // Auto-detect client platform
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setActivePlatform("ios");
    } else if (/android/.test(ua)) {
      setActivePlatform("android");
    } else {
      setActivePlatform("desktop");
    }

    // Capture install prompt if available
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handle1ClickInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        toast.success("Đang cài đặt ứng dụng vào thiết bị của bạn!");
        setGuideOpen(false);
      }
      setDeferredPrompt(null);
    } catch (err: any) {
      toast.error("Không thể kích hoạt cài đặt: " + err.message);
    }
  };

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) {
      toast.error("Họ tên không được để trống.");
      return;
    }
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", profile?.id || "");

      if (error) throw error;
      toast.success("Cập nhật thông tin thành công!");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Xác nhận mật khẩu mới không trùng khớp.");
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      toast.success("Đổi mật khẩu thành công!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Thông tin tài khoản
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quản lý thông tin cá nhân và cài đặt bảo mật cho tài khoản Liên đội
        </p>
      </div>

      {/* User Profile Card */}
      <Card className="border-emerald-200/90 shadow-2xs bg-gradient-to-r from-emerald-50/50 via-white to-slate-50/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-16 w-16 bg-emerald-700 text-white text-lg font-bold ring-4 ring-emerald-100 shadow-sm shrink-0">
              <AvatarFallback className="bg-emerald-700 text-white font-bold">
                {profile?.organization?.name
                  ? profile.organization.name.replace(/Liên đội|Trường/gi, "").trim().slice(0, 2).toUpperCase()
                  : profile?.display_name
                  ? profile.display_name.slice(0, 2).toUpperCase()
                  : "LĐ"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-extrabold text-slate-950">
                  {profile?.organization?.name || "Liên đội"}
                </h3>
                {profile?.organization?.code && (
                  <Badge variant="outline" className="text-emerald-800 border-emerald-300 bg-emerald-50 font-bold font-mono">
                    <Building className="h-3 w-3 mr-1 text-emerald-700" />
                    {profile.organization.code}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-slate-700 flex items-center gap-2 flex-wrap">
                <span>Người liên hệ / Phụ trách: <b className="text-slate-900 font-bold">{profile?.display_name || "—"}</b></span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="font-mono text-xs text-slate-600">SĐT đăng nhập: @{profile?.username}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Edit Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-700" />
              <CardTitle className="text-base">Thông tin chung</CardTitle>
            </div>
            <CardDescription>Cập nhật tên hiển thị của tài khoản</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Đơn vị trực thuộc (Cố định)</Label>
              <Input
                value={profile?.organization ? `${profile.organization.name} (${profile.organization.code})` : "Chưa gắn đơn vị"}
                disabled
                className="mt-1 bg-slate-100 font-bold text-xs text-slate-900 border-slate-200 cursor-not-allowed"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Tên đăng nhập (Số điện thoại)</Label>
              <Input value={profile?.username || ""} disabled className="mt-1 bg-slate-100 font-mono text-xs text-slate-900 border-slate-200 cursor-not-allowed" />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Họ và tên người phụ trách *</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nhập họ và tên người phụ trách"
                className="mt-1 font-medium"
              />
            </div>

            <Button onClick={handleUpdateProfile} disabled={updating} className="w-full gap-2">
              {updating && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Lưu thông tin
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
            </div>
            <CardDescription>Bảo vệ tài khoản bằng mật khẩu an toàn</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Mật khẩu mới (tối thiểu 6 ký tự) *</Label>
              <Input
                type="password"
                placeholder="Nhập mật khẩu mới"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Xác nhận mật khẩu mới *</Label>
              <Input
                type="password"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={updating || !newPassword}
              variant="outline"
              className="w-full gap-2 border-slate-300"
            >
              {updating && <Loader2 className="h-4 w-4 animate-spin" />}
              <KeyRound className="h-4 w-4" />
              Đổi mật khẩu
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* PWA App Information Card */}
      <Card className="border-emerald-800/60 bg-gradient-to-br from-[#0d341f] via-[#092817] to-[#061d10] text-white shadow-lg shadow-emerald-950/10 rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow">
                <img src="/huy-hieu-doi.png" alt="Huy hiệu Đội" className="h-full w-full object-contain" />
              </div>
              <div>
                <h4 className="font-semibold text-base text-white flex items-center gap-2">
                  Ứng dụng di động (PWA)
                  {isStandalone ? (
                    <Badge variant="outline" className="border-emerald-400/50 bg-emerald-500/20 text-emerald-300 text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Đã cài đặt
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-400/50 bg-emerald-500/20 text-emerald-300 text-[10px]">
                      Sẵn sàng cài đặt
                    </Badge>
                  )}
                </h4>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  {isStandalone
                    ? "Bạn đang sử dụng ứng dụng ở chế độ cài đặt màn hình chính (Standalone App) với hiệu năng tối ưu nhất."
                    : "Cài đặt trực tiếp website này thành ứng dụng trên điện thoại (iOS & Android) để mở nhanh từ màn hình chính và nhận thông báo đẩy tức thì."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {deferredPrompt && !isStandalone && (
                <Button
                  size="sm"
                  onClick={handle1ClickInstall}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold gap-1.5 shrink-0 text-xs shadow-md"
                >
                  <Download className="h-3.5 w-3.5" />
                  Cài đặt ngay
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGuideOpen(true)}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5 shrink-0 text-xs"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Hướng dẫn cài đặt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="pt-4 flex justify-end">
        <Button
          variant="destructive"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất khỏi hệ thống
        </Button>
      </div>

      {/* ============================================================ */}
      {/* PWA INSTALL INSTRUCTION MODAL DIALOG */}
      {/* ============================================================ */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border-emerald-900/40 shadow-2xl">
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-[#0c351f] via-[#092917] to-[#051c0e] text-white p-5 sm:p-6 shrink-0 relative">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-lg ring-2 ring-emerald-400/40">
                <img src="/huy-hieu-doi.png" alt="Huy hiệu Đội" className="h-full w-full object-contain" />
              </div>
              <div className="space-y-0.5">
                <DialogTitle className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  Hướng dẫn cài đặt ứng dụng
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                </DialogTitle>
                <DialogDescription className="text-xs text-emerald-200/90 leading-relaxed">
                  Cài đặt vào màn hình chính điện thoại hoặc máy tính để sử dụng mượt mà không cần mở trình duyệt.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
            {isStandalone && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-800">Ứng dụng đã được cài đặt!</p>
                  <p className="text-emerald-700 mt-0.5">
                    Thiết bị của bạn đang chạy ở chế độ App màn hình chính. Bạn có thể xem lại hướng dẫn bên dưới nếu muốn cài đặt thêm trên thiết bị khác.
                  </p>
                </div>
              </div>
            )}

            {deferredPrompt && !isStandalone && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
                <div className="text-xs">
                  <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <Download className="h-4 w-4 text-emerald-700" />
                    Cài đặt nhanh 1 chạm
                  </p>
                  <p className="text-emerald-700 mt-0.5">Trình duyệt đã sẵn sàng để cài đặt tự động.</p>
                </div>
                <Button
                  size="sm"
                  onClick={handle1ClickInstall}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs px-3 shadow"
                >
                  Cài đặt ngay
                </Button>
              </div>
            )}

            {/* Platform Tabs */}
            <Tabs
              value={activePlatform}
              onValueChange={(val) => setActivePlatform(val as any)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-xl h-auto">
                <TabsTrigger
                  value="ios"
                  className="py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="h-3.5 w-3.5 text-slate-700" />
                  iPhone / iOS
                </TabsTrigger>
                <TabsTrigger
                  value="android"
                  className="py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
                  Android
                </TabsTrigger>
                <TabsTrigger
                  value="desktop"
                  className="py-2 text-xs sm:text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Laptop className="h-3.5 w-3.5 text-blue-600" />
                  Máy tính
                </TabsTrigger>
              </TabsList>

              {/* iOS Content */}
              <TabsContent value="ios" className="space-y-3 mt-3 focus-visible:outline-none">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.2" />
                  <span>
                    <strong>Lưu ý:</strong> Trên iPhone/iPad, bạn cần mở liên kết này bằng trình duyệt <strong>Safari</strong> để hiển thị tùy chọn cài đặt vào Màn hình chính.
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Nhấn nút Chia sẻ (Share)
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Ở thanh công cụ dưới cùng của trình duyệt Safari, nhấn vào biểu tượng{" "}
                        <span className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-blue-600">
                          <Share className="h-3 w-3" /> Chia sẻ
                        </span>{" "}
                        (hình vuông có mũi tên hướng lên).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Chọn "Thêm vào MH chính"
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Cuộn danh sách menu tùy chọn xuống dưới và tìm chọn dòng{" "}
                        <span className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-slate-900">
                          <PlusSquare className="h-3 w-3 text-slate-700" /> Thêm vào MH chính
                        </span>{" "}
                        (Add to Home Screen).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Nhấn "Thêm" (Add)
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Nhấn nút <strong>Thêm</strong> ở góc trên bên phải màn hình. Biểu tượng ứng dụng Đội sẽ lập tức xuất hiện ngay trên màn hình chính của bạn!
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Android Content */}
              <TabsContent value="android" className="space-y-3 mt-3 focus-visible:outline-none">
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Mở bằng Chrome hoặc Cốc Cốc
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Mở liên kết website này bằng trình duyệt <strong>Google Chrome</strong>, <strong>Cốc Cốc</strong> hoặc <strong>Samsung Internet</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Nhấn vào Menu 3 chấm (⋮)
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Nhấn vào biểu tượng{" "}
                        <span className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-slate-900">
                          <MoreVertical className="h-3 w-3" /> Menu
                        </span>{" "}
                        ở góc trên cùng bên phải màn hình trình duyệt.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Chọn "Cài đặt ứng dụng"
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Chọn dòng <strong>"Cài đặt ứng dụng"</strong> (Install App) hoặc <strong>"Thêm vào Màn hình chính"</strong>. Sau đó nhấn <strong>Cài đặt</strong> để hoàn tất.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Desktop Content */}
              <TabsContent value="desktop" className="space-y-3 mt-3 focus-visible:outline-none">
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Mở bằng Chrome, Edge hoặc Cốc Cốc
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Truy cập website trên trình duyệt máy tính của bạn (Google Chrome, Microsoft Edge, Cốc Cốc hoặc Brave).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Nhấn biểu tượng Cài đặt trên thanh địa chỉ
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Ở phía bên phải của thanh địa chỉ URL (gần dấu trang ⭐), nhấn vào biểu tượng{" "}
                        <span className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-semibold text-emerald-800">
                          <Download className="h-3 w-3" /> Cài đặt ứng dụng
                        </span>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <div className="h-6 w-6 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-slate-900">
                        Xác nhận "Cài đặt"
                      </p>
                      <p className="text-slate-600 leading-relaxed">
                        Nhấn nút <strong>Cài đặt</strong> (Install). Ứng dụng sẽ hoạt động trong một cửa sổ riêng biệt như một phần mềm độc lập, không vướng thanh công cụ trình duyệt.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Benefits box */}
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 space-y-1.5 text-xs">
              <p className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                Lợi ích khi cài đặt ứng dụng:
              </p>
              <ul className="text-slate-600 space-y-1 pl-5 list-disc text-[11px] leading-relaxed">
                <li>Khởi động tức thì chỉ với 1 chạm từ màn hình điện thoại.</li>
                <li>Không chiếm nhiều dung lượng bộ nhớ thiết bị (&lt; 2MB).</li>
                <li>Nhận thông báo đẩy trực tiếp khi có đợt đánh giá mới và khi minh chứng được duyệt.</li>
                <li>Giao diện tràn viền toàn màn hình, không bị che khuất bởi thanh địa chỉ web.</li>
              </ul>
            </div>
          </div>

          {/* Modal Footer */}
          <DialogFooter className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <Button
              variant="default"
              onClick={() => setGuideOpen(false)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs w-full sm:w-auto"
            >
              Đã hiểu, đóng lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
