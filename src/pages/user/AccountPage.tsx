import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
      <Card className="border-slate-200">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-16 w-16 bg-blue-600 text-white text-lg font-bold">
              <AvatarFallback className="bg-blue-700 text-white">
                {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "LĐ"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">{profile?.display_name}</h3>
                <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
                  <Building className="h-3 w-3 mr-1" />
                  Liên đội
                </Badge>
              </div>
              <p className="text-xs font-mono text-muted-foreground">
                Tên đăng nhập: @{profile?.username}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Edit Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-base">Thông tin chung</CardTitle>
            </div>
            <CardDescription>Cập nhật tên hiển thị của tài khoản</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Tên đăng nhập (Cố định)</Label>
              <Input value={profile?.username || ""} disabled className="mt-1 bg-slate-50 font-mono text-xs" />
            </div>

            <div>
              <Label className="text-xs">Họ và tên hiển thị *</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1"
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
      <Card className="border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow">
                <img src="/huy-hieu-doi.png" alt="Huy hiệu Đội" className="h-full w-full object-contain" />
              </div>
              <div>
                <h4 className="font-semibold text-base text-white flex items-center gap-2">
                  Ứng dụng di động (PWA)
                  <Badge variant="outline" className="border-emerald-400/50 bg-emerald-500/20 text-emerald-300 text-[10px]">
                    Sẵn sàng
                  </Badge>
                </h4>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  Bạn có thể cài đặt trực tiếp website này thành ứng dụng trên điện thoại (iOS & Android) để mở nhanh từ màn hình chính và nhận thông báo đẩy tức thì.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const isStandalone =
                  window.matchMedia("(display-mode: standalone)").matches ||
                  (window.navigator as any).standalone === true;
                if (isStandalone) {
                  toast.success("Ứng dụng đã được cài đặt và đang chạy ở chế độ App.");
                } else {
                  toast.info("Trên iPhone: Chọn Chia sẻ (Share) > Thêm vào MH chính. Trên Android: Chọn Cài đặt ứng dụng từ menu trình duyệt.");
                }
              }}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 gap-1.5 shrink-0 text-xs"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Hướng dẫn cài đặt
            </Button>
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
    </div>
  );
}
