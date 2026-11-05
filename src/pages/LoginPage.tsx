import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, session, profile } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect
  if (session && profile) {
    const dest = profile.role === "admin" ? "/admin" : "/user";
    navigate(dest, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Vui lòng nhập tên đăng nhập và mật khẩu.");
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-[#f4faf5] to-lime-50/60 px-4 py-6 sm:py-10 relative overflow-hidden text-slate-900">
      {/* Decorative background glow */}
      <div className="absolute -top-32 -left-32 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-emerald-200/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-lime-200/40 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm sm:max-w-md relative z-10">
        {/* Logo / Brand - Nhỏ gọn, cân đối, responsive mượt mà */}
        <div className="text-center mb-5 sm:mb-7">
          <div className="inline-flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-white shadow-md shadow-emerald-950/10 p-2 sm:p-2.5 mb-3 border border-emerald-200 ring-4 ring-emerald-100/60">
            <img
              src="/huy-hieu-doi.png"
              alt="Huy hiệu Đội TNTP Hồ Chí Minh"
              className="h-full w-full object-contain max-h-12 max-w-12 sm:max-h-16 sm:max-w-16"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight uppercase">
            Hội đồng Đội xã Bến Lức
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Hệ thống Quản lý Công tác Đội & Đánh giá thi đua
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl shadow-emerald-950/5 border-emerald-200/80 rounded-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-3 sm:pb-4 px-4 sm:px-6 pt-5 sm:pt-6">
            <CardTitle className="text-lg sm:text-xl font-bold text-slate-950">Đăng nhập</CardTitle>
            <CardDescription className="text-xs sm:text-sm text-slate-600">
              Nhập thông tin tài khoản để truy cập hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs sm:text-sm font-bold text-slate-900">
                  Tên đăng nhập
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                  className="rounded-xl border-emerald-200 focus-visible:ring-emerald-600 text-xs sm:text-sm h-10 font-medium text-slate-950"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs sm:text-sm font-bold text-slate-900">
                  Mật khẩu
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    className="pr-10 rounded-xl border-emerald-200 focus-visible:ring-emerald-600 text-xs sm:text-sm h-10 font-medium text-slate-950"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-10 sm:h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-md shadow-emerald-900/20 transition-all text-xs sm:text-sm"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Đang đăng nhập...
                  </>
                ) : (
                  "Đăng nhập"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 font-medium mt-5">
          © 2026 Hệ thống Quản lý Công tác Đội
        </p>
      </div>
    </div>
  );
}
