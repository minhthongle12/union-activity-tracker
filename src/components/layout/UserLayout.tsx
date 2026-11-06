import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Calendar,
  FolderOpen,
  Award,
  Trophy,
  Bell,
  User,
  Menu,
  X,
  LogOut,
  Building,
  RotateCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  { to: "/user", icon: LayoutDashboard, label: "Tổng quan", end: true },
  { to: "/user/criteria", icon: Calendar, label: "Đợt đánh giá" },
  { to: "/user/bonus", icon: Award, label: "Điểm cộng" },
  { to: "/user/results", icon: Trophy, label: "Kết quả đánh giá" },
  { to: "/user/notifications", icon: Bell, label: "Thông báo" },
  { to: "/user/evidence", icon: FolderOpen, label: "Kho minh chứng" },

  { to: "/user/account", icon: User, label: "Tài khoản" },
];

export function UserLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  // Listen to realtime notifications
  useRealtimeNotifications();

  const { data: unreadCount } = useQuery({
    queryKey: ["unread_notifications_user", profile?.id],
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

  // Fallback query for organization if not yet joined in profile
  const { data: orgData } = useQuery({
    queryKey: ["user_layout_org", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", profile.organization_id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.organization_id,
    initialData: profile?.organization ?? undefined,
  });

  const organization = profile?.organization || orgData;

  const queryClient = useQueryClient();
  const [isReloading, setIsReloading] = useState(false);

  const handleGlobalReload = async () => {
    setIsReloading(true);
    try {
      await queryClient.invalidateQueries();
      toast.success("Đã cập nhật dữ liệu mới nhất!");
    } catch {
      toast.error("Không thể làm mới dữ liệu. Vui lòng thử lại!");
    } finally {
      setTimeout(() => setIsReloading(false), 500);
    }
  };

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
                HỘI ĐỒNG ĐỘI
              </span>
              <span
                className="text-[10px] text-[#cbf082] font-semibold truncate block max-w-full"
                title={organization?.name ? organization.name : "Xã Bến Lức • Liên đội"}
              >
                {organization?.name ? organization.name : "Xã Bến Lức • Liên đội"}
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
            Menu Liên đội
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
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
            );
          })}
        </div>

        {/* Sidebar footer user badge */}
        <div className="p-3 border-t border-[#39722c]/70 bg-[#12330f]/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-9 w-9 border border-[#a2d43a]/60 bg-gradient-to-br from-[#8ec228] to-[#6da21a] text-[#0e2c08] shrink-0 shadow-xs">
              <AvatarFallback className="bg-gradient-to-br from-[#8ec228] to-[#6da21a] text-xs font-black text-[#0e2c08]">
                {organization?.name
                  ? organization.name.replace(/Liên đội|Trường/gi, "").trim().slice(0, 2).toUpperCase()
                  : profile?.display_name
                  ? profile.display_name.slice(0, 2).toUpperCase()
                  : "LĐ"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight block" title={organization?.name || "Liên đội"}>
                {organization?.name || "Liên đội"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className="text-[11px] text-[#c5ec82] truncate font-medium block">
                  {profile?.display_name || `@${profile?.username}`}
                </span>
                {organization?.code && (
                  <span className="text-[9px] font-mono font-bold px-1 rounded bg-[#285e1f] text-[#cbf082] border border-[#4c8d3d] shrink-0">
                    {organization.code}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-[#cbf082] hover:text-red-300 hover:bg-[#346b2b]/80 h-8 w-8 rounded-lg shrink-0"
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
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-emerald-900 hover:bg-emerald-50 h-9 w-9 shrink-0"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="hidden sm:block">
                <Breadcrumbs />
              </div>
              {/* Unit name badge for Mobile Header */}
              {organization?.name && (
                <div
                  className="flex sm:hidden items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50/90 border border-emerald-200/80 text-[11px] font-bold text-emerald-950 max-w-[170px] truncate"
                  title={`${organization.name} (${organization.code || ""})`}
                >
                  <Building className="h-3 w-3 text-emerald-700 shrink-0" />
                  <span className="truncate">{organization.name.replace(/Liên đội Trường|Liên đội/gi, "").trim()}</span>
                  {organization.code && (
                    <span className="text-[9px] font-mono font-bold text-emerald-700 shrink-0">
                      [{organization.code}]
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Unit name badge on desktop navbar */}
              {organization?.name && (
                <div
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-xs font-semibold text-emerald-950 shadow-2xs max-w-[260px] md:max-w-[360px]"
                  title={`${organization.name} (${organization.code || ""})`}
                >
                  <div className="h-5 w-5 rounded-md bg-emerald-600/10 flex items-center justify-center shrink-0">
                    <Building className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                  </div>
                  <span className="truncate font-bold text-slate-900">{organization.name}</span>
                  {organization.code && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono font-bold bg-emerald-200/70 text-emerald-900 shrink-0 border-0">
                      {organization.code}
                    </Badge>
                  )}
                </div>
              )}

              {/* Reload latest data button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGlobalReload}
                disabled={isReloading}
                title="Làm mới dữ liệu mới nhất từ máy chủ"
                className="relative text-slate-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl h-9 w-9 cursor-pointer"
              >
                <RotateCw className={cn("h-4 w-4 text-emerald-800 transition-all", isReloading && "animate-spin text-emerald-600")} />
              </Button>

              <NavLink to="/user/notifications">
                <Button variant="ghost" size="icon" className="relative text-slate-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl h-9 w-9">
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
                  <Button variant="ghost" className="flex items-center gap-2 pl-1.5 pr-2.5 h-9 rounded-xl hover:bg-emerald-50 border border-emerald-200/60">
                    <Avatar className="h-7 w-7 bg-emerald-600 text-white text-xs font-semibold shrink-0">
                      <AvatarFallback className="bg-emerald-600 text-white font-bold">
                        {profile?.display_name ? profile.display_name.slice(0, 2).toUpperCase() : "LĐ"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline text-xs font-bold text-slate-900 truncate max-w-[150px]">
                      {profile?.display_name || "Liên đội"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-xl border-emerald-100 shadow-lg">
                  <DropdownMenuLabel className="pb-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                      <Building className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate">{organization?.name || "Tài khoản Đơn vị"}</span>
                    </div>
                    <div className="text-[11px] font-medium text-slate-600 mt-0.5">
                      Phụ trách: <b className="text-slate-900">{profile?.display_name}</b>
                    </div>
                  </DropdownMenuLabel>
                  <div className="px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
                    SĐT: @{profile?.username || "user"}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/user/account")} className="cursor-pointer">
                    <User className="h-4 w-4 mr-2 text-emerald-600" />
                    Hồ sơ tài khoản
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

        {/* Mobile Bottom Navigation Bar (PWA Style - iOS Home indicator safe) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 flex items-center justify-around px-1 py-1 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] shadow-lg">
          <NavLink
            to="/user"
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
            to="/user/criteria"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <Calendar className="h-5 w-5 mb-0.5" />
            <span>Đợt đánh giá</span>
          </NavLink>

          <NavLink
            to="/user/bonus"
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

          <NavLink
            to="/user/results"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <Trophy className="h-5 w-5 mb-0.5" />
            <span>Kết quả</span>
          </NavLink>

          <NavLink
            to="/user/notifications"
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all relative",
                isActive ? "text-emerald-700 bg-emerald-50 font-bold" : "text-slate-500 hover:text-emerald-800"
              )
            }
          >
            <div className="relative">
              <Bell className="h-5 w-5 mb-0.5" />
              {(unreadCount ?? 0) > 0 && (
                <span className="absolute -top-1 -right-2 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white shadow-2xs">
                  {unreadCount! > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <span>Thông báo</span>
          </NavLink>
        </nav>

        {/* PWA Install Banner */}
        <PWAInstallPrompt />
      </div>
    </div>
  );
}
export default UserLayout;

