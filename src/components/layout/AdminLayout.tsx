import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  ClipboardList,
  FileSpreadsheet,
  CheckSquare,
  Award,
  BarChart3,
  Bell,
  History,
  Settings,
  Menu,
  X,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Tổng quan", end: true },
  { to: "/admin/periods", icon: Calendar, label: "Đợt đánh giá" },
  { to: "/admin/review", icon: CheckSquare, label: "Thẩm định & xác thực" },
  { to: "/admin/bonus", icon: Award, label: "Điểm cộng" },
  { to: "/admin/criteria", icon: ClipboardList, label: "Bộ tiêu chí" },
  { to: "/admin/import-export", icon: FileSpreadsheet, label: "Import / Export Excel" },
  { to: "/admin/reports", icon: BarChart3, label: "Báo cáo & thống kê" },
  { to: "/admin/notifications", icon: Bell, label: "Thông báo" },
  { to: "/admin/audit-logs", icon: History, label: "Nhật ký hoạt động" },
  { to: "/admin/organizations", icon: Building2, label: "Quản lý đơn vị" },
  { to: "/admin/users", icon: Users, label: "Quản lý tài khoản" },
  { to: "/admin/settings", icon: Settings, label: "Cài đặt hệ thống" },
];

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  // Listen to realtime notifications
  useRealtimeNotifications();

  const { data: unreadCount } = useQuery({
    queryKey: ["unread_notifications_admin", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("is_read", false);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#f7faf7] flex flex-col md:flex-row">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-emerald-950/60 backdrop-blur-xs md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/* Sidebar - Warm & friendly Lá Mạ Non green theme */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-gradient-to-b from-[#245b1f] via-[#1b4717] to-[#123510] text-emerald-100 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 shadow-xl border-r border-[#3a752d]/60 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand header */}
        <div className="h-16 px-3 sm:px-4 flex items-center justify-between border-b border-[#3d7a2f]/70 bg-gradient-to-r from-[#7cb324]/25 via-[#6fa01c]/15 to-transparent backdrop-blur-sm shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-xl bg-white/95 p-1 flex items-center justify-center shrink-0 shadow-sm ring-2 ring-[#aacf44]/50">
              <img
                src="/huy-hieu-doi.png"
                alt="Huy hiệu Đội"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-black text-sm tracking-wide text-white leading-tight truncate">
                CÔNG TÁC ĐỘI
              </span>
              <span className="text-[10px] text-[#cbf082] font-semibold truncate">
                Hệ thống Quản lý
              </span>
            </div>
          </div>
          <button
            className="md:hidden text-[#cbf082] hover:text-white p-1.5 rounded-lg shrink-0 hover:bg-[#346b2a]/70 transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-[#bce866] uppercase tracking-wider">
            Quản trị hệ thống
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isInfrequentSection = item.to === "/admin/organizations";
            return (
              <div key={item.to}>
                {isInfrequentSection && (
                  <div className="pt-3 pb-1 px-3">
                    <div className="border-t border-[#3d7a2f]/70 mb-2" />
                    <span className="text-[10px] font-bold text-[#bce866]/80 uppercase tracking-wider">
                      Cấu hình & Tổ chức
                    </span>
                  </div>
                )}
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150",
                      isActive
                        ? "bg-gradient-to-r from-[#a2d43a] to-[#88bc26] text-[#0e2c08] shadow-md shadow-black/20 font-bold ring-1 ring-[#c5ee64]"
                        : "text-[#ddf2bc] hover:bg-[#326928]/70 hover:text-white"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#0e2c08]" : "text-[#b4e45c]")} />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </div>
            );
          })}
        </div>

        {/* Sidebar footer user badge */}
        <div className="p-3 border-t border-[#39722c]/70 bg-[#12330f]/80 shrink-0">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border border-[#a2d43a]/60 bg-gradient-to-br from-[#8ec228] to-[#6da21a] text-[#0e2c08]">
              <AvatarFallback className="bg-gradient-to-br from-[#8ec228] to-[#6da21a] text-xs font-black text-[#0e2c08]">
                {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "AD"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.display_name || "Quản trị viên"}
              </p>
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-[#4c8d3d] text-[#cbf082] bg-[#285e1f]">
                <ShieldCheck className="h-3 w-3 mr-0.5 inline" /> Admin
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-[#cbf082] hover:text-red-300 hover:bg-[#326928]/70 h-8 w-8 rounded-lg"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar - Safe area padded for iOS notch / Dynamic Island */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-emerald-100 shadow-2xs pt-[env(safe-area-inset-top,0px)]">
          <div className="h-14 sm:h-16 px-3 sm:px-4 md:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-emerald-900 hover:bg-emerald-50 h-9 w-9"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Breadcrumbs />
            </div>

            <div className="flex items-center gap-3">
            <NavLink to="/admin/notifications">
              <Button variant="ghost" size="icon" className="relative text-slate-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl">
                <Bell className="h-5 w-5" />
                {(unreadCount ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow-xs">
                    {unreadCount! > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </NavLink>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-3 h-9 rounded-xl hover:bg-emerald-50 border border-emerald-100/60">
                  <Avatar className="h-7 w-7 bg-emerald-600 text-white text-xs font-semibold">
                    <AvatarFallback className="bg-emerald-600 text-white">
                      {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "AD"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-semibold text-slate-800 hidden sm:inline">
                    {profile?.display_name || "Admin"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl border-emerald-100 shadow-lg">
                <DropdownMenuLabel className="text-emerald-900 font-semibold">Tài khoản Quản trị</DropdownMenuLabel>
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  @{profile?.username || "admin"}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/admin/settings")} className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2 text-emerald-600" />
                  Cài đặt hệ thống
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar (Admin PWA Style - iOS Safe) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 flex items-center justify-around px-1 py-1 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] shadow-lg">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <LayoutDashboard className="h-5 w-5 mb-0.5" />
            <span>Tổng quan</span>
          </NavLink>

          <NavLink
            to="/admin/review"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <CheckSquare className="h-5 w-5 mb-0.5" />
            <span>Thẩm định</span>
          </NavLink>

          <NavLink
            to="/admin/periods"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <Calendar className="h-5 w-5 mb-0.5" />
            <span>Đợt ĐG</span>
          </NavLink>

          <NavLink
            to="/admin/bonus"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <Award className="h-5 w-5 mb-0.5" />
            <span>Điểm cộng</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium text-slate-500 hover:text-emerald-800 transition-all"
          >
            <Menu className="h-5 w-5 mb-0.5" />
            <span>Menu thêm</span>
          </button>
        </nav>

        {/* PWA Install Banner */}
        <PWAInstallPrompt />
      </div>
    </div>
  );
}
export default AdminLayout;

